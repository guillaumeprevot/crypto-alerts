/** This class is used to get test data to avoid CoinMarketCap calls during dev */
class TestSource {
	constructor(_apiKey, quotationSymbol) {
		this.name = 'test';
		this.title = 'Test data';
		this.quotationSymbol = quotationSymbol;
		this.listInterval = 1000;
		this.quoteInterval = 1000;
		this.data = [
			{
				id: 1,
				name: 'Bitcoin',
				symbol: 'BTC',
				slug: 'bitcoin',
				rank: 1,
				minQuote: 40000,
				variableQuote: 5000
			},
			{
				id: 1027,
				name: 'Ethereum',
				symbol: 'ETH',
				slug: 'ethereum',
				rank: 2,
				minQuote: 3000,
				variableQuote: 200
			},
			{
				id: 825,
				name: 'Tether',
				symbol: 'USDT',
				slug: 'tether',
				rank: 3,
				minQuote: 0.8,
				variableQuote: 0.2
			},
			{
				id: 1839,
				name: 'Binance Coin',
				symbol: 'BNB',
				slug: 'binance-coin',
				rank: 4,
				minQuote: 350,
				variableQuote: 50
			},
		];
	}

	list() {
		let result = this.data.filter((d) => d.symbol !== this.quotationSymbol).map((d) => {
			return {
				symbol: d.symbol,
				name: d.name,
				url: `https://coinmarketcap.com/fr/currencies/${d.slug}/`,
				logo: `https://s2.coinmarketcap.com/static/img/coins/64x64/${d.id}.png`,
			};
		});
		return Promise.resolve(result);
	}

	quote(symbols) {
		let result = new Map();
		this.data.filter((d) => symbols.includes(d.symbol)).forEach((d) => {
			let randomPrice = d.minQuote + Math.random() * d.variableQuote;
			result.set(d.symbol, randomPrice);
		});
		return Promise.resolve(result);
	}
}

module.exports = TestSource;
