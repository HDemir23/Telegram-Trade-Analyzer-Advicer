import { MarketDataProvider, OHLCV } from '../types';

export abstract class BaseProvider implements MarketDataProvider {
  abstract name: string;
  abstract supportedMarkets: ('crypto' | 'equity' | 'forex')[];

  abstract getOHLCV(symbol: string, timeframe: string, limit?: number): Promise<OHLCV[]>;
  abstract getCurrentPrice(symbol: string): Promise<number>;
  abstract isSymbolSupported(symbol: string): Promise<boolean>;

  protected validateSymbol(symbol: string): void {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol format');
    }
  }

  protected validateTimeframe(timeframe: string): void {
    const validTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    if (!validTimeframes.includes(timeframe)) {
      throw new Error(`Invalid timeframe: ${timeframe}`);
    }
  }
}