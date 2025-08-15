import { BaseProvider } from './base';
import { OHLCV } from '../types';

export class YahooProvider extends BaseProvider {
  name = 'yahoo';
  supportedMarkets: ("crypto" | "equity" | "forex")[] = ['equity'];
  private baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';

  async getOHLCV(symbol: string, timeframe: string, limit = 100): Promise<OHLCV[]> {
    this.validateSymbol(symbol);
    this.validateTimeframe(timeframe);

    const interval = this.timeframeToInterval(timeframe);
    const period = this.calculatePeriod(timeframe, limit);
    
    const url = `${this.baseUrl}/${symbol}?interval=${interval}&range=${period}`;
    const response = await globalThis.fetch(url);
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return this.convertToOHLCV(data);
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    this.validateSymbol(symbol);
    
    const url = `${this.baseUrl}/${symbol}?interval=1m&range=1d`;
    const response = await globalThis.fetch(url);
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const result = data.chart?.result?.[0];
    const quote = result?.meta?.regularMarketPrice;
    
    return quote || 0;
  }

  async isSymbolSupported(symbol: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/${symbol}?interval=1d&range=1d`;
      const response = await globalThis.fetch(url);
      const data = await response.json() as any;
      return !data.chart?.error;
    } catch {
      return false;
    }
  }

  private timeframeToInterval(timeframe: string): string {
    const intervalMap: Record<string, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
      '1w': '1wk'
    };
    
    return intervalMap[timeframe] || '1d';
  }

  private calculatePeriod(timeframe: string, limit: number): string {
    const totalMinutes = this.timeframeToMinutes(timeframe) * limit;
    const totalDays = Math.ceil(totalMinutes / (24 * 60));
    
    if (totalDays <= 1) return '1d';
    if (totalDays <= 5) return '5d';
    if (totalDays <= 30) return '1mo';
    if (totalDays <= 90) return '3mo';
    if (totalDays <= 180) return '6mo';
    if (totalDays <= 365) return '1y';
    if (totalDays <= 730) return '2y';
    return '5y';
  }

  private timeframeToMinutes(timeframe: string): number {
    const minutesMap: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '4h': 240,
      '1d': 1440,
      '1w': 10080
    };
    
    return minutesMap[timeframe] || 1440;
  }

  private convertToOHLCV(data: any): OHLCV[] {
    const result = data.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp || [];
    const indicators = result.indicators?.quote?.[0] || {};
    const { open, high, low, close, volume } = indicators;

    const ohlcv: OHLCV[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      if (open?.[i] !== null && high?.[i] !== null && 
          low?.[i] !== null && close?.[i] !== null) {
        ohlcv.push({
          timestamp: timestamps[i] * 1000,
          open: open[i],
          high: high[i],
          low: low[i],
          close: close[i],
          volume: volume?.[i] || 0
        });
      }
    }

    return ohlcv;
  }
}