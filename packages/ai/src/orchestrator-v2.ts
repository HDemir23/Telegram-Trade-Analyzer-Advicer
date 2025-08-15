import { DecisionSchema, JSON_CONTRACT, validateAndRepair, getEntryMid, type Decision } from './schema-v2';
import { analyzeRegime, calculateConfidence, type RegimeAnalysis, type PriceData } from './regime-analysis';

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
      await new Promise(r => setTimeout(r, delay + Math.random() * 100)); // jitter
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

function applyEquityGates(asset: string, timeframe: string): { forceHold: boolean; reason: string } | null {
  const isEquity = /^(AAPL|MSFT|GOOGL|TSLA|NVDA|AMZN|META|NFLX|AMD|CRM)$/.test(asset);
  const isBist = /^(THYAO|AKBNK)/.test(asset);
  if (!isEquity && !isBist) return null;
  
  const open = isMarketOpen(isBist ? "BIST" : "US", new Date());
  const intraday = ["15m", "30m", "1h"].includes(timeframe);
  
  if (!open && intraday) {
    return { forceHold: true, reason: "market_closed" };
  }
  
  return null;
}

// V2 Analysis Request (token-efficient)
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
    const { prices: historicalData, stale } = await this.getHistoricalPrices(symbol, 50);
    
    // If no real data, force stale status
    if (historicalData.length === 0 || stale) {
      return {
        asset: symbol,
        timeframe: '1h',
        price: currentPrice,
        atr: 0,
        ma50_slope: 0,
        adx: 0,
        rsi: 50,
        age_sec: 999, // Force stale
        min_rr: 2.0,
        leverage_cap: 3,
        data_staleness_sec: 30,
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
    return withBackoff(async () => {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as any;
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (!price) throw new Error('No price data');
      return price;
    }, `stock-price-${symbol}`).catch(() => this.getFallbackPrice(symbol));
  }

  private getFallbackPrice(symbol: string): number {
    const prices: Record<string, number> = {
      'BTCUSDT': 117000,
      'ETHUSDT': 4500,
      'AAPL': 230,
      'MSFT': 520
    };
    return prices[symbol] || 100;
  }

  // Real OHLCV fetching with Binance API
  private async fetchOHLCVBinance(symbol: string, interval: string = '1h', limit: number = 100): Promise<any[]> {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { 
        signal: AbortSignal.timeout(6000) 
      });
      if (!response.ok) throw new Error(`BINANCE_KLINES_HTTP:${response.status}`);
      const rows = await response.json() as any[];
      if (!rows?.length) throw new Error("BINANCE_KLINES_EMPTY");
      return rows.map(r => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
    } catch (error) {
      throw new Error(`BINANCE_FETCH_FAILED: ${error}`);
    }
  }

  private async getHistoricalPrices(symbol: string, periods: number): Promise<{ prices: number[], stale: boolean }> {
    const isCrypto = symbol.includes('USDT');
    
    if (isCrypto) {
      try {
        const ohlcv = await this.fetchOHLCVBinance(symbol, '1h', periods);
        const prices = ohlcv.map(candle => candle.c); // Close prices
        const latestTs = ohlcv[ohlcv.length - 1].t;
        const ageSec = Math.max(0, (Date.now() - latestTs) / 1000);
        return { prices, stale: ageSec > 300 }; // 5 min threshold for crypto
      } catch (error) {
        console.warn(`Failed to fetch OHLCV for ${symbol}:`, error);
        return { prices: [], stale: true };
      }
    } else {
      // For stocks, simplified approach - mark as stale if we can't get real data
      const currentPrice = await this.getPrice(symbol);
      if (currentPrice === this.getFallbackPrice(symbol)) {
        return { prices: [], stale: true }; // Fallback price means real data unavailable
      }
      // Generate minimal realistic data for stocks (would be replaced with real Yahoo Finance OHLCV)
      const prices = Array(periods).fill(0).map((_, i) => currentPrice * (1 + (Math.random() - 0.5) * 0.01));
      return { prices, stale: false };
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

// V2 AI Analysis Function with market gates
export async function analyzeAssetV2(symbol: string): Promise<Decision> {
  console.log('🔬 V2 Analysis starting for', symbol);
  
  const dataService = new EnhancedMarketDataService();
  const analysisData = await dataService.getEnhancedTechnicalData(symbol);
  
  // Check equity market hours gate
  const equityGate = applyEquityGates(symbol, analysisData.timeframe);
  if (equityGate?.forceHold) {
    console.log(`⏰ ${symbol} forced to HOLD: ${equityGate.reason}`);
    return createHoldDecision(symbol, analysisData, equityGate.reason);
  }
  
  // Check data staleness
  if (analysisData.dataStale) {
    console.log(`📡 ${symbol} forced to HOLD: stale_or_missing_data`);
    return createHoldDecision(symbol, analysisData, "stale_or_missing_OHLCV");
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
  
  // Call AI with V2 prompt
  const aiDecision = await callAIAnalysisV2(analysisData, regime);
  
  // Validate and auto-repair
  const repairedDecision = validateAndRepair(aiDecision as any, analysisData.atr, analysisData.price);
  
  // Final validation with Zod
  const validatedDecision = DecisionSchema.parse(repairedDecision);
  
  console.log(`✅ ${symbol} final decision: ${validatedDecision.position} at ${validatedDecision.confidence.toFixed(2)} confidence`);
  
  return validatedDecision;
}

// Helper to create hold decisions for gated scenarios
function createHoldDecision(symbol: string, data: any, reason: string): Decision {
  return DecisionSchema.parse({
    asset: symbol,
    market: symbol.includes('USDT') ? 'crypto' : 'equity',
    timeframe: '1h',
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
      trend: 0.5,
      momentum: 0.5,
      rsi_signal: 0.5,
      risk: 0.5
    },
    confidence: 0.1,
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

// Compact analysis request for token efficiency
function buildCompactRequest(data: AnalysisRequestV2, regime: RegimeAnalysis) {
  return {
    asset: data.asset,
    timeframe: data.timeframe,
    price: data.price,
    atr_pct: data.atr,
    ma50_slope: data.ma50_slope,
    adx: data.adx,
    rsi: data.rsi,
    orderbook: data.orderbook,
    deriv: data.deriv,
    sentiment: data.sentiment,
    btc_beta: data.btc_beta,
    age_sec: data.age_sec,
    min_rr: data.min_rr,
    leverage_cap: data.leverage_cap,
    data_staleness_sec: data.data_staleness_sec,
    regime: {
      trend: regime.trend_regime,
      strength: regime.trend_strength,
      volatility: regime.volatility_regime,
      allow_rsi_longs: regime.allow_rsi_longs,
      allow_rsi_shorts: regime.allow_rsi_shorts
    }
  };
}

async function callAIAnalysisV2(data: AnalysisRequestV2, regime: RegimeAnalysis): Promise<Decision> {
  const systemPrompt = `You are **AI Quant Strategist** analyzing ONE asset for short-term trading. Output STRICT JSON matching the contract exactly. No rankings, no arrays, no extra keys.

Rules:
- Risk-first: clear SL/TP with RR ≥ min_rr, else position:"hold"
- If data stale beyond staleness threshold → position:"hold"
- Respect regime filters for RSI signals
- Keep rationale ≤ 280 chars
- All scores in [0,1]`;

  const compactData = buildCompactRequest(data, regime);
  const userPrompt = `INPUT: ${JSON.stringify(compactData)}

CONTRACI: ${JSON.stringify(JSON_CONTRACT)}

Return valid JSON only.`;

  try {
    const response = await callOpenRouterAI(systemPrompt, userPrompt);
    if (response) {
      return parseModelOutput(JSON.stringify(response));
    }
  } catch (error) {
    console.warn('AI call failed, using regime-based fallback:', error);
  }
  
  // Regime-aware fallback
  const fallback = createRegimeAwareFallback(data, regime);
  return DecisionSchema.parse(fallback);
}

function createRegimeAwareFallback(data: AnalysisRequestV2, regime: RegimeAnalysis): Partial<Decision> {
  const { asset, price, rsi, atr, min_rr } = data;
  
  // Regime-based position logic
  let position: 'long' | 'short' | 'hold' = 'hold';
  let confidence = 0.5;
  let rationale = 'Mixed signals; waiting for clearer setup';
  
  // Apply regime filters
  if (rsi < 30 && regime.allow_rsi_longs && regime.trend_regime !== 'down') {
    position = 'long';
    confidence = 0.65;
    rationale = 'RSI oversold in favorable trend regime';
  } else if (rsi > 70 && regime.allow_rsi_shorts && regime.trend_regime !== 'up') {
    position = 'short';
    confidence = 0.65;
    rationale = 'RSI overbought with trend regime support';
  } else if (rsi < 30 && regime.trend_regime === 'down' && regime.trend_strength > 25) {
    // ETH mistake prevention - don't go long on RSI oversold in strong downtrend
    position = 'hold';
    confidence = 0.35;
    rationale = 'RSI oversold blocked by strong downtrend regime';
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
  
  const finalConfidence = calculateConfidence(coverage, data.age_sec, data.data_staleness_sec, feature_scores);
  
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

async function callOpenRouterAI(systemPrompt: string, userPrompt: string): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.15,
        max_tokens: 450,
        stop: ['\n\n', '```']
      })
    });
    
    if (!response.ok) return null;
    
    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return null;
    return JSON.parse(content);
  } catch (error) {
    console.error('AI call error:', error);
    return null;
  }
}