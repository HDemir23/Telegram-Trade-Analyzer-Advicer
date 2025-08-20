// Stage-S Screening with chunking and token diet - V3
// Fixes empty AI responses by batching and using lightweight payloads

export function batchAssets<T>(arr: T[], size: number = 25): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export interface ScreenerAsset {
  symbol: string;
  price: number;
  atr_pct: number;
  rsi: number;
  ma50_slope: number;
  adx: number;
  age_sec: number;
  beta_btc?: number;
  ob?: { imb10?: number };
  deriv?: { fund?: number; oi_d1?: number; basis_bps?: number };
  sent?: { pol?: number };
  synthetic?: boolean; // Flag synthetic data for penalties
}

export interface StageSInput {
  timeframe: "6h" | "4h" | "1h";
  top_k: number;
  min_rr: number;
  data_staleness_sec: number;
  assets: ScreenerAsset[];
}

export interface StageSResultItem {
  symbol: string;
  score: number;
  dir: "long" | "short" | "none";
  rr_potential: number;
  risks: ("stale" | "thin_book" | "trending_down" | "overbought" | "oversold" | "event_risk")[];
  reason: string; // ≤120 chars
}

export interface StageSResult {
  timeframe: string;
  top: StageSResultItem[];
}

// V3 Stage-S Contract (model-facing)
export const StageSContract = {
  timeframe: "string",
  top: [
    {
      symbol: "string",
      score: 0.0,
      dir: "long|short|none",
      rr_potential: 0.0,
      risks: ["stale", "thin_book", "trending_down", "overbought", "oversold", "event_risk"],
      reason: "string<=120"
    }
  ]
} as const;

// Create lightweight payload for Stage-S
export function createStageSPayload(assets: ScreenerAsset[], timeframe: string = "6h"): StageSInput {
  return {
    timeframe: timeframe as any,
    top_k: 15,
    min_rr: 2.0,
    data_staleness_sec: 3600,
    assets: assets.map(asset => ({
      symbol: asset.symbol,
      price: asset.price,
      atr_pct: asset.atr_pct,
      rsi: asset.rsi,
      ma50_slope: asset.ma50_slope,
      adx: asset.adx,
      age_sec: asset.age_sec,
      // Only include optional fields if they exist
      ...(asset.beta_btc !== undefined && { beta_btc: asset.beta_btc }),
      ...(asset.ob && { ob: asset.ob }),
      ...(asset.deriv && { deriv: asset.deriv }),
      ...(asset.sent && { sent: asset.sent }),
      ...(asset.synthetic && { synthetic: asset.synthetic })
    }))
  };
}

// V3 Stage-S System Prompt
export const STAGE_S_SYSTEM_PROMPT = `You are AI Quant Screener. Rank the provided assets and output Stage-S JSON. Use only features given. Penalize stale/synthetic. Keep reasons ≤ 120 chars.`;

// V3 Stage-S User Prompt
export function createStageSUserPrompt(input: StageSInput): string {
  return `[INPUT]
${JSON.stringify(input)}

Return only Stage-S JSON matching this contract:
${JSON.stringify(StageSContract)}`;
}

// Combine results from multiple batches
export function combineStageSResults(results: StageSResult[], topK: number = 15): StageSResult {
  const allItems = results.flatMap(r => r.top);
  
  // Sort by score descending and take top K
  const topItems = allItems
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  
  return {
    timeframe: results[0]?.timeframe || "6h",
    top: topItems
  };
}