// Bulk Market Data Cache - 24H Cache with Bulk Fetching
// Efficient Yahoo Finance data management to avoid rate limits

import fs from 'fs/promises';
import path from 'path';

interface CachedOHLCV {
  symbol: string;
  data: Array<{
    t: number; // timestamp
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
  }>;
  cached_at: number;
  expires_at: number;
}

interface BulkCacheData {
  version: string;
  last_bulk_fetch: number;
  symbols: Record<string, CachedOHLCV>;
}

export class MarketDataCache {
  private cacheFile: string;
  private cache: BulkCacheData;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly BULK_FETCH_COOLDOWN = 30 * 60 * 1000; // 30 minutes between bulk fetches

  constructor() {
    // Initialize with a default path - will be resolved in init()
    this.cacheFile = '';
    this.cache = {
      version: '1.0.0',
      last_bulk_fetch: 0,
      symbols: {}
    };
  }

  private async resolveCachePath(): Promise<string> {
    // 1. Environment variable takes highest priority
    if (process.env.MARKET_DATA_CACHE_FILE) {
      const envPath = process.env.MARKET_DATA_CACHE_FILE;
      if (path.isAbsolute(envPath)) {
        return envPath;
      }
      return path.join(process.cwd(), envPath);
    }

    // 2. Check current working directory location
    const cwdPath = path.join(process.cwd(), '.market-data-cache.json');
    try {
      await fs.access(cwdPath);
      return cwdPath;
    } catch {
      // File doesn't exist in cwd, proceed to fallback
    }

    // 3. Fallback to workspace root relative to this module
    return path.resolve(__dirname, '../../../.market-data-cache.json');
  }

  async init(): Promise<void> {
    // Resolve cache file path using our strategy
    this.cacheFile = await this.resolveCachePath();
    console.log(`📦 Using market cache: ${this.cacheFile}`);

    try {
      const data = await fs.readFile(this.cacheFile, 'utf-8');
      try {
        const cached = JSON.parse(data) as BulkCacheData;
        
        // Validate cache version and clean expired data
        if (cached.version === this.cache.version) {
          this.cache = cached;
          await this.cleanExpiredData();
        }
      } catch (parseError) {
        // Handle corrupt JSON files
        const timestamp = Date.now();
        const brokenPath = `${this.cacheFile}.broken.${timestamp}`;
        console.log(`❌ Corrupt cache file detected - renaming to ${brokenPath} and starting fresh`);
        await fs.rename(this.cacheFile, brokenPath);
        throw new Error('Cache file corrupted - starting fresh');
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('📦 Starting fresh market data cache');
      } else if (error.message === 'Cache file corrupted - starting fresh') {
        // Already handled, proceed with fresh cache
      } else {
        console.error('❌ Error initializing cache:', error);
      }
    }
  }

  private async cleanExpiredData(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [symbol, data] of Object.entries(this.cache.symbols)) {
      if (now > data.expires_at) {
        delete this.cache.symbols[symbol];
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired cache entries`);
      await this.saveCache();
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('❌ Failed to save cache:', error);
    }
  }

  async getCachedData(symbol: string): Promise<CachedOHLCV | null> {
    const cached = this.cache.symbols[symbol];
    if (!cached) return null;

    const now = Date.now();
    if (now > cached.expires_at) {
      delete this.cache.symbols[symbol];
      return null;
    }

    return cached;
  }

  async needsBulkFetch(symbols: string[]): Promise<boolean> {
    const now = Date.now();
    
    // Check if we recently did a bulk fetch
    if (now - this.cache.last_bulk_fetch < this.BULK_FETCH_COOLDOWN) {
      return false;
    }

    // Check if we have valid cache for most symbols
    const uncachedSymbols = symbols.filter(symbol => !this.getCachedDataSync(symbol));
    const cacheHitRatio = (symbols.length - uncachedSymbols.length) / symbols.length;
    
    // If less than 80% cache hit, do bulk fetch
    return cacheHitRatio < 0.8;
  }

  private getCachedDataSync(symbol: string): CachedOHLCV | null {
    const cached = this.cache.symbols[symbol];
    if (!cached) return null;

    const now = Date.now();
    if (now > cached.expires_at) {
      return null;
    }

    return cached;
  }

  async bulkFetchYahooData(symbols: string[]): Promise<void> {
    console.log(`🚀 Starting bulk fetch for ${symbols.length} symbols...`);
    const now = Date.now();
    
    // Get BIST and US symbols separately for proper Yahoo formatting
    const bistSymbols = symbols.filter(s => this.isBistSymbol(s));
    const usSymbols = symbols.filter(s => !this.isBistSymbol(s) && !s.includes('USDT'));
    const cryptoSymbols = symbols.filter(s => s.includes('USDT'));

    let successCount = 0;
    let errorCount = 0;

    // Process in smaller batches to avoid overwhelming Yahoo Finance
    const batchSize = 10;
    const allStockSymbols = [...bistSymbols, ...usSymbols];

    for (let i = 0; i < allStockSymbols.length; i += batchSize) {
      const batch = allStockSymbols.slice(i, i + batchSize);
      console.log(`📊 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allStockSymbols.length/batchSize)}: ${batch.join(', ')}`);

      // Add delay between batches
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
      }

      await Promise.allSettled(batch.map(async (symbol) => {
        try {
          const ohlcv = await this.fetchYahooOHLCV(symbol);
          if (ohlcv.length > 0) {
            this.cache.symbols[symbol] = {
              symbol,
              data: ohlcv,
              cached_at: now,
              expires_at: now + this.CACHE_DURATION
            };
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.log(`⚠️ ${symbol} fetch failed: ${error}`);
          errorCount++;
        }
      }));
    }

    // Handle crypto symbols separately (they don't use Yahoo)
    console.log(`🪙 Processing ${cryptoSymbols.length} crypto symbols...`);
    for (const symbol of cryptoSymbols) {
      try {
        const ohlcv = await this.fetchBinanceOHLCV(symbol);
        if (ohlcv.length > 0) {
          this.cache.symbols[symbol] = {
            symbol,
            data: ohlcv,
            cached_at: now,
            expires_at: now + this.CACHE_DURATION
          };
          successCount++;
        }
      } catch (error) {
        console.log(`⚠️ ${symbol} crypto fetch failed: ${error}`);
        errorCount++;
      }
    }

    this.cache.last_bulk_fetch = now;
    await this.saveCache();

    console.log(`✅ Bulk fetch completed: ${successCount} success, ${errorCount} errors`);
  }

  private async fetchYahooOHLCV(symbol: string): Promise<Array<{t: number, o: number, h: number, l: number, c: number, v: number}>> {
    const yahooSymbol = this.isBistSymbol(symbol) ? `${symbol}.IS` : symbol;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1h&range=7d`;

    // Add exponential backoff delay for rate limiting
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

    let retries = 3;
    while (retries > 0) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Referer': 'https://finance.yahoo.com/',
            'Origin': 'https://finance.yahoo.com'
          }
        });

        if (response.status === 404) {
          console.log(`⚠️ Symbol ${yahooSymbol} not found on Yahoo Finance (404)`);
          return []; // Return empty data instead of throwing
        }

        if (response.status === 429) {
          // Rate limited, wait longer and retry
          const backoff = (4 - retries) * 2000 + Math.random() * 1000;
          console.log(`🕒 Rate limited for ${symbol}, waiting ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          retries--;
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${symbol}`);
        }

        const data = await response.json() as any;
        
        if (data.chart?.error) {
          if (data.chart.error.code === 'Not Found') {
            console.log(`⚠️ Symbol ${yahooSymbol} not found on Yahoo Finance`);
            return []; // Return empty instead of throwing
          }
          throw new Error(`Yahoo Error: ${data.chart.error.description}`);
        }

        const result = data.chart?.result?.[0];
        if (!result?.timestamp?.length) {
          console.log(`⚠️ No timestamp data for ${symbol}`);
          return [];
        }

        const timestamps = result.timestamp;
        const quotes = result.indicators?.quote?.[0];
        
        if (!quotes) {
          console.log(`⚠️ No quote data for ${symbol}`);
          return [];
        }

        return timestamps.map((ts: number, i: number) => ({
          t: ts * 1000, // Convert to milliseconds
          o: quotes.open?.[i] || 0,
          h: quotes.high?.[i] || 0,
          l: quotes.low?.[i] || 0,
          c: quotes.close?.[i] || 0,
          v: quotes.volume?.[i] || 0
        })).filter((candle: any) => candle.c > 0); // Filter invalid candles

      } catch (error: any) {
        retries--;
        if (retries === 0) throw error;
        
        const backoff = (4 - retries) * 1000 + Math.random() * 500;
        console.log(`🔄 Retrying ${symbol} in ${backoff}ms (${retries} retries left): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    // This should never be reached due to the while loop and throw/return statements
    return [];
  }

  private async fetchBinanceOHLCV(symbol: string): Promise<Array<{t: number, o: number, h: number, l: number, c: number, v: number}>> {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=168`; // 7 days

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'AI-Trading-Bot/3.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rows = await response.json() as any[];
    
    return rows.map(r => ({
      t: +r[0], // timestamp
      o: +r[1], // open
      h: +r[2], // high
      l: +r[3], // low
      c: +r[4], // close
      v: +r[5]  // volume
    }));
  }

  private isBistSymbol(symbol: string): boolean {
    const bistSymbols = ['THYAO', 'AKBNK', 'GARAN', 'ISCTR', 'TUPRS', 'KCHOL', 'SAHOL', 'EREGL', 'ARCLK', 'BIMAS', 'KOZAL', 'TCELL', 'PETKM', 'SISE', 'KOZAA', 'FROTO', 'HALKB', 'VAKBN', 'TKFEN', 'TOASO'];
    return bistSymbols.includes(symbol);
  }

  async getOHLCV(symbol: string, limit: number = 168): Promise<{data: any[], fromCache: boolean}> {
    // Try cache first
    const cached = await this.getCachedData(symbol);
    if (cached) {
      console.log(`📦 Using cached data for ${symbol} (${cached.data.length} candles)`);
      return {
        data: cached.data.slice(-limit),
        fromCache: true
      };
    }

    // Cache miss - try to fetch individual symbol
    console.log(`🔄 Cache miss for ${symbol}, fetching fresh data...`);
    try {
      let ohlcv: any[];
      if (symbol.includes('USDT')) {
        ohlcv = await this.fetchBinanceOHLCV(symbol);
      } else {
        ohlcv = await this.fetchYahooOHLCV(symbol);
      }

      if (ohlcv.length > 0) {
        // Cache the result
        const now = Date.now();
        this.cache.symbols[symbol] = {
          symbol,
          data: ohlcv,
          cached_at: now,
          expires_at: now + this.CACHE_DURATION
        };
        await this.saveCache();
      }

      return {
        data: ohlcv.slice(-limit),
        fromCache: false
      };
    } catch (error) {
      console.log(`❌ Failed to fetch ${symbol}: ${error}`);
      return {
        data: [],
        fromCache: false
      };
    }
  }

  async preloadAllSymbols(): Promise<void> {
    // Get all symbols from environment
    const cryptoSymbols = (process.env.UNIVERSE_CRYPTO || '').split(',').filter(s => s.trim());
    const spxSymbols = (process.env.UNIVERSE_SPX || '').split(',').filter(s => s.trim());
    const bistSymbols = (process.env.UNIVERSE_BIST || '').split(',').filter(s => s.trim());
    
    const allSymbols = [...cryptoSymbols, ...spxSymbols, ...bistSymbols];
    
    if (await this.needsBulkFetch(allSymbols)) {
      await this.bulkFetchYahooData(allSymbols);
    } else {
      console.log('📦 Market data cache is fresh, skipping bulk fetch');
    }
  }

  getCacheStats(): {totalSymbols: number, cacheAge: string, nextBulkFetch: string} {
    const now = Date.now();
    const cacheAge = this.cache.last_bulk_fetch > 0 
      ? `${Math.round((now - this.cache.last_bulk_fetch) / (60 * 1000))}m ago`
      : 'never';
    
    const nextFetch = this.cache.last_bulk_fetch > 0
      ? `${Math.round((this.cache.last_bulk_fetch + this.BULK_FETCH_COOLDOWN - now) / (60 * 1000))}m`
      : 'now';

    return {
      totalSymbols: Object.keys(this.cache.symbols).length,
      cacheAge,
      nextBulkFetch: nextFetch.startsWith('-') ? 'ready' : nextFetch
    };
  }
}

// Global cache instance
export const marketDataCache = new MarketDataCache();