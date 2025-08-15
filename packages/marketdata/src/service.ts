import { MarketDataProvider, OHLCV, PriceData, MarketDataConfig } from './types';
import { MarketDataCache } from './cache';
import { CoinGeckoProvider } from './providers/coingecko';
import { YahooProvider } from './providers/yahoo';
import { logger } from '@trade/logger';

export class MarketDataService {
  private providers = new Map<string, MarketDataProvider>();
  private cache: MarketDataCache;
  private config: MarketDataConfig;

  constructor(config: MarketDataConfig, redisUrl: string) {
    this.config = config;
    this.cache = new MarketDataCache(redisUrl, config.cacheTTL);
    this.initializeProviders();
  }

  private initializeProviders(): void {
    this.providers.set('coingecko', new CoinGeckoProvider());
    this.providers.set('yahoo', new YahooProvider());
  }

  async getOHLCV(symbol: string, timeframe: string, limit = 100): Promise<OHLCV[]> {
    const market = this.detectMarket(symbol);
    const providers = this.getProvidersForMarket(market);

    for (const providerName of providers) {
      try {
        if (this.config.cacheEnabled) {
          const cached = await this.cache.getOHLCV(symbol, timeframe, providerName);
          if (cached && this.isDataFresh(cached)) {
            logger.debug(`Cache hit for ${symbol} ${timeframe} from ${providerName}`);
            return cached;
          }
        }

        const provider = this.providers.get(providerName);
        if (!provider) continue;

        const isSupported = await provider.isSymbolSupported(symbol);
        if (!isSupported) continue;

        const data = await provider.getOHLCV(symbol, timeframe, limit);
        
        if (this.config.cacheEnabled && data.length > 0) {
          await this.cache.setOHLCV(symbol, timeframe, providerName, data);
        }

        logger.info(`Retrieved OHLCV for ${symbol} ${timeframe} from ${providerName}`);
        return data;

      } catch (error) {
        logger.warn(`Provider ${providerName} failed for ${symbol}:`, error);
        continue;
      }
    }

    throw new Error(`No provider could fetch data for ${symbol} ${timeframe}`);
  }

  async getCurrentPrice(symbol: string): Promise<PriceData> {
    const market = this.detectMarket(symbol);
    const providers = this.getProvidersForMarket(market);

    for (const providerName of providers) {
      try {
        if (this.config.cacheEnabled) {
          const cached = await this.cache.getPrice(symbol, providerName);
          if (cached && this.isPriceFresh(cached)) {
            logger.debug(`Price cache hit for ${symbol} from ${providerName}`);
            return cached;
          }
        }

        const provider = this.providers.get(providerName);
        if (!provider) continue;

        const isSupported = await provider.isSymbolSupported(symbol);
        if (!isSupported) continue;

        const price = await provider.getCurrentPrice(symbol);
        const priceData: PriceData = {
          symbol,
          price,
          timestamp: Date.now(),
          provider: providerName
        };

        if (this.config.cacheEnabled) {
          await this.cache.setPrice(symbol, providerName, priceData);
        }

        logger.info(`Retrieved price for ${symbol} from ${providerName}: ${price}`);
        return priceData;

      } catch (error) {
        logger.warn(`Provider ${providerName} failed for ${symbol} price:`, error);
        continue;
      }
    }

    throw new Error(`No provider could fetch price for ${symbol}`);
  }

  private detectMarket(symbol: string): 'crypto' | 'equity' {
    const cryptoSuffixes = ['USDT', 'USDC', 'BTC', 'ETH'];
    const upperSymbol = symbol.toUpperCase();
    
    for (const suffix of cryptoSuffixes) {
      if (upperSymbol.endsWith(suffix)) {
        return 'crypto';
      }
    }
    
    return 'equity';
  }

  private getProvidersForMarket(market: 'crypto' | 'equity'): string[] {
    switch (market) {
      case 'crypto':
        return this.config.cryptoProviders;
      case 'equity':
        return this.config.equityProviders;
      default:
        return [];
    }
  }

  private isDataFresh(data: OHLCV[]): boolean {
    if (data.length === 0) return false;
    
    const lastTimestamp = Math.max(...data.map(d => d.timestamp));
    const ageSeconds = (Date.now() - lastTimestamp) / 1000;
    
    return ageSeconds <= this.config.staleness;
  }

  private isPriceFresh(priceData: PriceData): boolean {
    const ageSeconds = (Date.now() - priceData.timestamp) / 1000;
    return ageSeconds <= 60;
  }

  async invalidateCache(symbol?: string): Promise<void> {
    const pattern = symbol ? `*:${symbol}:*` : '*';
    await this.cache.invalidate(pattern);
  }

  async disconnect(): Promise<void> {
    await this.cache.disconnect();
  }
}