import { BaseProvider } from './base';
import { OHLCV } from '../types';
export declare class YahooProvider extends BaseProvider {
    name: string;
    supportedMarkets: ("crypto" | "equity" | "forex")[];
    private baseUrl;
    getOHLCV(symbol: string, timeframe: string, limit?: number): Promise<OHLCV[]>;
    getCurrentPrice(symbol: string): Promise<number>;
    isSymbolSupported(symbol: string): Promise<boolean>;
    private timeframeToInterval;
    private calculatePeriod;
    private timeframeToMinutes;
    private convertToOHLCV;
}
