const version = 4;
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
		.then(() => { info(`new cache ${cacheName} created`); })
	);
});

/* Clean any previous cache */
self.addEventListener('activate', (e) => {
	info('activated');
	e.waitUntil(caches.keys()
		.then((keys) => Promise.all(keys.map(function(key) {
			if (key !== cacheName) {
				info(`old cache ${key} deleted`);
				return caches.delete(key);
			}
		})))
		.then(() => clients.claim())
	);
});

/* Serve cached content when available */
self.addEventListener('fetch', (e) => {
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
	event.waitUntil(notifyUntilClicked(payload.title, payload.message));
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
	console.log('Subscription expired');
	event.waitUntil(
		self.registration.pushManager.subscribe({ userVisibleOnly: true })
		.then(function(subscription) {
			console.log('Subscribed after expiration', subscription.endpoint);
			return fetch('register', {
				method: 'post',
				headers: {
					'Content-type': 'application/json'
				},
				body: JSON.stringify({
					endpoint: subscription.endpoint
				})
			});
		})
	);
});