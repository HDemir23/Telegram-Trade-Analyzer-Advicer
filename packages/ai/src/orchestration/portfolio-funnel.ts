import { Decision, DecisionSchema, validateAndRepair } from '../core/decision-schema';
import { 
  ScreeningRequest, 
  ScreeningResult, 
  ScreeningResultSchema,
  PortfolioRequest,
  PortfolioResult,
  PortfolioResultSchema,
  ScreeningAsset,
  STAGE_S_CONTRACT,
  STAGE_P_CONTRACT
} from './funnel-schemas';
import { EnhancedMarketDataService } from '../core/main-orchestrator';

// Backoff utility from orchestrator-v2
async function withBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let delay = 250;
  let lastErr: any;
  
  for (let i = 0; i < 4; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, delay + Math.random() * 100));
      delay *= 2;
    }
  }
  
  console.warn(`❌ ${label}: ${String(lastErr)}`);
  throw lastErr;
}

// Contract firewall helper for funnel stages
function validateStageResponse(content: string, stage: 'S' | 'P'): any {
  // Clean up the content first
  let cleanContent = content.trim();
  
  // Remove markdown code blocks if present
  cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  
  // Try to extract JSON from the response
  const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanContent = jsonMatch[0];
  }
  
  // Fix common JSON issues
  cleanContent = cleanContent
    .replace(/,\s*}/g, '}')  // Remove trailing commas
    .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
    .replace(/"\s*:\s*"/g, '":"'); // Fix spacing around colons
  
  let parsed;
  try {
    parsed = JSON.parse(cleanContent);
  } catch (error) {
    console.error('JSON Parse Error:', error);
    console.error('Content:', cleanContent);
    throw new Error(`JSON_PARSE_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  if (stage === 'S') {
    // Stage S validation
    const allowedKeys = new Set(['timeframe', 'top']);
    const extraKeys = Object.keys(parsed).filter(k => !allowedKeys.has(k));
    if (extraKeys.length) {
      throw new Error(`STAGE_S_CONTRACT_VIOLATION: ${extraKeys.join(',')}`);
    }
    
    // Validate top array structure
    if (parsed.top?.some((item: any) => 
      !item.symbol || typeof item.score !== 'number' || !item.dir)) {
      throw new Error('STAGE_S_INVALID_TOP_STRUCTURE');
    }
  } else if (stage === 'P') {
    // Stage P validation
    const allowedKeys = new Set(['timeframe', 'picks', 'reserves_pct', 'diversification']);
    const extraKeys = Object.keys(parsed).filter(k => !allowedKeys.has(k));
    if (extraKeys.length) {
      throw new Error(`STAGE_P_CONTRACT_VIOLATION: ${extraKeys.join(',')}`);
    }
    
    // Validate picks array structure
    if (parsed.picks?.some((item: any) => 
      !item.asset || !item.position || typeof item.size_pct !== 'number')) {
      throw new Error('STAGE_P_INVALID_PICKS_STRUCTURE');
    }
  }
  
  return parsed;
}

// Stage S - Screening Implementation
export class QuantScreener {
  async screenAssets(request: ScreeningRequest): Promise<ScreeningResult> {
    console.log(`🔍 Stage S: Screening ${request.assets.length} assets for top ${request.top_k}`);
    
    const systemPrompt = `You are AI Quant Screener. Task: screen assets and output ONLY valid JSON.

CRITICAL: Return ONLY a JSON object with this exact structure:
{
  "timeframe": "6h",
  "top": [
    {
      "symbol": "BTCUSDT",
      "score": 0.85,
      "dir": "long",
      "rr_potential": 2.5,
      "risks": ["volatility"],
      "reason": "Strong uptrend momentum"
    }
  ]
}

NO markdown, NO code blocks, NO explanations, ONLY valid JSON.`;

    const userPrompt = `Screen these assets for minimum 6h+ timeframe opportunities. Focus on assets with strong fundamentals and clear directional bias.

Assets: ${JSON.stringify(request.assets)}
Target: Top ${request.top_k} candidates

Return only the JSON object:`;

    try {
      const response = await withBackoff(async () => {
        return await this.callAI(systemPrompt, userPrompt, 'screening');
      }, `stage-s-screening`);

      const result = ScreeningResultSchema.parse(response);
      console.log(`✅ Stage S: Found ${result.top.length} candidates`);
      return result;
      
    } catch (error) {
      console.error(`❌ Stage S failed: ${error}`);
      // Fallback: create deterministic ranking
      return this.createFallbackScreening(request);
    }
  }

  private createFallbackScreening(request: ScreeningRequest): ScreeningResult {
    console.log(`🔄 Stage S: Using fallback screening logic`);
    
    const scored = request.assets.map(asset => {
      const score = this.calculateFallbackScore(asset, request.data_staleness_sec);
      const dir = this.determineFallbackDirection(asset);
      
      return {
        symbol: asset.symbol,
        score,
        dir,
        rr_potential: score > 0.6 ? 2.5 : score > 0.4 ? 2.0 : 1.5,
        risks: this.assessRisks(asset, request.data_staleness_sec),
        reason: this.createFallbackReason(asset, score)
      };
    }).sort((a, b) => b.score - a.score).slice(0, request.top_k);

    return {
      timeframe: request.timeframe,
      top: scored
    };
  }

  private calculateFallbackScore(asset: ScreeningAsset, staleness_sec: number): number {
    // Enhanced scoring for 6h+ timeframes: 0.5*trend + 0.3*momentum + 0.15*fundamentals + 0.05*sentiment
    
    // Trend component (50% weight for longer timeframes)
    const trendScore = this.calculateTrendScore(asset);
    
    // Momentum component (30% weight)
    const momentumScore = this.calculateMomentumScore(asset);
    
    // Fundamentals component (15% weight)
    const fundamentalsScore = this.calculateFundamentalsScore(asset);
    
    // Sentiment/positioning component (5% weight)
    const sentimentScore = this.calculateSentimentScore(asset);
    
    let score = 0.5 * trendScore + 0.3 * momentumScore + 0.15 * fundamentalsScore + 0.05 * sentimentScore;
    
    // Quality penalties for 6h+ analysis
    if (asset.age_sec > staleness_sec) score *= 0.3; // Harsh penalty for stale data
    if (asset.adx < 20) score *= 0.6; // Penalty for weak trends on longer timeframes
    if (Math.abs(asset.ma50_slope) < 0.005) score *= 0.5; // Penalty for flat trends
    
    return Math.max(0, Math.min(1, score));
  }

  private calculateTrendScore(asset: ScreeningAsset): number {
    // Strong trend bias for 6h+ timeframes
    const slopeStrength = Math.abs(asset.ma50_slope);
    const adxStrength = Math.min(1, asset.adx / 50); // Normalize ADX
    
    // Favor strong, consistent trends
    if (slopeStrength > 0.02 && asset.adx > 30) return 0.9;
    if (slopeStrength > 0.01 && asset.adx > 25) return 0.75;
    if (slopeStrength > 0.005 && asset.adx > 20) return 0.6;
    
    return 0.3; // Weak trend
  }

  private calculateMomentumScore(asset: ScreeningAsset): number {
    // RSI positioning for trend continuation
    const rsi = asset.rsi;
    
    if (asset.ma50_slope > 0.01) {
      // Uptrend: favor RSI 40-70 (healthy pullbacks)
      if (rsi >= 40 && rsi <= 70) return 0.9;
      if (rsi > 30 && rsi < 80) return 0.7;
      return 0.4;
    } else if (asset.ma50_slope < -0.01) {
      // Downtrend: favor RSI 30-60 (bearish continuation)
      if (rsi >= 30 && rsi <= 60) return 0.9;
      if (rsi > 20 && rsi < 70) return 0.7;
      return 0.4;
    }
    
    return 0.5; // Neutral trend
  }

  private calculateFundamentalsScore(asset: ScreeningAsset): number {
    let score = 0.5; // Base score
    
    // Derivatives data (for crypto)
    if (asset.deriv) {
      // Positive funding + rising OI = bullish
      if (asset.deriv.fund > 0 && asset.deriv.oi_d1 > 0.05) score += 0.3;
      // Negative funding + falling OI = bearish continuation
      else if (asset.deriv.fund < -0.005 && asset.deriv.oi_d1 < -0.05) score += 0.2;
      
      // Backwardation/contango signals
      if (Math.abs(asset.deriv.basis_bps) > 20) score += 0.1;
    }
    
    // Order book depth
    if (asset.ob && Math.abs(asset.ob.imb10) < 0.05) score += 0.1; // Balanced book
    
    return Math.min(1, score);
  }

  private calculateSentimentScore(asset: ScreeningAsset): number {
    if (!asset.sent) return 0.5;
    
    // Contrarian sentiment signals for longer timeframes
    const pol = asset.sent.pol;
    
    // Extreme sentiment often marks reversals
    if (pol > 0.3) return 0.3; // Very bullish = contrarian bearish
    if (pol < -0.3) return 0.3; // Very bearish = contrarian bullish
    if (Math.abs(pol) < 0.1) return 0.8; // Neutral = good for trends
    
    return 0.6; // Moderate sentiment
  }

  private determineFallbackDirection(asset: ScreeningAsset): 'long' | 'short' | 'none' {
    if (asset.ma50_slope > 0.01 && asset.rsi < 60) return 'long';
    if (asset.ma50_slope < -0.01 && asset.rsi > 40) return 'short';
    return 'none';
  }

  private assessRisks(asset: ScreeningAsset, staleness_sec: number): ('stale' | 'thin_book' | 'trending_down' | 'overbought' | 'oversold' | 'event_risk')[] {
    const risks: ('stale' | 'thin_book' | 'trending_down' | 'overbought' | 'oversold' | 'event_risk')[] = [];
    if (asset.age_sec > staleness_sec) risks.push('stale');
    if (!asset.ob) risks.push('thin_book');
    if (asset.ma50_slope < -0.02) risks.push('trending_down');
    if (asset.rsi > 70) risks.push('overbought');
    if (asset.rsi < 30) risks.push('oversold');
    return risks;
  }

  private createFallbackReason(asset: ScreeningAsset, score: number): string {
    if (score > 0.7) return `Strong ${asset.ma50_slope > 0 ? 'up' : 'down'}trend, ADX ${asset.adx.toFixed(0)}, RSI ${asset.rsi.toFixed(0)}`;
    if (score > 0.5) return `Moderate signals, RSI ${asset.rsi.toFixed(0)}, trend ${asset.ma50_slope > 0 ? '+' : '-'}`;
    return `Mixed signals, awaiting clearer setup`;
  }

  private async callAI(systemPrompt: string, userPrompt: string, stage: string): Promise<any> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-trading-bot.local',
        'X-Title': 'AI Trading Bot V2 Funnel'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 450,
        stop: ['```', '\n\n', 'ranking']
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) throw new Error('Empty response from AI model');
    
    return validateStageResponse(content, 'S');
  }
}

// Stage P - Portfolio Selection Implementation
export class PortfolioSelector {
  async selectPortfolio(request: PortfolioRequest): Promise<PortfolioResult> {
    console.log(`💼 Stage P: Selecting 3 positions from ${request.universe.length} decisions`);
    
    // Filter valid decisions
    const validDecisions = request.universe.filter((decision: Decision) => 
      decision.position !== 'hold' && 
      decision.confidence >= 0.60 && 
      !decision.data_quality.stale
    );

    console.log(`💼 Stage P: ${validDecisions.length} valid decisions after filtering`);

    if (validDecisions.length < 3) {
      return this.createMinimalPortfolio(request, validDecisions);
    }

    const systemPrompt = `You are AI Portfolio Selector. Task: from a SET of validated Decision objects, pick EXACTLY 3 positions that maximize expected quality while minimizing correlation and downside risk. No new trades; only choose from provided decisions. Output must match Stage‑P contract.`;

    const userPrompt = `[INPUT]
portfolio_request = ${JSON.stringify(request)}

Return **only** Stage‑P JSON.`;

    try {
      const response = await withBackoff(async () => {
        return await this.callAI(systemPrompt, userPrompt, 'portfolio');
      }, `stage-p-portfolio`);

      const result = PortfolioResultSchema.parse(response);
      console.log(`✅ Stage P: Selected ${result.picks.length} positions`);
      return result;
      
    } catch (error) {
      console.error(`❌ Stage P failed: ${error}`);
      return this.createFallbackPortfolio(request, validDecisions);
    }
  }

  private createMinimalPortfolio(request: PortfolioRequest, decisions: Decision[]): PortfolioResult {
    const picks = decisions.slice(0, 3).map((decision, index) => ({
      asset: decision.asset,
      position: decision.position as 'long' | 'short',
      size_pct: Math.floor(request.risk_budget_pct / Math.max(3, decisions.length)),
      expected_rr: decision.realized_rr_est,
      confidence: decision.confidence,
      overlap_beta: 0.3 + (index * 0.1),
      notes: `Limited options: ${decision.rationale.substring(0, 80)}`
    }));

    const usedBudget = picks.reduce((sum, pick) => sum + pick.size_pct, 0);

    return {
      timeframe: request.timeframe,
      picks,
      reserves_pct: request.risk_budget_pct - usedBudget,
      diversification: {
        pairwise_max_corr: 0.3,
        sector_spread: picks.map(p => p.asset.includes('USDT') ? 'Crypto' : 'Equity')
      }
    };
  }

  private createFallbackPortfolio(request: PortfolioRequest, decisions: Decision[]): PortfolioResult {
    console.log(`🔄 Stage P: Using fallback portfolio logic`);
    
    // Score decisions by quality metric
    const scored = decisions.map(decision => ({
      decision,
      quality: decision.confidence * decision.realized_rr_est,
      atr_pct: this.extractATR(decision)
    })).sort((a, b) => b.quality - a.quality);

    // Select top 3 with risk parity sizing
    const selected = scored.slice(0, 3);
    const totalInverseATR = selected.reduce((sum, item) => sum + (1 / item.atr_pct), 0);
    
    const picks = selected.map(item => {
      const riskWeight = (1 / item.atr_pct) / totalInverseATR;
      const size_pct = Math.floor(riskWeight * request.risk_budget_pct);
      
      return {
        asset: item.decision.asset,
        position: item.decision.position as 'long' | 'short',
        size_pct,
        expected_rr: item.decision.realized_rr_est,
        confidence: item.decision.confidence,
        overlap_beta: Math.min(0.5, item.decision.feature_scores.correlation || 0.3),
        notes: `Risk parity: ${item.decision.rationale.substring(0, 80)}`
      };
    });

    const usedBudget = picks.reduce((sum, pick) => sum + pick.size_pct, 0);

    return {
      timeframe: request.timeframe,
      picks,
      reserves_pct: request.risk_budget_pct - usedBudget,
      diversification: {
        pairwise_max_corr: Math.max(...picks.map(p => p.overlap_beta)),
        sector_spread: picks.map(p => this.getSector(p.asset))
      }
    };
  }

  private extractATR(decision: Decision): number {
    // Extract ATR from the decision data - fallback to 2% if not available
    return decision.feature_scores.risk * 0.05 || 0.02;
  }

  private getSector(asset: string): string {
    if (asset.includes('BTC')) return 'BTC';
    if (asset.includes('ETH')) return 'ETH';
    if (asset.includes('USDT')) return 'Alt';
    return 'Equity';
  }

  private async callAI(systemPrompt: string, userPrompt: string, stage: string): Promise<any> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-trading-bot.local',
        'X-Title': 'AI Trading Bot V2 Funnel'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 450,
        stop: ['```', '\n\n', 'ranking']
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) throw new Error('Empty response from AI model');
    
    return validateStageResponse(content, 'P');
  }
}

// Main Funnel Orchestrator
export class MultiFunnelOrchestrator {
  private screener = new QuantScreener();
  private portfolioSelector = new PortfolioSelector();
  private dataService = new EnhancedMarketDataService();
  private cacheInitialized: boolean = false;

  private async initializeCache(): Promise<void> {
    if (this.cacheInitialized) return;
    
    try {
      const { marketDataCache } = await import('../data/market-cache');
      await marketDataCache.init();
      
      // Preload all symbols from environment
      console.log('🚀 Initializing bulk market data cache...');
      await marketDataCache.preloadAllSymbols();
      
      const stats = marketDataCache.getCacheStats();
      console.log(`📦 Cache ready: ${stats.totalSymbols} symbols, last fetch ${stats.cacheAge}, next bulk fetch ${stats.nextBulkFetch}`);
      
      this.cacheInitialized = true;
    } catch (error) {
      console.warn('⚠️ Cache initialization failed, proceeding without cache:', error);
      this.cacheInitialized = true; // Don't retry repeatedly
    }
  }

  async executeFullFunnel(
    symbols: string[], 
    timeframe: '6h' | '12h' | '1d' | '3d' | '1w' = '6h',
    topK: number = 8
  ): Promise<PortfolioResult> {
    // Initialize cache before processing
    await this.initializeCache();
    
    console.log(`🚀 Full Funnel: ${symbols.length} symbols → top ${topK} → 3 picks`);

    // Step 1: Gather data for all symbols
    const screeningAssets = await this.gatherScreeningData(symbols, timeframe);
    
    // Step 2: Stage S - Screen assets
    const screeningRequest: ScreeningRequest = {
      timeframe,
      top_k: topK,
      min_rr: 2.5, // Higher RR for longer timeframes
      data_staleness_sec: timeframe === '6h' ? 1800 : timeframe === '12h' ? 3600 : 7200, // 30min-2h staleness
      assets: screeningAssets
    };

    const screeningResult = await this.screener.screenAssets(screeningRequest);

    // Step 3: Stage D - Analyze top candidates with concurrency limit
    const candidates = screeningResult.top;
    const decisions: PromiseSettledResult<Decision>[] = [];
    const CONCURRENCY_LIMIT = 4;
    
    for (let i = 0; i < candidates.length; i += CONCURRENCY_LIMIT) {
      const batch = candidates.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.allSettled(
        batch.map(candidate => 
          this.analyzeCandidate(candidate.symbol, timeframe)
        )
      );
      decisions.push(...batchResults);
    }

    const validDecisions = decisions
      .filter((result): result is PromiseFulfilledResult<Decision> => result.status === 'fulfilled')
      .map(result => result.value);

    console.log(`🎯 Stage D: ${validDecisions.length}/${screeningResult.top.length} successful analyses`);

    // Step 4: Stage P - Portfolio selection
    const portfolioRequest: PortfolioRequest = {
      timeframe,
      risk_budget_pct: 60,
      max_corr: 0.5,
      universe: validDecisions
    };

    return await this.portfolioSelector.selectPortfolio(portfolioRequest);
  }

  private async gatherScreeningData(symbols: string[], timeframe: string): Promise<ScreeningAsset[]> {
    console.log(`📊 Gathering data for ${symbols.length} symbols`);
    
    // Apply concurrency limit to data gathering as well
    const results: PromiseSettledResult<ScreeningAsset>[] = [];
    const CONCURRENCY_LIMIT = 6; // Slightly higher for data gathering
    
    for (let i = 0; i < symbols.length; i += CONCURRENCY_LIMIT) {
      const batch = symbols.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.allSettled(
        batch.map(async symbol => {
          const data = await this.dataService.getEnhancedTechnicalData(symbol);
          
          return {
            symbol,
            price: data.price,
            atr_pct: data.atr,
            rsi: data.rsi,
            ma50_slope: data.ma50_slope,
            adx: data.adx,
            age_sec: data.age_sec,
            ob: data.orderbook,
            deriv: data.deriv ? {
              fund: (data.deriv as any).funding || 0,
              oi_d1: (data.deriv as any).oi_delta_24h || 0,
              basis_bps: (data.deriv as any).basis_bps || 0
            } : undefined,
            sent: data.sentiment,
            beta_btc: data.btc_beta
          };
        })
      );
      results.push(...batchResults);
    }

    const validResults: ScreeningAsset[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        validResults.push(result.value);
      }
    }
    return validResults;
  }

  private async analyzeCandidate(symbol: string, timeframe: '6h' | '12h' | '1d' | '3d' | '1w'): Promise<Decision> {
    // Use existing orchestrator-v2 analysis but with shortened timeframe
    const { analyzeAssetV2 } = await import('../core/main-orchestrator');
    return analyzeAssetV2(symbol, 'openai/gpt-5-mini');
  }
}