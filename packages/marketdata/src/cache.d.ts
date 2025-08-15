import { OHLCV, PriceData } from './types';
export declare class MarketDataCache {
    private client;
    private defaultTTL;
    constructor(redisUrl: string, defaultTTL?: number);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getOHLCV(symbol: string, timeframe: string, provider: string): Promise<OHLCV[] | null>;
    setOHLCV(symbol: string, timeframe: string, provider: string, data: OHLCV[], ttl?: number): Promise<void>;
    getPrice(symbol: string, provider: string): Promise<PriceData | null>;
    setPrice(symbol: string, provider: string, data: PriceData, ttl?: number): Promise<void>;
    invalidate(pattern: string): Promise<void>;
}
