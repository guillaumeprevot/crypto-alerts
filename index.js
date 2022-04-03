const fs = require('fs')
const fsPromises = require('fs/promises')
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

// Check HTTP configuration
if (!config.dev && (!config.httpsKey || !config.httpsCert)) {
	log.error("Missing HTTPS_KEY and HTTPS_CERT environment variables.");
	process.exit(1);
}

// Check CoinMarketCap API key configuration
if (!config.cmcAPIKey) {
	log.error("Missing CMC_API_KEY environment variable.");
	log.error("Go to https://coinmarketcap.com/api/features to get one.");
	process.exit(2);
}

// Check VAPID key pair configuration
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

function loadData() {
	// https://nodejs.org/dist/latest-v16.x/docs/api/fs.html#fspromisesreadfilepath-options
	let filename = 'database.json';
	if (!fs.existsSync(filename)) {
		log.info(`Database file '${filename}' does not exist.`);
		return Promise.resolve();
	}
	return fsPromises.readFile(filename, { encoding: 'utf8' })
		.then((content) => {
			const data = JSON.parse(content);
			log.info(`Loading ${data.alerts.length} alert(s) and ${data.subscriptions.length} subscription(s) from '${filename}'`);
			data.subscriptions.forEach((subscription) => {
				subscriptions[subscription.endpoint] = subscription;
			});
			return Promise.all(data.alerts.map((a) => model.addAlert(a)));
		})
		.catch((err) => {
			log.warn(`Error loading data from '${filename}': ${err}`);
		});
}

function saveData() {
	// https://nodejs.org/dist/latest-v16.x/docs/api/fs.html#fspromiseswritefilefile-data-options
	let filename = 'database.json';
	let data = {
		subscriptions: Object.values(subscriptions),
		alerts: model.alerts
	};
	return fsPromises.writeFile(filename, JSON.stringify(data), { encoding: 'utf8' })
		.then(() => {
			log.info(`Saved ${data.alerts.length} alert(s) and ${data.subscriptions.length} subscription(s) to '${filename}'`);
		})
		.catch((err) => {
			log.error(`Error saving data to '${filename}': ${err}`);
		});
}

function sendNotification(activation) {
	let payload = JSON.stringify({ title: name, activation: activation });
	log.info(`Push notification for ${activation.symbol} at ${activation.price}`);
	Object.values(subscriptions).forEach((subscription) => {
		webpush.sendNotification(subscription, payload)
			.then(() => {
				log.trace('Push notification sent to ' + subscription.endpoint);
			})
			.catch(() => {
				log.error('ERROR in sending push notification to ' + subscription.endpoint);
				delete subscriptions[subscription.endpoint];
			});
	});
}

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
		// Trace operation
		log.info('Subscription registered ' + subscription.endpoint);
		// Register subscription
		subscriptions[subscription.endpoint] = subscription;
		// Save data, including subscriptions
		saveData();
	}
	res.sendStatus(201);
})

app.post('/subscription/unregister', (req, res) => {
	var subscription = req.body.subscription;
	if (subscriptions[subscription.endpoint]) {
		// Trace operation
		log.info('Subscription unregistered ' + subscription.endpoint);
		// Unregister subscription
		delete subscriptions[subscription.endpoint];
		// Save data, including subscriptions
		saveData();
	}
	res.sendStatus(201);
})

app.get('/cryptos.json', (req, res) => model.listEntries().then((entries) => res.json(entries)));

app.post('/alert/add', (req, res) => {
	// Extract only the needed properties from body
	let { symbol, operator, threshold, expiration, vibration, notification } = req.body;
	// Check request
	if (typeof symbol !== 'string' || typeof operator !== 'string'
		|| typeof threshold !== 'number' || typeof vibration !== 'boolean' || typeof notification !== 'boolean'
		|| (typeof expiration !== 'undefined' && typeof expiration !== 'number')) {
		return res.sendStatus(400);
	}
	// Update model
	return model.addAlert({ symbol, operator, threshold, expiration, vibration, notification })
		.then((uuid) => {
			// Trace operation
			log.info(`Add alert ${uuid} on ${symbol} at ${threshold}`);
			// Save data, including alerts
			saveData();
			// Send 'uuid' in response to allow further update
			return res.send(uuid);
		});
});

app.post('/alert/update', (req, res) => {
	// Extract only the needed properties from body
	let { uuid, symbol, operator, threshold, expiration, vibration, notification } = req.body;
	// Check request
	if (typeof uuid !== 'string' || typeof symbol !== 'string' || typeof operator !== 'string'
		|| typeof threshold !== 'number' || typeof vibration !== 'boolean' || typeof notification !== 'boolean'
		|| (typeof expiration !== 'undefined' && typeof expiration !== 'number')) {
		return res.sendStatus(400);
	}
	// Trace operation
	log.info(`Update alert ${uuid} on ${symbol} at ${threshold}`)
	// Update model
	return model.updateAlert({ uuid, symbol, operator, threshold, expiration, vibration, notification })
		// Send OK
		.then(() => res.send(""))
		// Save data, including alerts
		.then(() => saveData())
		// or 404 when uuid does not match an existing alert
		.catch(() => res.sendStatus(404));
});

app.post('/alert/delete', (req, res) => {
	// Extract content from body
	let uuids = req.body;
	if (typeof uuids === 'string')
		uuids = [uuids];
	// Check request
	if (!Array.isArray(uuids) || uuids.find((e) => typeof e !== 'string'))
		return res.sendStatus(400);
	// Trace operation
	log.info(`Delete alerts ${uuids}`)
	// Update model
	return model.deleteAlerts(uuids)
		// Send OK
		.then(() => res.send(""))
		// Save data, including alerts
		.then(() => saveData())
		// or 404 when one uuid in uuids does not match an existing alert
		.catch(() => res.sendStatus(404));
});

app.get('/alert/list', (req, res) => {
	// Extract content from body
	let uuids = req.query.uuids;
	if (typeof uuids === 'string')
		uuids = [uuids];
	// Check request
	if (!Array.isArray(uuids) || uuids.find((e) => typeof e !== 'string'))
		return res.sendStatus(400);
	// Trace operation
	log.info(`List alerts ${uuids}`)
	// Get model
	return model.listAlerts(uuids)
		// Send alert as asked for
		.then((alerts) => res.json(alerts))
		// or 404 when one uuid in uuids does not match an existing alert
		.catch(() => res.sendStatus(404));
});

model.listEntries()
	.then(() => loadData())
	.then(() => model.quoteEntries(sendNotification));

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
		clearTimeout(model.quoteTimeout);
		log.info(`${name} has stopped.`)
	})
})
