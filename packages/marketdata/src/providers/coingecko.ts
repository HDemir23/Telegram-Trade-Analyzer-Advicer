import { BaseProvider } from './base';
import { OHLCV } from '../types';

export class CoinGeckoProvider extends BaseProvider {
  name = 'coingecko';
  supportedMarkets: ("crypto" | "equity" | "forex")[] = ['crypto'];
  private baseUrl = 'https://api.coingecko.com/api/v3';

  async getOHLCV(symbol: string, timeframe: string, limit = 100): Promise<OHLCV[]> {
    this.validateSymbol(symbol);
    this.validateTimeframe(timeframe);

    const coinId = this.symbolToCoinId(symbol);
    const days = this.timeframeToDays(timeframe, limit);
    
    const url = `${this.baseUrl}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
    const response = await globalThis.fetch(url);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return this.convertToOHLCV(data, timeframe);
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    this.validateSymbol(symbol);
    
    const coinId = this.symbolToCoinId(symbol);
    const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`;
    
    const response = await globalThis.fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data[coinId]?.usd || 0;
  }

  async isSymbolSupported(symbol: string): Promise<boolean> {
    try {
      const coinId = this.symbolToCoinId(symbol);
      const url = `${this.baseUrl}/coins/${coinId}`;
      const response = await globalThis.fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  private symbolToCoinId(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'BTCUSDT': 'bitcoin',
      'ETHUSDT': 'ethereum',
      'ADAUSDT': 'cardano',
      'DOTUSDT': 'polkadot',
      'LINKUSDT': 'chainlink'
    };
    
    return symbolMap[symbol.toUpperCase()] || symbol.toLowerCase().replace('usdt', '');
  }

  private timeframeToDays(timeframe: string, limit: number): number {
    const multipliers: Record<string, number> = {
      '1m': 1 / 1440,
      '5m': 5 / 1440,
      '15m': 15 / 1440,
      '30m': 30 / 1440,
      '1h': 1 / 24,
      '4h': 4 / 24,
      '1d': 1,
      '1w': 7
    };
    
    return Math.max(1, Math.ceil(limit * (multipliers[timeframe] || 1)));
  }

  private convertToOHLCV(data: any, timeframe: string): OHLCV[] {
    const prices = data.prices || [];
    const interval = this.getIntervalMs(timeframe);
    
    const ohlcvMap = new Map<number, OHLCV>();
    
    prices.forEach(([timestamp, price]: [number, number]) => {
      const bucketTime = Math.floor(timestamp / interval) * interval;
      
      if (!ohlcvMap.has(bucketTime)) {
        ohlcvMap.set(bucketTime, {
          timestamp: bucketTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0
        });
      } else {
        const candle = ohlcvMap.get(bucketTime)!;
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);
        candle.close = price;
      }
    });
    
    return Array.from(ohlcvMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  private getIntervalMs(timeframe: string): number {
    const intervals: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000
    };
    
    return intervals[timeframe] || intervals['1h'];
  }
}