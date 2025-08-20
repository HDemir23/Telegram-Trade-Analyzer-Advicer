import { DecisionSchema, JSON_CONTRACT, validateAndRepair, getEntryMid, type Decision } from './decision-schema';
import { analyzeRegime, calculateConfidence, type RegimeAnalysis, type PriceData } from '../analysis/market-regime';

import { isStale } from '../utils/data-freshness';
// Backoff and log dedup utilities
const seenLogs = new Map<string, number>();

function logOnce(key: string, msg: string): void {
  const now = Date.now();
  const last = seenLogs.get(key) ?? 0;
  if (now - last > 15000) { // 15 second cooldown
    console.warn(msg);
    seenLogs.set(key, now);
  }
}

async function withBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let delay = 250;
  let lastErr: any;
  
  for (let i = 0; i < 4; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const errorMsg = String(e);
      
      // Special handling for rate limiting
      if (errorMsg.includes('RATE_LIMITED') || errorMsg.includes('429')) {
        delay = Math.max(delay, 2000); // Longer delay for rate limits
        console.log(`⚠️ ${label}: Rate limited, waiting ${delay}ms before retry ${i + 1}/4`);
      }
      
      await new Promise(r => setTimeout(r, delay + Math.random() * 200)); // increased jitter
      delay *= 2;
    }
  }
  
  logOnce(`err:${label}`, `❌ ${label}: ${String(lastErr)}`);
  throw lastErr;
}

// Market hours utility functions
function computeAgeSec(latestMs: number): number {
  return Math.max(0, (Date.now() - latestMs) / 1000);
}

function isMarketOpen(exchange: "US" | "BIST", now: Date): boolean {
  const tz = exchange === "US" ? "America/New_York" : "Europe/Istanbul";
  const h = +new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(now);
  const d = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: tz }).format(now);
  return d !== "Sat" && d !== "Sun" && h >= 9 && h < 17;
}

function applyEquityGates(asset: string, timeframe: string, latestTs?: number): { forceHold: boolean; reason: string } | null {
  const isEquity = /^(AAPL|MSFT|GOOGL|TSLA|NVDA|AMZN|META|NFLX|AMD|CRM|SPY|QQQ)$/.test(asset);
  const isBist = /^(THYAO|AKBNK|TUPRS|EREGL|KOZAA)/.test(asset);
  if (!isEquity && !isBist) return null;
  
  const now = new Date();
  const open = isMarketOpen(isBist ? "BIST" : "US", now);
  const intraday = ["15m", "30m"].includes(timeframe); // Only very short timeframes
  
  // Check if market is closed for very short timeframes only
  if (!open && intraday) {
    const exchange = isBist ? 'BIST' : 'US';
    console.log(`⏰ Market gate: ${exchange} market closed for ${asset} on ${timeframe}`);
    return { forceHold: true, reason: "market_closed" };
  }
  
  // Check stale equity quotes (older than 3 minutes during market hours)
  if (latestTs && open) {
    const age = computeAgeSec(latestTs);
    if (age > 180) { // 3 minutes
      console.log(`📅 Equity staleness gate: ${asset} quotes ${Math.round(age)}s old`);
      return { forceHold: true, reason: "stale_equity_quotes" };
    }
  }
  
  return null;
}

// Utility function for volatility calculation
function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i-1]) / prices[i-1]);
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * 100; // Return as percentage
}

// V2 Analysis Request (expanded data)
interface AnalysisRequestV2 {
  asset: string;
  timeframe: string;
  price: number;
  atr: number;
  ma50_slope: number;
  adx: number;
  rsi: number;
  orderbook?: { imb10: number };
  deriv?: { funding: number; oi_delta_24h: number; basis_bps: number };
  sentiment?: { pol: number };
  btc_beta?: number;
  age_sec: number;
  min_rr: number;
  leverage_cap: number;
  data_staleness_sec: number;
  prices: number[]; // For regime analysis
  ma50: number;
}

// Enhanced market data service with regime analysis
export class EnhancedMarketDataService {
  async getEnhancedTechnicalData(symbol: string): Promise<AnalysisRequestV2 & { dataStale: boolean }> {
    const currentPrice = await this.getPrice(symbol);
    const { prices: historicalData, stale } = await this.getHistoricalPrices(symbol, 500); // 1 month of 6h candles
    
    // If no real data, force stale status
    if (historicalData.length === 0 || stale) {
      return {
        asset: symbol,
        timeframe: '6h',
        price: currentPrice,
        atr: 0,
        ma50_slope: 0,
        adx: 0,
        rsi: 50,
        age_sec: 999, // Force stale
        min_rr: 2.0,
        leverage_cap: 3,
        data_staleness_sec: 3600, // 1 hour
        prices: [],
        ma50: currentPrice,
        dataStale: true
      };
    }
    
    // Calculate technical indicators with real data
    const rsi = this.calculateRSI(historicalData);
    const atr = this.calculateATR(historicalData, currentPrice);
    const ma50 = historicalData.reduce((a, b) => a + b) / historicalData.length;
    const ma50_slope = this.calculateMASlope(historicalData, 50);
    const adx = this.calculateADX(historicalData);
    
    // Optional enhanced data
    const orderbook = await this.getOrderBookData(symbol);
    const deriv = await this.getDerivativesData(symbol);
    const sentiment = await this.getSentimentData(symbol);
    const btc_beta = await this.getBTCBeta(symbol);
    
    return {
      asset: symbol,
      timeframe: '1h',
      price: currentPrice,
      atr,
      ma50_slope,
      adx,
      rsi,
      orderbook,
      deriv,
      sentiment,
      btc_beta,
      age_sec: 5,
      min_rr: 2.0,
      leverage_cap: 3,
      data_staleness_sec: 30,
      prices: historicalData,
      ma50,
      dataStale: false
    };
  }

  private async getPrice(symbol: string): Promise<number> {
    // Real price fetching (same as before)
    const isCrypto = symbol.includes('USDT');
    return isCrypto ? await this.getCryptoPrice(symbol) : await this.getStockPrice(symbol);
  }

  private async getCryptoPrice(symbol: string): Promise<number> {
    return withBackoff(async () => {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as any;
      return parseFloat(data.price);
    }, `crypto-price-${symbol}`).catch(() => this.getFallbackPrice(symbol));
  }

  private async getStockPrice(symbol: string): Promise<number> {
    // Try to get latest price from cache first
    const { marketDataCache } = await import('../data/market-cache');
    const cached = await marketDataCache.getCachedData(symbol);
    
    if (cached && cached.data.length > 0) {
      const latestCandle = cached.data[cached.data.length - 1];
      console.log(`📦 Using cached price for ${symbol}: ${latestCandle.c}`);
      return latestCandle.c;
    }

    // Fallback to individual fetch if not in cache
    return withBackoff(async () => {
      const yahooSymbol = this.getYahooSymbol(symbol);
      
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Referer': 'https://finance.yahoo.com/'
        }
      });
      
      if (response.status === 429) {
        throw new Error('RATE_LIMITED');
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json() as any;
      
      if (data.chart?.error) {
        throw new Error(`YAHOO_ERROR: ${data.chart.error.description}`);
      }
      
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (!price) throw new Error('No price data');
      return price;
    }, `stock-price-${symbol}`).catch((error) => {
      console.log(`⚠️ ${symbol} price fetch failed: ${error.message}, using fallback`);
      return this.getFallbackPrice(symbol);
    });
  }

  // Convert internal symbol to Yahoo Finance symbol
  private getYahooSymbol(symbol: string): string {
    // BIST stocks (Turkish) need .IS suffix - include all BIST symbols from .env
    const bistSymbols = ['THYAO', 'AKBNK', 'GARAN', 'ISCTR', 'TUPRS', 'KCHOL', 'SAHOL', 'EREGL', 'ARCLK', 'BIMAS', 'KOZAL', 'TCELL', 'PETKM', 'SISE', 'KOZAA', 'FROTO', 'HALKB', 'VAKBN', 'TKFEN', 'TOASO'];
    
    if (bistSymbols.includes(symbol)) {
      return `${symbol}.IS`; // Add .IS suffix for BIST stocks
    }
    
    return symbol; // S&P 500 stocks use symbol as-is
  }

  private getFallbackPrice(symbol: string): number {
    const prices: Record<string, number> = {
      // Crypto
      'BTCUSDT': 105000,
      'ETHUSDT': 3800,
      'SOLUSDT': 220,
      'ADAUSDT': 1.2,
      'DOTUSDT': 8.5,
      'LINKUSDT': 28,
      'AVAXUSDT': 45,
      // S&P 500
      'AAPL': 230,
      'MSFT': 440,
      'GOOGL': 180,
      'TSLA': 350,
      'NVDA': 140,
      'AMZN': 185,
      'META': 580,
      'NFLX': 670,
      // BIST 100 (in Turkish Lira)
      'THYAO': 450,
      'AKBNK': 25,
      'GARAN': 120,
      'ISCTR': 185,
      'TUPRS': 80,
      'KCHOL': 110,
      'SAHOL': 95,
      'EREGL': 55,
      'ARCLK': 160,
      'BIMAS': 190
    };
    return prices[symbol] || 100;
  }

  // Yahoo Finance OHLCV fetching for stocks and BIST with rate limiting
  private async fetchOHLCVYahoo(symbol: string, interval: string = '1h', limit: number = 500): Promise<any[]> {
    const yahooSymbol = this.getYahooSymbol(symbol);
    
    // Convert interval to Yahoo Finance format
    const yahooInterval = interval === '1h' ? '1h' : interval === '6h' ? '1d' : '1h';
    const range = limit > 100 ? '1mo' : '7d'; // Adjust range based on limit
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yahooInterval}&range=${range}`;
    
    try {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 300));
      
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(12000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Referer': 'https://finance.yahoo.com/',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      // Handle rate limiting specifically
      if (response.status === 429) {
        console.log(`⚠️ ${symbol} rate limited, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        throw new Error("RATE_LIMITED_RETRY");
      }
      
      if (!response.ok) {
        throw new Error(`YAHOO_HTTP_${response.status}`);
      }
      
      const data = await response.json() as any;
      
      // Check for Yahoo Finance specific errors
      if (data.chart?.error) {
        throw new Error(`YAHOO_ERROR: ${data.chart.error.description}`);
      }
      
      const result = data.chart?.result?.[0];
      
      if (!result?.timestamp?.length) {
        throw new Error("YAHOO_NO_TIMESTAMP_DATA");
      }
      
      const timestamps = result.timestamp;
      const quotes = result.indicators?.quote?.[0];
      
      if (!quotes) {
        throw new Error("YAHOO_NO_QUOTE_DATA");
      }
      
      const candles = timestamps.map((ts: number, i: number) => ({
        t: ts * 1000, // Convert to milliseconds
        o: quotes.open?.[i] || 0,
        h: quotes.high?.[i] || 0,
        l: quotes.low?.[i] || 0,
        c: quotes.close?.[i] || 0,
        v: quotes.volume?.[i] || 0
      })).filter((candle: any) => candle.c > 0); // Filter out invalid candles
      
      if (candles.length === 0) {
        throw new Error("YAHOO_NO_VALID_CANDLES");
      }
      
      // Validate we have recent data
      const latestTs = candles[candles.length - 1].t;
      const ageHours = (Date.now() - latestTs) / (1000 * 60 * 60);
      if (ageHours > 24) {
        logOnce(`old-yahoo-data:${symbol}`, `⚠️ ${symbol} Yahoo data is ${ageHours.toFixed(1)}h old`);
      }
      
      return candles.slice(-limit); // Return last N candles
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ ${symbol} OHLCV fetch failed: ${errorMsg}`);
      throw new Error(`YAHOO_FETCH_FAILED: ${errorMsg}`);
    }
  }

  // Real OHLCV fetching with Binance API - EXPANDED DATA COLLECTION
  private async fetchOHLCVBinance(symbol: string, interval: string = '1h', limit: number = 500): Promise<any[]> {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    
    try {
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'AI-Trading-Bot/2.0'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown');
        throw new Error(`BINANCE_HTTP_${response.status}: ${errorText}`);
      }
      
      const rows = await response.json() as any[];
      if (!rows?.length) {
        throw new Error("BINANCE_KLINES_EMPTY_RESPONSE");
      }
      
      const candles = rows.map(r => ({ 
        t: +r[0], // timestamp
        o: +r[1], // open
        h: +r[2], // high  
        l: +r[3], // low
        c: +r[4], // close
        v: +r[5]  // volume
      }));
      
      // Validate we have recent data
      const latestTs = candles[candles.length - 1].t;
      const ageHours = (Date.now() - latestTs) / (1000 * 60 * 60);
      if (ageHours > 2) {
        logOnce(`old-binance-data:${symbol}`, `⚠️ ${symbol} Binance data is ${ageHours.toFixed(1)}h old`);
      }
      
      return candles;
    } catch (error) {
      throw new Error(`BINANCE_FETCH_FAILED: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async getHistoricalPrices(symbol: string, periods: number = 500): Promise<{ prices: number[], stale: boolean }> {
    // Try cache first for all symbols
    const { marketDataCache } = await import('../data/market-cache');
    const result = await marketDataCache.getOHLCV(symbol, periods);
    
    if (result.data.length > 0) {
      const prices = result.data.map(candle => candle.c); // Close prices
      const latestTs = result.data[result.data.length - 1].t;
      const ageSec = Math.max(0, (Date.now() - latestTs) / 1000);
      
      // Dynamic staleness based on timeframe
      const timeframe = symbol.includes('USDT') ? '6h' : '1h';
      const stale = isStale(ageSec, timeframe);
      
      const cacheStatus = result.fromCache ? '(CACHED)' : '(FRESH)';
      console.log(`📈 ${symbol} OHLCV: ${prices.length} candles, latest ${Math.round(ageSec)}s ago ${stale ? '(STALE)' : '(FRESH)'} ${cacheStatus}`);
      return { prices, stale };
    }
    
    // If cache completely fails, fall back to individual fetch for crypto only
    const isCrypto = symbol.includes('USDT');
    
    if (isCrypto) {
      try {
        const ohlcv = await withBackoff(async () => {
          return await this.fetchOHLCVBinance(symbol, '6h', periods);
        }, `ohlcv-${symbol}`);
        
        const prices = ohlcv.map(candle => candle.c);
        const latestTs = ohlcv[ohlcv.length - 1].t;
        const ageSec = Math.max(0, (Date.now() - latestTs) / 1000);
        
        const stale = isStale(ageSec, '6h');
        
        console.log(`📈 ${symbol} OHLCV (fallback): ${prices.length} candles, latest ${Math.round(ageSec)}s ago ${stale ? '(STALE)' : '(FRESH)'}`);
        return { prices, stale };
      } catch (error) {
        logOnce(`ohlcv-failed:${symbol}`, `❌ Failed to fetch OHLCV for ${symbol}: ${error}`);
        return { prices: [], stale: true };
      }
    } else {
      // For stocks - complete fallback since cache should handle these
      console.log(`📡 ${symbol} using fallback - no cached stock data available`);
      return { prices: [], stale: true };
    }
  }

  private calculateRSI(prices: number[], periods: number = 14): number {
    if (prices.length < periods + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= periods; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / periods;
    const avgLoss = losses / periods;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateATR(prices: number[], currentPrice: number): number {
    if (prices.length < 14) return currentPrice * 0.02;
    
    let atrSum = 0;
    for (let i = 1; i < Math.min(14, prices.length); i++) {
      const tr = Math.abs(prices[i] - prices[i - 1]);
      atrSum += tr;
    }
    
    return (atrSum / 13) / currentPrice * 100; // ATR as percentage
  }

  private calculateMASlope(prices: number[], periods: number): number {
    if (prices.length < periods * 2) return 0;
    
    const recentPrices = prices.slice(-periods);
    const priorPrices = prices.slice(-periods * 2, -periods);
    
    if (recentPrices.length === 0 || priorPrices.length === 0) return 0;
    
    const recentMA = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const priorMA = priorPrices.reduce((a, b) => a + b, 0) / priorPrices.length;
    
    return priorMA === 0 ? 0 : (recentMA - priorMA) / priorMA;
  }

  private calculateADX(prices: number[]): number {
    // Simplified ADX calculation
    if (prices.length < 20) return 15;
    
    let dmSum = 0;
    for (let i = 1; i < Math.min(14, prices.length); i++) {
      dmSum += Math.abs(prices[i] - prices[i - 1]);
    }
    
    return Math.min(50, Math.max(10, dmSum / 13 * 1000)); // Scale to reasonable range
  }

  private async getOrderBookData(symbol: string): Promise<{ imb10: number } | undefined> {
    // Mock orderbook imbalance (would be real API in production)
    return { imb10: -0.05 + Math.random() * 0.1 };
  }

  private async getDerivativesData(symbol: string): Promise<{ funding: number; oi_delta_24h: number; basis_bps: number } | undefined> {
    if (!symbol.includes('USDT')) return undefined;
    
    return {
      funding: -0.01 + Math.random() * 0.02,
      oi_delta_24h: -0.1 + Math.random() * 0.2,
      basis_bps: -20 + Math.random() * 40
    };
  }

  private async getSentimentData(symbol: string): Promise<{ pol: number } | undefined> {
    return { pol: -0.2 + Math.random() * 0.4 };
  }

  private async getBTCBeta(symbol: string): Promise<number | undefined> {
    if (symbol === 'BTCUSDT') return 1.0;
    if (symbol.includes('USDT')) return 0.5 + Math.random() * 1.0;
    return 0.1 + Math.random() * 0.3; // Stocks have lower crypto correlation
  }
}

// V2 AI Analysis Function with market gates and model selection
export async function analyzeAssetV2(symbol: string, model?: string): Promise<Decision> {
  console.log('🔬 V2 Analysis starting for', symbol);
  
  // Respect user opt-out list from environment (comma-separated symbols)
  const skipEnv = (process.env.SKIP_ANALYSIS_ASSETS || process.env.SKIP_ANALYZE_ASSETS || '');
  const skipList = skipEnv.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (skipList.includes(symbol.toUpperCase())) {
    console.log(`⏭️ Skipping analysis for ${symbol} per SKIP_ANALYSIS_ASSETS`);
    // Return a low-confidence HOLD decision to avoid analysis and downstream actions
    return createHoldDecision(symbol, { age_sec: 0, data_staleness_sec: 999, prices: [] }, 'skipped_by_env');
  }
  
  const dataService = new EnhancedMarketDataService();
  const analysisData = await dataService.getEnhancedTechnicalData(symbol);
  
  // Market-hours gate for equities/BIST
  const latestTimestamp = Date.now() - (analysisData.age_sec * 1000);
  const equityGate = applyEquityGates(symbol, analysisData.timeframe, latestTimestamp);
  if (equityGate?.forceHold) {
    console.log(`⏰ ${symbol} forced to HOLD: ${equityGate.reason}`);
    return createHoldDecision(symbol, analysisData, equityGate.reason);
  }
  
  // HOLD on missing OHLCV or staleness
  if (analysisData.dataStale || analysisData.age_sec > analysisData.data_staleness_sec) {
    const reason = analysisData.dataStale ? 'stale_or_missing_OHLCV' : 'data_too_old';
    console.log(`📡 ${symbol} forced to HOLD: ${reason}`);
    return createHoldDecision(symbol, analysisData, reason);
  }

  // Crypto freshness gate - check OHLCV cache staleness
  if (analysisData.data_staleness_sec && analysisData.data_staleness_sec > 180) {
    // If OHLCV is older than 3 minutes, don't trade
    console.log(`📡 ${symbol} crypto data too stale (${analysisData.data_staleness_sec}s), forcing HOLD`);
    return createHoldDecision(symbol, analysisData, 'stale_crypto_data', { confidenceCap: 0.28 });
  }
  
  // Regime analysis to prevent ETH-type mistakes
  const regime = analyzeRegime({
    prices: analysisData.prices,
    ma50: analysisData.ma50,
    atr: analysisData.atr,
    rsi: analysisData.rsi,
    adx: analysisData.adx
  }, analysisData.price);
  
  console.log(`🎯 ${symbol} regime: ${regime.trend_regime}, strength: ${regime.trend_strength.toFixed(1)}, RSI longs allowed: ${regime.allow_rsi_longs}`);
  
  // Call AI with V2 prompt (with model option) - Default to GPT-5-mini for speed and cost
  const selectedModel = model || process.env.AI_MODEL || 'openai/gpt-5-mini';
  console.log(`🤖 Using AI model: ${selectedModel}`);
  const aiDecision = await callAIAnalysisV2(analysisData, regime, selectedModel);
  
  // Validate and auto-repair
  const repairedDecision = validateAndRepair(aiDecision as any, analysisData.atr, analysisData.price);
  
  // Final validation with Zod
  const validatedDecision = DecisionSchema.parse(repairedDecision);
  
  // RR floor check before returning
  const rrMid = (() => {
    const e = getEntryMid(validatedDecision.entry);
    const sl = validatedDecision.stop;
    const t = Array.isArray(validatedDecision.targets) && validatedDecision.targets[0]?.price || 0;
    if (!e || !sl || !t) return 0;
    const sideLong = validatedDecision.position === 'long';
    const risk = sideLong ? e - sl : sl - e;
    const reward = sideLong ? t - e : e - t;
    return (risk > 0) ? reward / risk : 0;
  })();

  if (rrMid < (analysisData.min_rr ?? 1.5)) {
    console.log(`📊 ${symbol} RR too low (${rrMid.toFixed(2)}), forcing HOLD`);
    return createHoldDecision(symbol, analysisData, 'rr_below_threshold', { confidenceCap: 0.32 });
  }

  // Apply confidence shaping based on regime and position
  let conf = validatedDecision.confidence ?? 0.55;
  if (regime.volatility_regime === 'high') conf = Math.min(conf, 0.65);
  if (validatedDecision.position === 'hold') conf = Math.min(conf, 0.35);
  (validatedDecision as any).confidence = conf;
  
  console.log(`✅ ${symbol} final decision: ${validatedDecision.position} at ${validatedDecision.confidence.toFixed(2)} confidence`);
  
  return validatedDecision;
}

// Helper to create hold decisions for gated scenarios - V3 with confidence clamping
function createHoldDecision(symbol: string, data: any, reason: string, opts?: { confidenceCap?: number }): Decision {
  const cap = opts?.confidenceCap ?? 0.25; // Default max confidence for holds
  
  return DecisionSchema.parse({
    asset: symbol,
    market: symbol.includes('USDT') ? 'crypto' : 'equity',
    timeframe: '6h',
    timestamp_ms: Date.now(),
    position: 'hold',
    entry: { type: 'zone', lower: 0, upper: 0 },
    stop: 0,
    targets: [{ price: 0, size_pct: 100 }],
    rr_min: 2.0,
    realized_rr_est: 0,
    leverage: 0,
    size_pct: 0,
    data_quality: {
      age_sec: data.age_sec || 999,
      coverage: { price: true },
      stale: true
    },
    feature_scores: {
      trend: 0.3,
      momentum: 0.3,
      rsi_signal: 0.3,
      risk: 0.8
    },
    confidence: Math.min(cap, 0.25), // Clamp confidence low for fallbacks
    rationale: `Hold: ${reason}`
  });
}

// Contract firewall - reject responses with extra keys
function parseModelOutput(raw: string): Decision {
  let obj: any;
  try { 
    obj = JSON.parse(raw); 
  } catch (e) { 
    throw new Error("LLM_JSON_PARSE_ERROR"); 
  }

  // Hard block unexpected top-level keys
  const allowed = new Set([
    "asset","market","timeframe","timestamp_ms","position","entry","stop","targets",
    "rr_min","realized_rr_est","leverage","size_pct","data_quality","feature_scores","confidence","rationale"
  ]);
  const extra = Object.keys(obj).filter(k => !allowed.has(k));
  if (extra.length) {
    throw new Error("LLM_CONTRACT_VIOLATION:" + extra.join(","));
  }

  return DecisionSchema.parse(obj); // throws on invalid
}

// Rich data analysis request - include extensive historical data
function buildCompactRequest(data: AnalysisRequestV2, regime: RegimeAnalysis): object {
  const compactRequest = {
    asset: data.asset,
    timeframe: data.timeframe,
    price: data.price,
    atr_pct: data.atr,
    ma50_slope: data.ma50_slope,
    adx: data.adx,
    rsi: data.rsi,
    // Include ALL available data for better analysis
    ...(data.orderbook && { orderbook: data.orderbook }),
    ...(data.deriv && { deriv: data.deriv }),
    ...(data.sentiment && { sentiment: data.sentiment }),
    ...(data.btc_beta !== undefined && { btc_beta: data.btc_beta }),
    age_sec: data.age_sec,
    min_rr: data.min_rr,
    leverage_cap: data.leverage_cap,
    data_staleness_sec: data.data_staleness_sec,
    // Include rich historical price data for comprehensive analysis
    historical_prices: data.prices.slice(-100), // Last 100 data points (25 days of 6h candles)
    price_statistics: {
      recent_high: Math.max(...data.prices.slice(-50)),
      recent_low: Math.min(...data.prices.slice(-50)),
      price_change_30d: data.prices.length > 120 ? ((data.price - data.prices[data.prices.length - 120]) / data.prices[data.prices.length - 120] * 100) : 0,
      volatility_30d: data.prices.length > 120 ? calculateVolatility(data.prices.slice(-120)) : 0
    },
    regime: {
      trend: regime.trend_regime,
      strength: regime.trend_strength,
      volatility: regime.volatility_regime,
      allow_rsi_longs: regime.allow_rsi_longs,
      allow_rsi_shorts: regime.allow_rsi_shorts
    }
  };
  
  // EXPANDED DATA - NO TOKEN LIMITS (user wants more data for better analysis)
  const payload = JSON.stringify(compactRequest);
  console.log(`📦 Payload size: ${payload.length} chars (no limits - rich data for better analysis)`);
  return compactRequest;
}

async function callAIAnalysisV2(data: AnalysisRequestV2, regime: RegimeAnalysis, model: string = 'openai/gpt-5-mini'): Promise<Decision> {
  // Use iterative analysis for maximum accuracy
  try {
    const { iterativeAnalyzer } = await import('../analysis/iterative-analyzer');
    console.log(`🔄 Using optimized iterative analysis for ${data.asset} (3 focused questions)`);
    
    const result = await iterativeAnalyzer.analyzeAssetIteratively(
      data.asset,
      data,
      regime,
      model
    );
    
    console.log(`✅ Iterative analysis complete: ${(result.overallConfidence * 100).toFixed(1)}% confidence`);
    console.log(`🎯 Consensus factors: ${result.consensusFactors.join(', ')}`);
    
    // Update confidence based on iterative analysis
    result.finalDecision.confidence = result.overallConfidence;
    
    return result.finalDecision;
    
  } catch (error) {
    console.log(`⚠️ Iterative analysis failed: ${error}, falling back to single-shot`);
    return callAIAnalysisV2Single(data, regime, model);
  }
}

// Original single-shot analysis as fallback
async function callAIAnalysisV2Single(data: AnalysisRequestV2, regime: RegimeAnalysis, model: string = 'openai/gpt-5-mini'): Promise<Decision> {
  const systemPrompt = `You are **Elite AI Quant Strategist** - maximize analysis depth and precision.

🎯 MISSION: Deep multi-dimensional analysis for optimal 6h+ trading decisions with maximum edge extraction.

📊 ANALYSIS FRAMEWORK:
• Trend Analysis: Multi-timeframe momentum, strength, and sustainability assessment
• Technical Confluence: Price action, volume patterns, key S/R levels, volatility dynamics  
• Risk/Reward Optimization: Precise entry zones, stops, targets with 2.5:1+ RR mandatory
• Market Regime: Macro context, sector rotation, correlation analysis, liquidity conditions
• Behavioral Edge: Sentiment extremes, positioning, mean reversion vs momentum signals

⚡ HIGH-EFFICIENCY REASONING:
Use GPT-5-mini's advanced reasoning to:
1. Synthesize ALL available data points into coherent market narrative
2. Identify highest-probability setups with asymmetric risk/reward
3. Quantify confidence based on signal strength and data quality
4. Generate precise entry/exit mechanics with contingency planning

📋 OUTPUT: Strict JSON only. Zero explanations outside rationale field.

💎 RATIONALE (≤280 chars): Concise synthesis of key factors, levels, and thesis.

🔒 RULES: "hold" if RR<2.5 or weak confluence. "long"/"short" only for high-conviction multi-factor setups.`;

  const compactData = buildCompactRequest(data, regime);
  const userPrompt = `📈 MARKET DATA: ${JSON.stringify(compactData)}

🔬 DEEP ANALYSIS REQUIRED:
• Historical price patterns (${data.prices?.length || 0} data points)
• Regime context: ${regime.trend_regime} trend, strength ${regime.trend_strength.toFixed(1)}
• Technical indicators: RSI ${data.rsi?.toFixed(1)}, ATR ${data.atr?.toFixed(3)}%
• Data freshness: ${data.age_sec}s old

⚡ USE HIGH-EFFORT REASONING TO:
1. Identify multi-timeframe trend confluence
2. Assess mean reversion vs momentum probabilities  
3. Quantify optimal entry/exit zones with precision
4. Evaluate risk factors and position sizing logic

📋 JSON CONTRACT: ${JSON.stringify(JSON_CONTRACT)}

🎯 OUTPUT: Return ONLY valid JSON. Use your advanced reasoning to maximize analytical depth.

⚠️ CRITICAL: Reserve at least 500 tokens for JSON response. Complete the JSON even if reasoning exceeds typical limits.`;

  let lastError: Error | null = null;
  
  // V3 Enhanced AI call with timeout and retry
  try {
    const { callDecisionLLM, STAGE_D_SYSTEM_PROMPT } = await import('../stages/stage-d');
    const response = await callDecisionLLM(STAGE_D_SYSTEM_PROMPT, userPrompt, model);
    
    if (response) {
      // Enhanced contract firewall - check for rankings or extra keys
      const rawResponse = typeof response === 'string' ? response : JSON.stringify(response);
      
      // Detect multi-asset responses
      if (rawResponse.includes('"ranking"') || rawResponse.includes('[{"asset"')) {
        logOnce(`contract-violation:${data.asset}`, `❌ LLM returned multi-asset response for ${data.asset}`);
        throw new Error('LLM_CONTRACT_VIOLATION:multi_asset_response');
      }
      
      return parseModelOutput(rawResponse);
    }
  } catch (error) {
    lastError = error as Error;
    logOnce(`ai-fallback:${data.asset}`, `⚠️ AI call failed for ${data.asset}: ${error}`);
  }
  
  // Retry once with stricter prompt if contract violation
  if (lastError?.message.includes('LLM_CONTRACT_VIOLATION')) {
    try {
      const stricterPrompt = `${systemPrompt}

🚨 SECOND ATTEMPT: Previous response violated contract. Return ONLY a single Decision object for ${data.asset}. No ranking arrays.`;
      const response = await withBackoff(async () => {
        return await callOpenRouterAI(stricterPrompt, userPrompt, model);
      }, `ai-retry-${data.asset}`);
      
      if (response) {
        const rawResponse = typeof response === 'string' ? response : JSON.stringify(response);
        return parseModelOutput(rawResponse);
      }
    } catch (retryError) {
      logOnce(`ai-retry-failed:${data.asset}`, `❌ AI retry failed for ${data.asset}: ${retryError}`);
    }
  }
  
  // Regime-aware fallback
  logOnce(`fallback:${data.asset}`, `🔄 Using regime-based fallback for ${data.asset}`);
  const fallback = createRegimeAwareFallback(data, regime);
  return DecisionSchema.parse(fallback);
}

function createRegimeAwareFallback(data: AnalysisRequestV2, regime: RegimeAnalysis): Partial<Decision> {
  const { asset, price, rsi, atr, min_rr } = data;
  
  // Enhanced strategy logic for 6h+ timeframes
  let position: 'long' | 'short' | 'hold' = 'hold';
  let confidence = 0.5;
  let rationale = 'Mixed signals; awaiting clearer 6h+ setup with better RR';
  
  // Strategy Analysis: Focus on major moves suitable for 6h+ timeframes
  const trendStrength = regime.trend_strength;
  const trendQuality = regime.trend_quality;
  
  // Enhanced 6h+ Strategy Logic
  if (regime.trend_regime === 'up' && trendStrength > 25 && trendQuality > 0.6) {
    if (rsi >= 35 && rsi <= 65) {
      position = 'long';
      confidence = 0.75;
      rationale = `Strong uptrend (ADX ${trendStrength.toFixed(0)}) with healthy RSI ${rsi.toFixed(0)}. Trend continuation strategy targeting major levels.`;
    }
  } else if (regime.trend_regime === 'down' && trendStrength > 25 && trendQuality > 0.6) {
    if (rsi >= 35 && rsi <= 65) {
      position = 'short';
      confidence = 0.75;
      rationale = `Strong downtrend (ADX ${trendStrength.toFixed(0)}) with momentum intact. Trend continuation strategy for 6h+ timeframe.`;
    }
  } else if (regime.trend_regime === 'flat' && trendStrength < 20) {
    // Range-bound strategy for consolidation
    if (rsi < 35) {
      position = 'long';
      confidence = 0.6;
      rationale = `Range-bound market: RSI ${rsi.toFixed(0)} oversold bounce expected. Mean reversion strategy with tight stops.`;
    } else if (rsi > 65) {
      position = 'short';
      confidence = 0.6;
      rationale = `Range-bound market: RSI ${rsi.toFixed(0)} overbought reversal expected. Mean reversion strategy with tight stops.`;
    }
  }
  
  // ETH Protection: Block dangerous setups
  if (rsi < 30 && regime.trend_regime === 'down' && trendStrength > 25) {
    position = 'hold';
    confidence = 0.3;
    rationale = 'RSI oversold in strong downtrend: High risk of further decline. Awaiting trend exhaustion signals.';
  }
  
  // Calculate feature scores
  const feature_scores = {
    trend: regime.trend_regime === 'up' ? 0.8 : regime.trend_regime === 'down' ? 0.2 : 0.5,
    momentum: rsi > 60 ? 0.7 : rsi < 40 ? 0.3 : 0.5,
    rsi_signal: rsi < 30 ? 0.8 : rsi > 70 ? 0.2 : 0.5,
    risk: regime.volatility_regime === 'high' ? 0.8 : 0.3
  };
  
  // Calculate deterministic confidence
  const coverage = {
    price: true,
    orderbook: !!data.orderbook,
    derivatives: !!data.deriv,
    sentiment: !!data.sentiment,
    correlations: !!data.btc_beta
  };
  
  let finalConfidence = calculateConfidence(coverage, data.age_sec, data.data_staleness_sec, feature_scores);
  
  // V3 Fallback confidence clamping - fallbacks should have low confidence
  finalConfidence = Math.min(finalConfidence, 0.25);
  
  return {
    asset,
    market: asset.includes('USDT') ? 'crypto' : 'equity',
    timeframe: '1h',
    timestamp_ms: Date.now(),
    position,
    entry: position === 'hold' ? { type: 'zone', lower: 0, upper: 0 } : {
      type: 'zone',
      lower: price * 0.998,
      upper: price * 1.002
    },
    stop: position === 'long' ? price * 0.95 : position === 'short' ? price * 1.05 : 0,
    targets: position === 'hold' ? [{ price: 0, size_pct: 100 }] : [
      { price: position === 'long' ? price * 1.1 : price * 0.9, size_pct: 50 },
      { price: position === 'long' ? price * 1.2 : price * 0.8, size_pct: 50 }
    ],
    rr_min: min_rr,
    realized_rr_est: position === 'hold' ? 0 : 2.5,
    leverage: position === 'hold' ? 0 : (asset.includes('USDT') ? 2 : 1),
    size_pct: 20,
    data_quality: {
      age_sec: data.age_sec,
      coverage,
      stale: data.age_sec > data.data_staleness_sec
    },
    feature_scores,
    confidence: finalConfidence,
    rationale
  };
}

// Freshness helper
function isFreshTs(tsMs: number, maxAgeSec = 90): boolean {
  return Date.now() - tsMs <= maxAgeSec * 1000;
}

// Compact 7-line formatter
export function toCompactLines(d: Decision, currentPrice?: number): string {
  const fmt = (n: number) => Number(n.toFixed(6));
  const entryMid = getEntryMid(d.entry);
  const t0 = Array.isArray(d.targets) && d.targets[0]?.price || 0;
  const price = currentPrice ?? entryMid; // Use provided price or fallback to entry mid
  return [
    `coin: ${d.asset.replace(/USDT$/,'')}`,
    `confidence: ${Math.round((d.confidence ?? 0)*100)}%`,
    `current_price: ${fmt(price)}`,
    `entry_price: ${fmt(entryMid)}–${fmt(entryMid)}`,
    `tp: ${fmt(t0)}–${fmt(t0)}`,
    `sl: ${fmt(d.stop || 0)}–${fmt(d.stop || 0)}`,
    `additional: RR≥${(d.rr_min ?? 1.5).toFixed(1)}, ${d.position}`
  ].join('\n');
}

// Enhanced AI call with validation, retries, and schema enforcement
export async function callOpenRouterAI(systemPrompt: string, userPrompt: string, model: string = 'openai/gpt-5-mini', expectedSchema?: any): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logOnce('missing-api-key', '⚠️ OPENROUTER_API_KEY not found in environment');
    return null;
  }
  
  // Import dependencies
  const { getModelConfig } = await import('../models/ai-models');
  const { validateAndRepair } = await import('../core/decision-schema');
  const { sanitizeDecision, cleanJsonFromText } = await import('../utils/sanitizer');
  
  const config = getModelConfig(model);
  const maxRetries = 3;
  let lastError: string = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 AI call attempt ${attempt}/${maxRetries} for ${model}`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ai-trading-bot.local',
          'X-Title': 'AI Trading Bot V3 - Enhanced'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { 
              role: 'system', 
              content: systemPrompt + (attempt > 1 ? `\n\n🚨 RETRY ${attempt}: Previous response failed validation. MUST return valid JSON only.` : '')
            },
            { role: 'user', content: userPrompt }
          ],
          temperature: config.temperature + (attempt - 1) * 0.01, // Slightly increase temp on retries
          max_tokens: config.max_tokens,
          stop: config.stop,
          ...(config.reasoning && { reasoning: config.reasoning }),
          ...(config.response_format && { response_format: config.response_format })
        }),
        signal: AbortSignal.timeout(60000)
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json() as any;
      
      // Debug logging
      console.log(`🔍 API Response attempt ${attempt}:`, {
        status: response.status,
        choices: data.choices?.length || 0,
        usage: data.usage,
        finishReason: data.choices?.[0]?.finish_reason
      });
      
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error(`Empty response from AI model. Response: ${JSON.stringify(data)}`);
      }
      
      // Post-processing validation
      const validatedContent = await validateAIResponse(content, expectedSchema, attempt);
      
      if (validatedContent) {
        console.log(`✅ AI call successful on attempt ${attempt}`);
        return validatedContent;
      } else {
        lastError = `Response failed validation on attempt ${attempt}`;
        console.log(`⚠️ ${lastError}`);
        continue;
      }
      
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.log(`❌ Attempt ${attempt} failed: ${lastError}`);
      
      if (attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw new Error(`AI_CALL_FAILED after ${maxRetries} attempts: ${lastError}`);
}

// Post-processing validator and response cleaner with contract firewall
async function validateAIResponse(content: string, expectedSchema?: any, attempt: number = 1): Promise<any> {
  try {
    // Step 1: Clean the response using enhanced cleaner
    const { cleanJsonFromText, sanitizeDecision } = await import('../utils/sanitizer');
    const cleaned = cleanJsonFromText(content);
    
    // Step 2: Try to parse as JSON
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      // Try to extract JSON from text with fallback
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          console.log(`🔧 JSON parsing failed on attempt ${attempt}, no valid JSON found`);
          return null;
        }
      } else {
        console.log(`🔧 No JSON structure found on attempt ${attempt}`);
        return null;
      }
    }
    
    // Step 3: Apply contract firewall - sanitize and check for NaN/Infinity
    try {
      const sanitized = sanitizeDecision(parsed);
      console.log(`✅ Contract firewall passed on attempt ${attempt}`);
      return sanitized;
    } catch (sanitizeError) {
      console.log(`🚫 Contract firewall failed on attempt ${attempt}: ${sanitizeError}`);
      
      // Try to repair using existing validator before giving up
      try {
        const { validateAndRepair } = await import('../core/decision-schema');
        const repaired = validateAndRepair(parsed, 0.02, 50000);
        
        if (repaired && repaired.position && repaired.confidence !== undefined) {
          console.log(`🔧 Response repaired after firewall failure`);
          return repaired;
        }
      } catch (repairError) {
        // Repair also failed
      }
      
      return null;
    }
    
  } catch (error) {
    console.log(`⚠️ Validation error on attempt ${attempt}: ${error}`);
    return null;
  }
}

// Legacy function removed - using enhanced sanitize.ts instead

// Simple schema validation
function validateAgainstSchema(data: any, schema: any): boolean {
  if (!data || typeof data !== 'object') return false;
  
  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data)) {
        console.log(`❌ Missing required field: ${field}`);
        return false;
      }
    }
  }
  
  // Check field types and constraints
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties) as any) {
      if (field in data) {
        const value = data[field];
        
        // Type checking
        if (fieldSchema.type === 'string' && typeof value !== 'string') return false;
        if (fieldSchema.type === 'number' && typeof value !== 'number') return false;
        
        // Enum checking
        if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
          console.log(`❌ Field ${field} value ${value} not in enum ${fieldSchema.enum}`);
          return false;
        }
        
        // Range checking
        if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) return false;
        if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) return false;
      }
    }
  }
  
  return true;
}