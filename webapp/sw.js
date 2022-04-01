const version = 5;
const cacheName = 'crypto-alerts-' + version;
const cacheContent = [
	'/',
	'/index.html',
	'/app.js',
	'/style.css',
	'/favicon.ico'
];

function info(text) {
	console.log(`Service Worker : ${text}`);
}

function trace(text) {
	// console.log(`Service Worker : ${text}`);
}

/* Start the service worker and cache all of the app's content */
self.addEventListener('install', (e) => {
	info('installed');
	self.skipWaiting();
	e.waitUntil(caches.open(cacheName)
		.then((cache) => cache.addAll(cacheContent))
		.then(() => info(`created cache ${cacheName}`))
	);
});

/* Clean any previous cache */
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

/* Serve cached content when available */
self.addEventListener('fetch', (e) => {
	// TODO use 'network-or-cache' strategy instead ?
	// https://github.com/mdn/serviceworker-cookbook/blob/master/strategy-network-or-cache/service-worker.js
	trace('fetching ' + e.request.url);
	e.respondWith(caches.match(e.request)
		.then((response) => response || fetch(e.request))
	);
});

self.addEventListener('message', (e) => {
	if (e.data === 'notify') {
		self.registration.showNotification('Notify from SW', {
			body: 'Buzz! Buzz!',
			icon: '/icons/icon-192.png',
			vibrate: [200, 100, 200, 100, 200, 100, 200],
			tag: 'vibration-sample'
		});
	}
});

self.addEventListener('notificationclick', (e) => {
	self.clients.matchAll().then(function(clients) {
		clients.forEach((c) => c.postMessage('notificationclick'));
	});
});

//======= PUSH NOTIFICATIONS =======

self.addEventListener('push', function(event) {
	let payload = event.data.json();
	let title = payload.title;
	let symbol = payload.activation.symbol;
	let price = payload.activation.price;
	let time = new Date(payload.activation.activation).toLocaleTimeString();
	let message = `${symbol} à ${price} USDT depuis ${time}`;
	event.waitUntil(notifyUntilClicked(title, message).then(() => {
		return self.clients.matchAll().then(function(clients) {
			clients.forEach((c) => c.postMessage({
				type: 'push',
				activation: payload.activation
			}));
		});
	}));
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
	info('subscription expired');
	event.waitUntil(
		self.registration.pushManager.subscribe({ userVisibleOnly: true })
		.then(function(subscription) {
			info('subscription renewed');
			return fetch('/subscription/register', {
				method: 'post',
				headers: {
					'Content-type': 'application/json'
				},
				body: JSON.stringify({
					subscription: subscription
				})
			});
		})
	);
});