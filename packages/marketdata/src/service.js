"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketDataService = void 0;
const cache_1 = require("./cache");
const coingecko_1 = require("./providers/coingecko");
const yahoo_1 = require("./providers/yahoo");
const logger_1 = require("@trade/logger");
class MarketDataService {
    constructor(config, redisUrl) {
        this.providers = new Map();
        this.config = config;
        this.cache = new cache_1.MarketDataCache(redisUrl, config.cacheTTL);
        this.initializeProviders();
    }
    initializeProviders() {
        this.providers.set('coingecko', new coingecko_1.CoinGeckoProvider());
        this.providers.set('yahoo', new yahoo_1.YahooProvider());
    }
    async getOHLCV(symbol, timeframe, limit = 100) {
        const market = this.detectMarket(symbol);
        const providers = this.getProvidersForMarket(market);
        for (const providerName of providers) {
            try {
                if (this.config.cacheEnabled) {
                    const cached = await this.cache.getOHLCV(symbol, timeframe, providerName);
                    if (cached && this.isDataFresh(cached)) {
                        logger_1.logger.debug(`Cache hit for ${symbol} ${timeframe} from ${providerName}`);
                        return cached;
                    }
                }
                const provider = this.providers.get(providerName);
                if (!provider)
                    continue;
                const isSupported = await provider.isSymbolSupported(symbol);
                if (!isSupported)
                    continue;
                const data = await provider.getOHLCV(symbol, timeframe, limit);
                if (this.config.cacheEnabled && data.length > 0) {
                    await this.cache.setOHLCV(symbol, timeframe, providerName, data);
                }
                logger_1.logger.info(`Retrieved OHLCV for ${symbol} ${timeframe} from ${providerName}`);
                return data;
            }
            catch (error) {
                logger_1.logger.warn(`Provider ${providerName} failed for ${symbol}:`, error);
                continue;
            }
        }
        throw new Error(`No provider could fetch data for ${symbol} ${timeframe}`);
    }
    async getCurrentPrice(symbol) {
        const market = this.detectMarket(symbol);
        const providers = this.getProvidersForMarket(market);
        for (const providerName of providers) {
            try {
                if (this.config.cacheEnabled) {
                    const cached = await this.cache.getPrice(symbol, providerName);
                    if (cached && this.isPriceFresh(cached)) {
                        logger_1.logger.debug(`Price cache hit for ${symbol} from ${providerName}`);
                        return cached;
                    }
                }
                const provider = this.providers.get(providerName);
                if (!provider)
                    continue;
                const isSupported = await provider.isSymbolSupported(symbol);
                if (!isSupported)
                    continue;
                const price = await provider.getCurrentPrice(symbol);
                const priceData = {
                    symbol,
                    price,
                    timestamp: Date.now(),
                    provider: providerName
                };
                if (this.config.cacheEnabled) {
                    await this.cache.setPrice(symbol, providerName, priceData);
                }
                logger_1.logger.info(`Retrieved price for ${symbol} from ${providerName}: ${price}`);
                return priceData;
            }
            catch (error) {
                logger_1.logger.warn(`Provider ${providerName} failed for ${symbol} price:`, error);
                continue;
            }
        }
        throw new Error(`No provider could fetch price for ${symbol}`);
    }
    detectMarket(symbol) {
        const cryptoSuffixes = ['USDT', 'USDC', 'BTC', 'ETH'];
        const upperSymbol = symbol.toUpperCase();
        for (const suffix of cryptoSuffixes) {
            if (upperSymbol.endsWith(suffix)) {
                return 'crypto';
            }
        }
        return 'equity';
    }
    getProvidersForMarket(market) {
        switch (market) {
            case 'crypto':
                return this.config.cryptoProviders;
            case 'equity':
                return this.config.equityProviders;
            default:
                return [];
        }
    }
    isDataFresh(data) {
        if (data.length === 0)
            return false;
        const lastTimestamp = Math.max(...data.map(d => d.timestamp));
        const ageSeconds = (Date.now() - lastTimestamp) / 1000;
        return ageSeconds <= this.config.staleness;
    }
    isPriceFresh(priceData) {
        const ageSeconds = (Date.now() - priceData.timestamp) / 1000;
        return ageSeconds <= 60;
    }
    async invalidateCache(symbol) {
        const pattern = symbol ? `*:${symbol}:*` : '*';
        await this.cache.invalidate(pattern);
    }
    async disconnect() {
        await this.cache.disconnect();
    }
}
exports.MarketDataService = MarketDataService;
