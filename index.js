const fs = require('fs')
const http = require('http')
const https = require('https')
const express = require('express')
const webpush = require('web-push')
//const CryptoSource = require('./app/source-cmc')
const CryptoSource = require('./app/source-test')
const CryptoModel = require('./app/model')

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
	prefix: () => config.dev ? '> ' : (new Date().toISOString() + ' | '),
	error: (text) => console.error(log.prefix() + text),
	warn: (text) => console.log(log.prefix() + text),
	info: (text) => console.log(log.prefix() + text),
	trace: (text) => config.dev && console.log(log.prefix() + text),
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

const app = express()
const name = 'Crypto!'
const subscriptions = {}
const source = new CryptoSource(config.cmcAPIKey, 'USDT', log.error);
const model = new CryptoModel(source);

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

app.post('/subscription/register', (req, res) => {
	var subscription = req.body.subscription;
	if (!subscriptions[subscription.endpoint]) {
		log.info('Subscription registered ' + subscription.endpoint);
		subscriptions[subscription.endpoint] = subscription;
	}
	res.sendStatus(201);
})

app.post('/subscription/unregister', (req, res) => {
	var subscription = req.body.subscription;
	if (subscriptions[subscription.endpoint]) {
		log.info('Subscription unregistered ' + subscription.endpoint);
		delete subscriptions[subscription.endpoint];
	}
	res.sendStatus(201);
})

app.get('/subscription/test', (req, res) => {
	model.addAlert({ symbol: 'BTC', operator: 'higher', threshold: 43000 });
	res.send("");
})

model.listEntries().then(() => model.quoteEntries((activation) => {
	let payload = JSON.stringify({ title: name, activation: activation });
	log.info('Push notification for ' + activation.symbol + ' at ' + activation.price);
	Object.values(subscriptions).forEach((subscription) => {
		webpush.sendNotification(subscription, payload)
			.then(function() {
				log.trace('Push notification sent to ' + subscription.endpoint);
			})
			.catch(function() {
				log.error('ERROR in sending push notification to ' + subscription.endpoint);
				delete subscriptions[subscription.endpoint];
			});
	});
}))

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
		try { clearTimeout(model.quoteTimeout); } catch (error) { console.log(error); }
		log.info(`${name} has stopped.`)
	})
})
