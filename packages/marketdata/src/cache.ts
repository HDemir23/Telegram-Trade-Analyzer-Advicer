import { createClient, RedisClientType } from 'redis';
import { OHLCV, PriceData } from './types';
import { logger } from '@trade/logger';

export class MarketDataCache {
  private client: RedisClientType;
  private defaultTTL: number;

  constructor(redisUrl: string, defaultTTL = 300) {
    this.client = createClient({ url: redisUrl });
    this.defaultTTL = defaultTTL;
    
    this.client.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  async getOHLCV(symbol: string, timeframe: string, provider: string): Promise<OHLCV[] | null> {
    try {
      await this.connect();
      const key = `ohlcv:${provider}:${symbol}:${timeframe}`;
      const cached = await this.client.get(key);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async setOHLCV(
    symbol: string, 
    timeframe: string, 
    provider: string, 
    data: OHLCV[], 
    ttl?: number
  ): Promise<void> {
    try {
      await this.connect();
      const key = `ohlcv:${provider}:${symbol}:${timeframe}`;
      const value = JSON.stringify(data);
      
      await this.client.setEx(key, ttl || this.defaultTTL, value);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  async getPrice(symbol: string, provider: string): Promise<PriceData | null> {
    try {
      await this.connect();
      const key = `price:${provider}:${symbol}`;
      const cached = await this.client.get(key);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.error('Cache get price error:', error);
      return null;
    }
  }

  async setPrice(symbol: string, provider: string, data: PriceData, ttl?: number): Promise<void> {
    try {
      await this.connect();
      const key = `price:${provider}:${symbol}`;
      const value = JSON.stringify(data);
      
      await this.client.setEx(key, ttl || 60, value);
    } catch (error) {
      logger.error('Cache set price error:', error);
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      await this.connect();
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      logger.error('Cache invalidate error:', error);
    }
  }
}