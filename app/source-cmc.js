const https = require('https')

/** This class is used to extract data from CoinMarketCap */
class CoinMarketCapSource {

	constructor(apiKey, quotationSymbol) {
		this.name = 'cmc';
		this.title = 'CoinMarketCap';
		this.apiKey = apiKey;
		this.quotationSymbol = quotationSymbol;
		// CoinMarketCap limits to 10 000 calls per month (https://coinmarketcap.com/api/pricing/)
		this.listInterval = 24 * 60 * 60 * 1000; // Update crypto list once a day (31 calls per month)
		this.quoteInterval = 5 * 60 * 1000; // Update crypto quote every 5 minutes (8928 calls par month)
	}

	// Wrapper of "https.request" to extract JSON from CoinMarkerCap
	json(path, search) {
		// console.log('Calling CMC API : ' + path);
		return new Promise((resolve, reject) => {
			// prepare search parameters
			const params = new URLSearchParams();
			for (const [key, value] of Object.entries(search)) {
				params.append(key, value);
			}
			// prepare request options
			const options = {
				hostname: 'pro-api.coinmarketcap.com',
				path: path + '?' + params.toString(),
				headers: {
					'X-CMC_PRO_API_KEY': this.apiKey,
					'Accept': 'application/json'
				}
			};
			// create request
			const req = https.request(options, (res) => {
				var body = '';
				res.on('data', (d) => body += d)
				res.on('end', () => {
					var result = JSON.parse(body);
					// console.log(result);
					resolve(result);
				})
			});
			req.on('error', reject);
			req.end();
		});
	}

	// For the pair selection of an alert
	// https://coinmarketcap.com/api/documentation/v1/#operation/getV1CryptocurrencyMap
	list() {
		return this.json('/v1/cryptocurrency/map', {
			listing_status: 'active',
			start: 1,
			limit: 5000,
			aux: ''
		}).then((result) => {
			return result.data.filter((cc) => cc.symbol !== this.quotationSymbol).map((cc) => {
				return {
					symbol: cc.symbol,
					name: cc.name,
					url: `https://coinmarketcap.com/fr/currencies/${cc.slug}/`,
					logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${cc.id}.png`,
				};
			});
		});
	}

	// For the background retrieving of latest quotes
	// https://coinmarketcap.com/api/documentation/v1/#operation/getV2CryptocurrencyQuotesLatest
	quote(symbols) {
		return this.json('/v2/cryptocurrency/quotes/latest', {
			symbol: symbols.join(','),
			convert: this.quotationSymbol,
			aux: ''
		}).then((result) => {
			let map = new Map();
			Object.values(result.data).map((cc) => cc[0]).forEach((cc) => {
				let symbol = cc.symbol;
				let price = cc.quote[this.quotationSymbol].price;
				map.set(symbol, price);
			});
			console.log(map);
			return map;
		});
	}
}

module.exports = CoinMarketCapSource;
