// Stage-S High-Fidelity: Ranking Many Assets for Maximum Edge
// Purpose: Screen 75 assets → top 15 candidates with rich analysis

import { PERFECTION_MODE_CONFIG, HF_SCORING_RUBRIC } from '../models/perfection-config';
import { batchAssets } from '../stages/stage-s';

export interface StageSInput {
  timeframe: string;
  top_k: number;
  min_rr: number;
  data_staleness_sec: number;
  regime: {
    btc: 'up' | 'down' | 'flat';
    spx: 'up' | 'down' | 'flat';
  };
  batch_id: string;
  assets: AssetFeatures[];
}

export interface AssetFeatures {
  symbol: string;
  market: 'crypto' | 'spx' | 'bist';
  class?: string;
  price: number;
  atr_pct: number;
  rsi: number;
  ma50_slope: number;
  adx: number;
  age_sec: number;
  volume_usd_24h?: number;
  ob?: {
    imb10: number;
  };
  deriv?: {
    fund: number;
    oi_d1: number;
    basis_bps: number;
  };
  sent?: {
    news: number;
    social: number;
  };
  corr?: {
    beta_btc: number;
    beta_spx: number;
  };
  liquidity?: {
    adv_usd: number;
    spread_bps: number;
  };
  flags?: {
    synthetic: boolean;
    event_risk: boolean;
  };
}

export interface StageSOutput {
  timeframe: string;
  batch_id: string;
  evaluated: number;
  top: Array<{
    symbol: string;
    market: 'crypto' | 'spx' | 'bist';
    dir: 'long' | 'short' | 'none';
    score: number;
    rr_potential: number;
    confidence: number;
    risks: string[];
    drivers: string[];
    reason: string; // <=120 chars
  }>;
}

// High-Fidelity Stage-S System Prompt
export const STAGE_S_HF_SYSTEM_PROMPT = `You are AI Quant Screener. Rank MANY assets and output Stage-S JSON exactly. Use features only. Penalize stale, synthetic, illiquid, or conflicting inputs. Prefer swing opportunities (intra-week to intra-month). If direction is ambiguous, use dir:"none". Keep reason ≤120 chars. No extra keys.`;

// Enhanced Stage-S user prompt template
export function createStageSHFPrompt(input: StageSInput): string {
  return `[INPUT]
screener_request = ${JSON.stringify(input, null, 2)}
Return **only** Stage-S JSON.`;
}

// Retry prompt for Stage-S
export const STAGE_S_HF_RETRY_PROMPT = `Reminder: Return only Stage-S JSON. Unknown keys are rejected. No raw candles.`;

// High-fidelity asset scoring function
export function calculateAssetScore(asset: AssetFeatures, regime: any): {
  score: number;
  confidence: number;
  risks: string[];
  drivers: string[];
  direction: 'long' | 'short' | 'none';
  reason: string;
} {
  const rubric = HF_SCORING_RUBRIC;
  let score = 0;
  let penalties = 0;
  const risks: string[] = [];
  const drivers: string[] = [];

  // 1. Trend component (35%)
  const trendScore = Math.max(0, Math.min(1, (asset.ma50_slope + 1) / 2));
  score += rubric.trend * trendScore;
  if (trendScore > 0.6) drivers.push('trend');

  // 2. Momentum component (20%) 
  const momentumScore = asset.adx > 25 ? Math.min(1, asset.adx / 50) : 0;
  score += rubric.momentum * momentumScore;
  if (momentumScore > 0.5) drivers.push('momentum');

  // 3. Volatility fit (15%)
  const volScore = asset.atr_pct > 0.01 && asset.atr_pct < 0.08 ? 1 : 0.3;
  score += rubric.vol_fit * volScore;
  if (volScore > 0.7) drivers.push('vol_fit');

  // 4. Orderbook (10%)
  let obScore = 0.5; // Default
  if (asset.ob?.imb10) {
    obScore = Math.abs(asset.ob.imb10) > 0.03 ? 0.8 : 0.4;
    if (obScore > 0.6) drivers.push('orderbook');
  }
  score += rubric.orderbook * obScore;

  // 5. Derivatives (10%)
  let derivScore = 0.5; // Default
  if (asset.deriv) {
    const fundingHealthy = Math.abs(asset.deriv.fund) < 0.01;
    const oiGrowing = asset.deriv.oi_d1 > 0;
    derivScore = (fundingHealthy ? 0.5 : 0.2) + (oiGrowing ? 0.3 : 0.1);
    if (derivScore > 0.6) drivers.push('derivatives');
  }
  score += rubric.derivatives * derivScore;

  // 6. Sentiment (5%)
  let sentScore = 0.5; // Default neutral
  if (asset.sent) {
    sentScore = Math.max(0, Math.min(1, (asset.sent.news + asset.sent.social + 2) / 4));
    if (Math.abs(sentScore - 0.5) > 0.2) drivers.push('sentiment');
  }
  score += rubric.sentiment * sentScore;

  // 7. Correlation (5%)
  let corrScore = 0.5; // Default
  if (asset.corr) {
    // Prefer assets with reasonable but not excessive correlation
    const btcCorr = Math.abs(asset.corr.beta_btc);
    const spxCorr = Math.abs(asset.corr.beta_spx);
    corrScore = btcCorr > 0.3 && btcCorr < 0.9 ? 0.7 : 0.4;
    if (corrScore > 0.6) drivers.push('correlation');
  }
  score += rubric.correlation * corrScore;

  // Apply penalties
  if (asset.age_sec > 21600) { // >6h stale
    penalties += rubric.penalties.stale;
    risks.push('stale');
  }

  if (asset.flags?.synthetic) {
    penalties += rubric.penalties.synthetic;
    risks.push('synthetic');
  }

  if (asset.liquidity && asset.liquidity.adv_usd < 10000000) { // <$10M ADV
    penalties += rubric.penalties.illiquid;
    risks.push('illiquid');
  }

  if (asset.liquidity && asset.liquidity.spread_bps > 20) {
    risks.push('thin_book');
  }

  if (asset.flags?.event_risk) {
    penalties += rubric.penalties.event_risk;
    risks.push('event_risk');
  }

  // RSI extremes
  if (asset.rsi > 75) {
    risks.push('overbought');
    penalties += 0.1;
  } else if (asset.rsi < 25) {
    risks.push('oversold');
    penalties += 0.1;
  }

  // Trending down check
  if (asset.ma50_slope < -0.02) {
    risks.push('trending_down');
    penalties += 0.15;
  }

  // Final score with penalties
  const finalScore = Math.max(0, score + penalties);

  // Direction determination
  let direction: 'long' | 'short' | 'none' = 'none';
  if (trendScore > 0.6 && momentumScore > 0.5) {
    direction = asset.ma50_slope > 0 ? 'long' : 'short';
  } else if (asset.rsi < 30 && trendScore > 0.4) {
    direction = 'long';
  } else if (asset.rsi > 70 && trendScore < 0.4) {
    direction = 'short';
  }

  // Confidence calculation
  const coverage = (asset.ob ? 1 : 0.8) * (asset.deriv ? 1 : 0.9) * (asset.sent ? 1 : 0.95);
  const recency = asset.age_sec < 3600 ? 1 : asset.age_sec < 21600 ? 0.8 : 0.5;
  const agreement = drivers.length / 7; // Agreement factor
  let confidence = coverage * recency * agreement;
  
  // Cap confidence if penalties present
  if (risks.length > 0) {
    confidence = Math.min(confidence, 0.7);
  }

  // Generate reason (≤120 chars)
  const topDrivers = drivers.slice(0, 2).join('+');
  const topRisks = risks.slice(0, 2).join('+');
  const reason = topDrivers 
    ? `${topDrivers} support ${direction} (${(finalScore * 100).toFixed(0)}%)${topRisks ? ` | Risk: ${topRisks}` : ''}`
    : `Mixed signals, no clear direction (${(finalScore * 100).toFixed(0)}%)`;

  return {
    score: finalScore,
    confidence,
    risks,
    drivers,
    direction,
    reason: reason.substring(0, 120)
  };
}

// Enhanced Stage-S orchestration with high-fidelity processing
export async function executeStageSHF(
  assets: AssetFeatures[],
  regime: { btc: 'up' | 'down' | 'flat'; spx: 'up' | 'down' | 'flat' },
  topK: number = 15
): Promise<StageSOutput[]> {
  console.log(`🔍 Stage S HF: Processing ${assets.length} assets in high-fidelity mode`);
  
  // Batch assets into groups of 25
  const batches = batchAssets(assets, 25);
  const results: StageSOutput[] = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchId = `batch-${i + 1}-${Date.now()}`;
    
    console.log(`📊 Processing batch ${i + 1}/${batches.length}: ${batch.length} assets`);
    
    const input: StageSInput = {
      timeframe: '6h',
      top_k: Math.min(topK, batch.length),
      min_rr: 2.0,
      data_staleness_sec: 21600, // 6h
      regime,
      batch_id: batchId,
      assets: batch
    };

    try {
      // For now, use local scoring (can be replaced with AI call later)
      const scored = batch.map(asset => {
        const result = calculateAssetScore(asset, regime);
        return {
          symbol: asset.symbol,
          market: asset.market,
          dir: result.direction,
          score: result.score,
          rr_potential: result.score * 3, // Estimate
          confidence: result.confidence,
          risks: result.risks,
          drivers: result.drivers,
          reason: result.reason
        };
      });

      // Sort by quality metric and take top K
      const top = scored
        .sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence))
        .slice(0, input.top_k);

      results.push({
        timeframe: input.timeframe,
        batch_id: batchId,
        evaluated: batch.length,
        top
      });

    } catch (error) {
      console.error(`❌ Stage S HF batch ${i + 1} failed:`, error);
      // Add empty result to maintain batch count
      results.push({
        timeframe: input.timeframe,
        batch_id: batchId,
        evaluated: batch.length,
        top: []
      });
    }
  }

  return results;
}

// Merge Stage-S results and select top candidates
export function mergeStageSResults(results: StageSOutput[], maxCandidates: number = 15): any[] {
  const allCandidates = results.flatMap(result => result.top);
  
  // Sort by quality metric Q = score × confidence
  const sorted = allCandidates
    .map(candidate => ({
      ...candidate,
      quality: candidate.score * candidate.confidence
    }))
    .sort((a, b) => b.quality - a.quality);

  console.log(`🎯 Stage S HF: Selected top ${Math.min(maxCandidates, sorted.length)} candidates from ${allCandidates.length} total`);
  
  return sorted.slice(0, maxCandidates);
}