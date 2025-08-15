export interface MarketDataProvider {
    name: string;
    supportedMarkets: ('crypto' | 'equity' | 'forex')[];
    getOHLCV(symbol: string, timeframe: string, limit?: number): Promise<OHLCV[]>;
    getCurrentPrice(symbol: string): Promise<number>;
    isSymbolSupported(symbol: string): Promise<boolean>;
}
export interface OHLCV {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
export interface MarketDataConfig {
    cryptoProviders: string[];
    equityProviders: string[];
    forexProviders?: string[];
    cacheEnabled: boolean;
    cacheTTL: number;
    staleness: number;
}
export interface PriceData {
    symbol: string;
    price: number;
    timestamp: number;
    provider: string;
}
