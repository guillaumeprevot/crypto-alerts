/** Import crypto package to generate GUID */
const crypto = require('crypto');

/** The three alert detection modes */
const operators = {
	// the quote comes above a threshold
	'higher': (previous, current, threshold) => current > threshold && ((typeof previous !== 'number') || (previous <= threshold)),
	// the quote comes below a threshold 
	'lower': (previous, current, threshold) => current < threshold && ((typeof previous !== 'number') || (previous >= threshold)),
	// the quote crosses a threshold, either upwards or downwards
	'cross': (previous, current, threshold) => (typeof previous === 'number') && (previous <= threshold && current > threshold || previous >= threshold && current < threshold),
};

/** This class contains information about a crypto available for alerts */
class CryptoEntry {

	constructor(data) {
		this.symbol = data.symbol; // BTC
		this.name = data.name; // Bitcoin
		this.url = data.url; // https://coinmarketcap.com/fr/currencies/bitcoin/
		this.logo = data.logo; // https://s2.coinmarketcap.com/static/img/coins/64x64/1.png
		this.previousQuote = undefined; // updated every minutes
		this.currentQuote = undefined; // updated every minutes
	}

}

/** This class contains information about an alert created by the user */
class CryptoAlert {

	constructor(data) {
		this.uuid = crypto.randomUUID(); // unique alert identifier
		this.copy(data);
		this.activation = undefined; // updated if alert gets activated
	}

	copy(data) {
		this.symbol = data.symbol; // BTC
		this.operator = data.operator; // higher
		this.threshold = data.threshold; // 41000
		this.expiration = data.expiration; // timestamp where watch is over and no alert is thrown
		this.vibration = data.vibration; // false
		this.notification = data.notification; // true
	}
}

/** This class manages data about available cryptos and quotations */
class CryptoModel {

	constructor(source) {
		this.source = source;
		this.entries = [];
		this.alerts = [];
		this.nextListCallTimestamp = 0;
	}

	listEntries() {
		// reuse the same list for one day
		if (Date.now() < this.nextListCallTimestamp)
			return Promise.resolve(this.entries);
		// update once every day
		return this.source.list().then((results) => {
			this.entries = results.map((e) => new CryptoEntry(e));
			this.nextListCallTimestamp = Date.now() + this.source.listInterval;
			return this.entries;
		});
	}

	quoteEntries(onactivation) {
		if (this.alerts.length === 0) {
			// Quoting is unnecessary, try again later
			setTimeout(() => this.quoteEntries(onactivation), this.source.quoteInterval);
			return;
		}
		// get the symbols from configured alerts
		let symbols = new Set();
		this.alerts.forEach((a) => symbols.add(a.symbol));
		// update quotes
		this.source.quote(symbols).then((quoteMap) => {
			// create the map of updated entries by symbol
			let updatedEntryMap = new Map();
			this.entries.forEach((entry) => {
				let quote = quoteMap.get(entry.symbol);
				if (typeof quote === 'number') {
					entry.previousQuote = entry.currentQuote;
					entry.currentQuote = quote;
					updatedEntryMap.set(entry.symbol, entry);
				}
			});
			// check for alert activation
			let activations = [];
			let now = Date.now();
			this.alerts.forEach((alert) => {
				// console.log('checking', alert);
				if (alert.activation)
					return; // alert is already activated
				if (alert.expiration && now > alert.expiration)
					return; // alert has expired
				let entry = updatedEntryMap.get(alert.symbol);
				// console.log('found', entry);
				if (!entry)
					return; // no change
				let operator = operators[alert.operator];
				let activated = operator(entry.previousQuote, entry.currentQuote, alert.threshold);
				if (activated) {
					alert.activation = now;
					activations.push({
						uuid: alert.uuid,
						activation: alert.activation,
						name: entry.name,
						symbol: entry.symbol,
						url: entry.url,
						logo: entry.logo,
						price: entry.currentQuote
					});
				}
			});
			// console.log('activations', activations);
			if (activations.length > 0)
				onactivation(activations);
			// Wait before the next quoting
			setTimeout(() => this.quoteEntries(onactivation), this.source.quoteInterval);
		});
	}

	addAlert(alert) {
		let a = new CryptoAlert(alert);
		this.alerts.push(a);
		return Promise.resolve(a.uuid);
	}

	updateAlert(alert) {
		let a = this.alerts.find((some) => some.uuid === alert.uuid);
		if (!a)
			return Promise.reject();
		a.copy(alert);
		return Promise.resolve();
	}

	deleteAlerts(uuids) {
		let keep = this.alerts.filter((a) => !uuids.includes(a.uuid));
		if (keep.length !== this.alerts.length - uuids.length)
			return Promise.reject();
		this.alerts = keep;
		return Promise.resolve();
	}

	listAlerts(uuids) {
		let results = this.alerts.filter((a) => uuids.includes(a.uuid));
		if (results.length !== uuids.length)
			return Promise.reject();
		return Promise.resolve(results);
	}

}

module.exports = CryptoModel;
