const fs = require('fs')
const http = require('http')
const https = require('https')
const express = require('express')
const app = express()
const name = 'Crypto!'

// This is the application configuration based on environment variables
const config = {
	dev: process.env.NODE_ENV === 'development', // 'production' or undefined otherwise
	port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
	key: process.env.HTTPS_KEY || '', // /path/to/privkey.pem
	cert: process.env.HTTPS_CERT || '', // /path/to/cert.pem
}

// This is a *very* simple log interface
const log = {
	error: (text) => console.error(text),
	warn: (text) => console.log(text),
	info: (text) => console.log(text),
	trace: (text) => config.dev && console.log(text),
}

// Starting
log.info(`${name} is starting...`)

// Hello world
app.get('/', (_req, res) => res.send('Hello World!'));

// Create HTTP or HTTPS server, instead of app.listen
// app.listen(config.port, () => { ... })
var server;
if (config.cert) {
	server = https.createServer({
		key: fs.readFileSync(config.key),
		cert: fs.readFileSync(config.cert)
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
