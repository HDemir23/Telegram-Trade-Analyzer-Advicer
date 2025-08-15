"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketDataCache = void 0;
const redis_1 = require("redis");
const logger_1 = require("@trade/logger");
class MarketDataCache {
    constructor(redisUrl, defaultTTL = 300) {
        this.client = (0, redis_1.createClient)({ url: redisUrl });
        this.defaultTTL = defaultTTL;
        this.client.on('error', (err) => {
            logger_1.logger.error('Redis connection error:', err);
        });
    }
    async connect() {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }
    async disconnect() {
        if (this.client.isOpen) {
            await this.client.disconnect();
        }
    }
    async getOHLCV(symbol, timeframe, provider) {
        try {
            await this.connect();
            const key = `ohlcv:${provider}:${symbol}:${timeframe}`;
            const cached = await this.client.get(key);
            if (cached) {
                return JSON.parse(cached);
            }
            return null;
        }
        catch (error) {
            logger_1.logger.error('Cache get error:', error);
            return null;
        }
    }
    async setOHLCV(symbol, timeframe, provider, data, ttl) {
        try {
            await this.connect();
            const key = `ohlcv:${provider}:${symbol}:${timeframe}`;
            const value = JSON.stringify(data);
            await this.client.setEx(key, ttl || this.defaultTTL, value);
        }
        catch (error) {
            logger_1.logger.error('Cache set error:', error);
        }
    }
    async getPrice(symbol, provider) {
        try {
            await this.connect();
            const key = `price:${provider}:${symbol}`;
            const cached = await this.client.get(key);
            if (cached) {
                return JSON.parse(cached);
            }
            return null;
        }
        catch (error) {
            logger_1.logger.error('Cache get price error:', error);
            return null;
        }
    }
    async setPrice(symbol, provider, data, ttl) {
        try {
            await this.connect();
            const key = `price:${provider}:${symbol}`;
            const value = JSON.stringify(data);
            await this.client.setEx(key, ttl || 60, value);
        }
        catch (error) {
            logger_1.logger.error('Cache set price error:', error);
        }
    }
    async invalidate(pattern) {
        try {
            await this.connect();
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
            }
        }
        catch (error) {
            logger_1.logger.error('Cache invalidate error:', error);
        }
    }
}
exports.MarketDataCache = MarketDataCache;
