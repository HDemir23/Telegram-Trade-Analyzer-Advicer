import { z } from "zod";

export const aiOutputSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  position: z.enum(["long", "short", "hold", "avoid"]),
  entry: z.object({
    type: z.enum(["limit", "market", "zone"]),
    price: z.number(),
    zone: z.tuple([z.number(), z.number()])
  }),
  stop_loss: z.number(),
  take_profits: z.array(
    z.object({
      price: z.number(),
      size_pct: z.number().min(0)
    })
  ),
  leverage: z.number().min(1),
  expected_rr: z.number().min(0),
  confidence: z.number().min(0).max(1),
  horizon: z.enum(["scalp_hrs", "swing_days", "position_weeks", "position_months"]),
  rationale: z.object({
    trend: z.string(),
    momentum: z.string(),
    onchain: z.string(),
    liquidity: z.string(),
    sentiment: z.string(),
    risks: z.array(z.string())
  }),
  key_levels: z.object({
    supports: z.array(z.number()),
    resistances: z.array(z.number())
  }),
  indicator_snapshot: z.object({
    rsi: z.number(),
    macd: z.object({
      diff: z.number(),
      signal: z.number(),
      hist: z.number()
    }),
    ema: z.object({
      e20: z.number(),
      e50: z.number(),
      e200: z.number()
    }),
    bb: z.object({
      mid: z.number(),
      upper: z.number(),
      lower: z.number()
    }),
    atr: z.number()
  }),
  invalid_if: z.array(z.string()),
  assumptions: z.array(z.string()),
  timestamp: z.string(),
  version: z.string()
});

export type AiOutput = z.infer<typeof aiOutputSchema>;

export const quantV2PlanSchema = aiOutputSchema;

export const multiAssetOutputSchema = z.object({
  ranking: z.array(z.object({
    symbol: z.string(),
    market: z.string(),
    score: z.number(),
    reason: z.string().optional()
  })),
  plans: z.record(aiOutputSchema)
});

export type MultiAssetOutput = z.infer<typeof multiAssetOutputSchema>;
