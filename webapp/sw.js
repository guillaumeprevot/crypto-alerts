const version = 1;
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
		.then(() => { info('new cache created'); })
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