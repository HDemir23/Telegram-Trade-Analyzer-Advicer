import { z } from "zod";

// Stage S - Screening Schemas
export const ScreeningAssetSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  atr_pct: z.number(),
  rsi: z.number(),
  ma50_slope: z.number(),
  adx: z.number(),
  age_sec: z.number(),
  ob: z.object({
    imb10: z.number()
  }).optional(),
  deriv: z.object({
    fund: z.number(),
    oi_d1: z.number(),
    basis_bps: z.number()
  }).optional(),
  sent: z.object({
    pol: z.number()
  }).optional(),
  beta_btc: z.number().optional()
}).transform(data => ({
  ...data,
  ob: data.ob || undefined,
  deriv: data.deriv || undefined,
  sent: data.sent || undefined,
  beta_btc: data.beta_btc || undefined
}));

export const ScreeningRequestSchema = z.object({
  timeframe: z.enum(["15m", "30m", "1h", "4h", "6h", "12h", "1d", "3d", "1w"]),
  top_k: z.number().max(8),
  min_rr: z.number().default(2.0),
  data_staleness_sec: z.number(),
  assets: z.array(ScreeningAssetSchema)
});

export const ScreeningResultItemSchema = z.object({
  symbol: z.string(),
  score: z.number().min(0).max(1),
  dir: z.enum(["long", "short", "none"]),
  rr_potential: z.number(),
  risks: z.array(z.enum(["stale", "thin_book", "trending_down", "overbought", "oversold", "event_risk"])),
  reason: z.string().max(180)
});

export const ScreeningResultSchema = z.object({
  timeframe: z.enum(["15m", "30m", "1h", "4h", "6h", "12h", "1d", "3d", "1w"]),
  top: z.array(ScreeningResultItemSchema)
});

// Stage P - Portfolio Schemas
export const PortfolioPickSchema = z.object({
  asset: z.string(),
  position: z.enum(["long", "short"]),
  size_pct: z.number().min(0).max(100),
  expected_rr: z.number(),
  confidence: z.number().min(0).max(1),
  overlap_beta: z.number(),
  notes: z.string().max(120)
});

export const PortfolioRequestSchema = z.object({
  timeframe: z.enum(["15m", "30m", "1h", "4h", "6h", "12h", "1d", "3d", "1w"]),
  risk_budget_pct: z.number().default(60),
  max_corr: z.number().default(0.5),
  universe: z.array(z.any()) // Will contain Decision objects
});

export const PortfolioResultSchema = z.object({
  timeframe: z.enum(["15m", "30m", "1h", "4h", "6h", "12h", "1d", "3d", "1w"]),
  picks: z.array(PortfolioPickSchema),
  reserves_pct: z.number(),
  diversification: z.object({
    pairwise_max_corr: z.number(),
    sector_spread: z.array(z.string())
  })
});

// Type exports
export type ScreeningAsset = z.infer<typeof ScreeningAssetSchema>;
export type ScreeningRequest = z.infer<typeof ScreeningRequestSchema>;
export type ScreeningResult = z.infer<typeof ScreeningResultSchema>;
export type ScreeningResultItem = z.infer<typeof ScreeningResultItemSchema>;
export type PortfolioPick = z.infer<typeof PortfolioPickSchema>;
export type PortfolioRequest = z.infer<typeof PortfolioRequestSchema>;
export type PortfolioResult = z.infer<typeof PortfolioResultSchema>;

// Stage S JSON Contract (for AI prompts)
export const STAGE_S_CONTRACT = {
  "timeframe": "15m|30m|1h|4h",
  "top": [
    {
      "symbol": "string",
      "score": 0.0,
      "dir": "long|short|none",
      "rr_potential": 0.0,
      "risks": ["stale", "thin_book", "trending_down", "overbought", "oversold", "event_risk"],
      "reason": "string<=180"
    }
  ]
};

// Stage P JSON Contract (for AI prompts)
export const STAGE_P_CONTRACT = {
  "timeframe": "15m|30m|1h|4h",
  "picks": [
    {
      "asset": "string",
      "position": "long|short",
      "size_pct": 0,
      "expected_rr": 0,
      "confidence": 0,
      "overlap_beta": 0,
      "notes": "string<=120"
    }
  ],
  "reserves_pct": 0,
  "diversification": {
    "pairwise_max_corr": 0,
    "sector_spread": ["L1", "L1", "L1"]
  }
};