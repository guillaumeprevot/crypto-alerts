const https = require('https')

/** This class is used to extract data from CoinMarketCap */
class CoinMarketCap {
	constructor() {
		this.onerror = (error) => console.log(error);
	}

	// Wrapper of "https.request" to extract JSON from CoinMarkerCap
	json(apiKey, path, search) {
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
					'X-CMC_PRO_API_KEY': apiKey,
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
			req.on('error', (error) => {
				this.onerror(error);
				reject(error);
			});
			req.end();
		});
	}

	// For the '<select />' used to add a currency
	// https://coinmarketcap.com/api/documentation/v1/#operation/getV1CryptocurrencyMap
	map(apiKey) {
		return this.json(apiKey, '/v1/cryptocurrency/map', {
			listing_status: 'active',
			start: 1,
			limit: 5000,
			// symbol: 'BTC,ETH,USDT', // custom selection
			aux: 'first_historical_data,last_historical_data,platform'
		}).then((result) => result.data.map((cc) => {
			return {
				id: cc.id, // 825
				name: cc.name, // "Tether"
				symbol: cc.symbol, // "USDT"
				slug: cc.slug, // "tether"
				rank: cc.rank, // 5
				// active: cc.is_active === 1,
				// status: cc.status, // "active", "inactive", "untracked", si demandé via "aux"
				firstHistoricalData: cc.first_historical_data, // "2015-02-25T13:34:26.000Z", si demandé via "aux"
				lastHistoricalData: cc.last_historical_data, // "2020-05-05T20:44:01.000Z", si demandé via "aux"
				platformId: (cc.platform ? cc.platform.id : null), // id+name+slug+symbol+token_address, si demandé via "aux"
			};
		}));
	}

	// For the detail page of currencies
	// https://coinmarketcap.com/api/documentation/v1/#operation/getV2CryptocurrencyInfo
	info(apiKey, symbols) {
		if (!symbols || (typeof symbols !== 'string'))
			throw new Error('String parameter "symbols" is required');
		return this.json(apiKey, '/v2/cryptocurrency/info', {
			symbol: symbols, // or "id: '1,2'"
			aux: 'urls,logo,description,platform',
		}).then((result) => Object.values(result.data).map((cc) => cc[0]).map((cc) => {
			return {
				id: cc.id, // 1027
				name: cc.name, // "Ethereum"
				symbol: cc.symbol, // "ETH"
				slug: cc.slug, // "ethereum"
				category: cc.category, // "coin" ou "token"
				launch: cc.date_launched, // "2015-08-07T00:00:00.000Z"
				logo: cc.logo, // "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png", si demandé via "aux"
				description: cc.description, // "Ethereum (ETH) is a smart contract platform ...", si demandée via "aux"
				platformId: (cc.platform ? cc.platform.id : null), // id+name+slug+symbol+token_address, si demandé via "aux"
				websiteURL: cc.urls && cc.urls.website && cc.urls.website[0], // "https://www.ethereum.org/"
				sourceCodeURL: cc.urls && cc.urls.source_code && cc.urls.source_code[0], // "https://github.com/ethereum"
			};
		}));
	}

	// For main page presentation of the most capitalized currencies
	// https://coinmarketcap.com/api/documentation/v1/#operation/getV1CryptocurrencyListingsLatest
	listing(apiKey, quotationSymbol) {
		return this.json(apiKey, '/v1/cryptocurrency/listings/latest', {
			start: 1,
			limit: 100,
			convert: quotationSymbol,
			sort: 'market_cap',
			sort_dir: 'desc',
			aux: 'cmc_rank,platform,max_supply,circulating_supply,total_supply,volume_7d,volume_30d'
		}).then((result) => result.data.map((cc) => {
			const quote = cc.quote[quotationSymbol]
			return {
				id: cc.id, // 1
				name: cc.name, // Bitcoin
				symbol: cc.symbol, // BTC
				slug: cc.slug, // bitcoin
				cmcRank: cc.cmc_rank, // 1, si demandé via "aux" ou "aux" non précisé
				platformId: (cc.platform ? cc.platform.id : null), // id+name+slug+symbol+token_address, si demandé via "aux"
				circulatingSupply: cc.circulating_supply, // 18984981, si demandé via "aux" ou "aux" non précisé
				totalSupply: cc.total_supply, // 18984981, si demandé via "aux" ou "aux" non précisé
				maxSupply: cc.max_supply, // 21000000, si demandé via "aux" ou "aux" non précisé
				price: quote.price, // 40577.246690722444
				volume24h: quote.volume_24h, // 36088214101.92972
				volume7d: quote.volume_7d, // 176510648188.0766, si demandé via "aux"
				volume30d: quote.volume_30d, // 480014478178.85565, si demandé via "aux"
				volumeChange24h: quote.volume_change_24h, // 47.1304
				percentChange1h: quote.percent_change_1h, // 0.66261734
				percentChange24h: quote.percent_change_24h, // 4.55572584
				percentChange7d: quote.percent_change_7d, // -3.69855071
				percentChange30d: quote.percent_change_30d, // -4.7096209
				percentChange60d: quote.percent_change_60d, // -5.49586054
				percentChange90d: quote.percent_change_90d, // -16.78685405
			};
		}));
	}

	// For the background monitoring on server
	// https://coinmarketcap.com/api/documentation/v1/#operation/getV2CryptocurrencyQuotesLatest
	quotation(apiKey, symbols, quotationSymbol) {
		if (!symbols || (typeof symbols !== 'string'))
			throw new Error('String parameter "symbols" is required');
		return this.json(apiKey, '/v2/cryptocurrency/quotes/latest', {
			symbol: symbols, // or "id: '1,2'"
			convert: quotationSymbol,
			aux: 'cmc_rank,platform,max_supply,circulating_supply,total_supply,volume_7d,volume_30d'
		}).then((result) => Object.values(result.data).map((cc) => cc[0]).map((cc) => {
			const quote = cc.quote[quotationSymbol]
			return {
				id: cc.id, // 1
				name: cc.name, // Bitcoin
				symbol: cc.symbol, // BTC
				slug: cc.slug, // bitcoin
				cmcRank: cc.cmc_rank, // 1, si demandé via "aux" ou "aux" non précisé
				platformId: (cc.platform ? cc.platform.id : null), // id+name+slug+symbol+token_address, si demandé via "aux"
				circulatingSupply: cc.circulating_supply, // 18984981, si demandé via "aux" ou "aux" non précisé
				totalSupply: cc.total_supply, // 18984981, si demandé via "aux" ou "aux" non précisé
				maxSupply: cc.max_supply, // 21000000, si demandé via "aux" ou "aux" non précisé
				price: quote.price, // 40577.246690722444
				volume24h: quote.volume_24h, // 36088214101.92972
				volume7d: quote.volume_7d, // 176510648188.0766, si demandé via "aux"
				volume30d: quote.volume_30d, // 480014478178.85565, si demandé via "aux"
				volumeChange24h: quote.volume_change_24h, // 47.1304
				percentChange1h: quote.percent_change_1h, // 0.66261734
				percentChange24h: quote.percent_change_24h, // 4.55572584
				percentChange7d: quote.percent_change_7d, // -3.69855071
				percentChange30d: quote.percent_change_30d, // -4.7096209
				percentChange60d: quote.percent_change_60d, // -5.49586054
				percentChange90d: quote.percent_change_90d, // -16.78685405
			};
		}));
	}
}

module.exports = new CoinMarketCap();
