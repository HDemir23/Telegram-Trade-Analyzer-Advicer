import { MarketDataProvider, OHLCV } from '../types';
export declare abstract class BaseProvider implements MarketDataProvider {
    abstract name: string;
    abstract supportedMarkets: ('crypto' | 'equity' | 'forex')[];
    abstract getOHLCV(symbol: string, timeframe: string, limit?: number): Promise<OHLCV[]>;
    abstract getCurrentPrice(symbol: string): Promise<number>;
    abstract isSymbolSupported(symbol: string): Promise<boolean>;
    protected validateSymbol(symbol: string): void;
    protected validateTimeframe(timeframe: string): void;
}
