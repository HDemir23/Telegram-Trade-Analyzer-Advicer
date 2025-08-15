import { OHLCV, PriceData, MarketDataConfig } from './types';
export declare class MarketDataService {
    private providers;
    private cache;
    private config;
    constructor(config: MarketDataConfig, redisUrl: string);
    private initializeProviders;
    getOHLCV(symbol: string, timeframe: string, limit?: number): Promise<OHLCV[]>;
    getCurrentPrice(symbol: string): Promise<PriceData>;
    private detectMarket;
    private getProvidersForMarket;
    private isDataFresh;
    private isPriceFresh;
    invalidateCache(symbol?: string): Promise<void>;
    disconnect(): Promise<void>;
}
