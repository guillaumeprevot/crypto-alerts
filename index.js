const fs = require('fs')
const http = require('http')
const https = require('https')
const express = require('express')
const webpush = require('web-push')
const cmc = require('./coinmarketcap')
const app = express()
const name = 'Crypto!'
const webpushSubscriptions = {}

// This is the application configuration based on environment variables
const config = {
	dev: process.env.NODE_ENV === 'development', // 'production' or undefined otherwise
	port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
	httpsKey: process.env.HTTPS_KEY || '', // /path/to/privkey.pem
	httpsCert: process.env.HTTPS_CERT || '', // /path/to/cert.pem
	cmcAPIKey: process.env.CMC_API_KEY || '', // API key for CoinMarketCap https://coinmarketcap.com/api/features
	vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
	vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
}

// This is a *very* simple log interface
const log = {
	error: (text) => console.error(text),
	warn: (text) => console.log(text),
	info: (text) => console.log(text),
	trace: (text) => config.dev && console.log(text),
}

if (!config.dev && (!config.httpsKey || !config.httpsCert)) {
	log.error("Missing HTTPS_KEY and HTTPS_CERT environment variables.");
	process.exit(1);
}

if (!config.cmcAPIKey) {
	log.error("Missing CMC_API_KEY environment variable.");
	log.error("Go to https://coinmarketcap.com/api/features to get one.");
	process.exit(2);
}

if (!config.vapidPublicKey || !config.vapidPrivateKey) {
	let keyPair = webpush.generateVAPIDKeys();
	log.error("Missing VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.");
	log.error("You can use these newly generated keys:");
	log.error("- VAPID_PUBLIC_KEY: " + keyPair.publicKey);
	log.error("- VAPID_PRIVATE_KEY: " + keyPair.privateKey);
	process.exit(3);
} else {
	// Set the keys used for encrypting the push messages.
	webpush.setVapidDetails(
		'https://serviceworke.rs/',
		config.vapidPublicKey,
		config.vapidPrivateKey
	);
}

cmc.onerror = log.error;

// Starting
log.info(`${name} is starting...`)

// Serve static files from "webapp" folder
app.use(express.static('webapp'))

// Auto-parse JSON request
app.use(express.json())

// Redirect / to the main page
app.get('/', (_req, res) => res.redirect('/index.html'));

// Web-push subscription management
app.get('/subscription/key', (req, res) => {
	res.send(process.env.VAPID_PUBLIC_KEY);
})

app.get('/subscription/test', (req, res) => {
	let payload = JSON.stringify({ title: name, message: 'Hello World!' });
	Object.values(webpushSubscriptions).forEach((subscription) => {
		webpush.sendNotification(subscription, payload)
			.then(function() {
				console.log('Push Application Server - Notification sent to ' + subscription.endpoint);
			})
			.catch(function() {
				console.log('ERROR in sending Notification, endpoint removed ' + subscription.endpoint);
				delete webpushSubscriptions[subscription.endpoint];
			});
	});
	res.send("");
})

app.post('/subscription/register', (req, res) => {
	var subscription = req.body.subscription;
	if (!webpushSubscriptions[subscription.endpoint]) {
		log.info('Subscription registered ' + subscription.endpoint);
		webpushSubscriptions[subscription.endpoint] = subscription;
	}
	res.sendStatus(201);
})

app.post('/subscription/unregister', (req, res) => {
	var subscription = req.body.subscription;
	if (webpushSubscriptions[subscription.endpoint]) {
		log.info('Subscription unregistered ' + subscription.endpoint);
		delete webpushSubscriptions[subscription.endpoint];
	}
	res.sendStatus(201);
});

// Create HTTP or HTTPS server, instead of app.listen
// app.listen(config.port, () => { ... })
var server;
if (config.httpsCert) {
	server = https.createServer({
		key: fs.readFileSync(config.httpsKey),
		cert: fs.readFileSync(config.httpsCert)
	}, app);
} else {
	server = http.createServer(app);
}
server.listen(config.port, () => {
	log.info(`${name} has started on port ${config.port}.`)
})

// Gracefully stop the server when receiving the SIGTERM signal
process.on('SIGTERM', () => {
	log.info(`${name} is stopping (SIGTERM)...`)
	server.close(() => {
		log.info(`${name} has stopped.`)
	})
})
