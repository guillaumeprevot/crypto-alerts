const version = 7;
const cacheName = 'crypto-alerts-' + version;
const cacheContent = [
	'/',
	'/index.html',
	'/app.js',
	'/style.css',
	'/favicon.ico',
	'https://code.jquery.com/jquery-3.6.0.min.js',
	'https://cdn.jsdelivr.net/npm/@popperjs/core@2.10.2/dist/umd/popper.min.js',
	'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css',
	'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.min.js'
];

function info(text) {
	console.log(`Service Worker : ${text}`);
}

function trace(text) {
	// console.log(`Service Worker : ${text}`);
}

// get ressource from server but fail if response is not fast enough
function fromNetworkWithTimeout(request, timeout) {
	return new Promise(function(resolve, reject) {
		// Reject in case of timeout.
		var timeoutId = setTimeout(() => {
			timeoutId = null;
			reject('timeout');
		}, timeout);
		fetch(request).then((response) => {
			// Fulfill in case of success (and if timeout has not occurred yet)
			if (timeoutId) {
				clearTimeout(timeoutId);
				resolve(response);
			}
		}, () => {
			// Reject if network fetch fails (and if timeout has not occurred yet)
			if (timeoutId) {
				clearTimeout(timeoutId);
				reject('network-failure');
			}
		});
	});
}

// get ressource from cache and fail if no matching cache is found
function fromCache(request) {
	return caches.open(cacheName)
		.then((cache) => cache.match(request))
		.then((matching) => matching || Promise.reject('no-match'));
}

// auto-activate & create new cache as soon as the SW is installed
self.addEventListener('install', (e) => {
	info('installed');
	self.skipWaiting();
	e.waitUntil(caches.open(cacheName)
		.then((cache) => cache.addAll(cacheContent))
		.then(() => info(`created cache ${cacheName}`))
	);
});

// delete old caches and claim clients as soon as the SW is activated
self.addEventListener('activate', (e) => {
	info('activated');
	e.waitUntil(caches.keys()
		.then((keys) => keys.filter((key) => key !== cacheName))
		.then((keys) => keys.map((key) => caches.delete(key)))
		.then((promises) => Promise.all(promises))
		.then(() => info('deleted old caches'))
		.then(() => clients.claim())
	);
});

// serve content from server first, or from cache if too long, or fail
self.addEventListener('fetch', (e) => {
	trace('fetching ' + e.request.url);
	// https://github.com/mdn/serviceworker-cookbook/blob/master/strategy-network-or-cache/service-worker.js
	e.respondWith(fromNetworkWithTimeout(e.request, 400)
		.catch(() => fromCache(e.request))
	);
});

self.addEventListener('push', function(event) {
	let payload = event.data.json();
	let title = payload.title;
	let symbol = payload.activation.symbol;
	let price = payload.activation.price.toFixed(5);
	let time = new Date(payload.activation.activation).toLocaleTimeString();
	let message = `${symbol} à ${price} USDT depuis ${time}`;
	event.waitUntil(notifyUntilClicked(title, message)
		.then(() => self.clients.matchAll())
		.then((clients) => {
			let message = {
				type: 'push',
				activation: payload.activation
			};
			clients.forEach((c) => c.postMessage(message));
		})
	);
});

let notifyTimeout = null;

function notifyUntilClicked(title, message) {
	return self.registration.showNotification(title, {
		body: message,
		icon: '/icons/icon-192.png',
		vibrate: [600, 200, 600],
		requireInteraction: true,
		renotify: true,
		tag: 'crypto-vibration'
	}).then(() => {
		notifyTimeout = setTimeout(() => notifyUntilClicked(title, message), 3000);
	});
}

self.addEventListener('notificationclick', (e) => {
	if (notifyTimeout !== null) {
		clearTimeout(notifyTimeout);
		notifyTimeout = null;
	}
});

self.addEventListener('pushsubscriptionchange', function(event) {
	// https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event
	// Firefox does not support "event.oldSubscription", hence the first "fetch" to retrieve the key
	// Event is not easy to test and old methods (like block and allow notifications) does not work either
	info('subscription changed');
	event.waitUntil(async function () {
		// Get the server's public key
		const response = await fetch('/subscription/key');
		const vapidPublicKey = await response.text();
		const subscription = await self.registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: vapidPublicKey
		});
		info('subscription renewed');
		return fetch('/subscription/register', {
			method: 'post',
			headers: {
				'Content-type': 'application/json'
			},
			body: JSON.stringify({
				subscription: subscription
			})
		})
	});
});