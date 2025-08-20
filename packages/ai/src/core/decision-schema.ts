import { z } from "zod";

export const DecisionSchema = z.object({
  asset: z.string().min(1),
  market: z.enum(["crypto", "equity", "fx", "commodity"]).default("crypto"),
  timeframe: z.enum(["15m", "30m", "1h", "4h", "6h", "12h", "1d", "3d", "1w"]),
  timestamp_ms: z.number().int().nonnegative(),

  position: z.enum(["long", "short", "hold"]),
  entry: z.object({
    type: z.enum(["zone", "limit", "market"]).default("zone"),
    lower: z.number().nonnegative().optional(),
    upper: z.number().nonnegative().optional(),
    price: z.number().nonnegative().optional(),
  }).refine(v => {
    if (v.type === "zone") {
      // Allow 0 values for hold positions
      return v.lower !== undefined && v.upper !== undefined && 
             (v.upper > v.lower || (v.upper === 0 && v.lower === 0));
    }
    return v.price !== undefined;
  }, {
    message: "entry must be a zone(lower<upper) or a single price",
  }),

  stop: z.number().nonnegative().optional(),
  targets: z.array(z.object({
    price: z.number().nonnegative(),
    size_pct: z.number().min(0).max(100)
  })).min(1).max(4),

  rr_min: z.number().positive(),
  realized_rr_est: z.number().nonnegative(),

  leverage: z.number().min(0).max(10).optional(),
  size_pct: z.number().min(0).max(100).optional(),

  data_quality: z.object({
    age_sec: z.number().nonnegative(),
    coverage: z.object({
      price: z.boolean(),
      orderbook: z.boolean().optional(),
      onchain: z.boolean().optional(),
      sentiment: z.boolean().optional(),
      derivatives: z.boolean().optional(),
      correlations: z.boolean().optional(),
    }),
    stale: z.boolean(),
  }),

  feature_scores: z.object({
    trend: z.number().min(0).max(1),
    momentum: z.number().min(0).max(1),
    rsi_signal: z.number().min(0).max(1),
    orderbook: z.number().min(0).max(1).optional(),
    onchain: z.number().min(0).max(1).optional(),
    sentiment: z.number().min(0).max(1).optional(),
    derivatives: z.number().min(0).max(1).optional(),
    correlation: z.number().min(0).max(1).optional(),
    risk: z.number().min(0).max(1),
  }),

  confidence: z.number().min(0).max(1),
  rationale: z.string().max(280),
});

export type Decision = z.infer<typeof DecisionSchema>;

// Hand-written JSON contract for the model (token-efficient)
export const JSON_CONTRACT = {
  "asset": "string",
  "market": "crypto|equity|fx|commodity", 
  "timeframe": "5m|15m|30m|1h|4h|1d",
  "timestamp_ms": 0,
  "position": "long|short|hold",
  "entry": {"type": "zone|limit|market", "lower": 0, "upper": 0, "price": 0},
  "stop": 0,
  "targets": [{"price": 0, "size_pct": 0}],
  "rr_min": 0,
  "realized_rr_est": 0,
  "leverage": 0,
  "size_pct": 0,
  "data_quality": {
    "age_sec": 0,
    "coverage": {"price": true, "orderbook": false, "onchain": false, "sentiment": false, "derivatives": false, "correlations": false},
    "stale": false
  },
  "feature_scores": {"trend": 0, "momentum": 0, "rsi_signal": 0, "orderbook": 0, "onchain": 0, "sentiment": 0, "derivatives": 0, "correlation": 0, "risk": 0},
  "confidence": 0,
  "rationale": "string<=280"
};

// Utility functions
export function getEntryMid(entry: any): number {
  if (entry?.type === 'zone' && entry.lower && entry.upper) {
    return (entry.lower + entry.upper) / 2;
  }
  return entry?.price || entry?.lower || entry?.upper || 0;
}

export function validateAndRepair(decision: Partial<Decision>, atr: number, currentPrice: number): Decision {
  const repaired = { ...decision } as Decision;
  
  // Ensure required fields
  if (!repaired.entry) repaired.entry = { type: "zone", lower: 0, upper: 0 };
  if (!repaired.targets || repaired.targets.length === 0) {
    repaired.targets = [{ price: 0, size_pct: 100 }];
  }
  
  console.log('Pre-repair targets:', repaired.targets.length);
  
  const entryMid = getEntryMid(repaired.entry);
  
  // Direction consistency checks
  if (repaired.position === 'long') {
    // For longs: stop < entry < targets
    if (repaired.stop && repaired.stop >= entryMid) {
      repaired.stop = entryMid * 0.95; // Fix stop below entry
    }
    const validTargets = repaired.targets.filter(t => t.price > entryMid);
    if (validTargets.length === 0 && entryMid > 0) {
      // Create valid targets if none exist
      repaired.targets = [
        { price: entryMid * 1.1, size_pct: 50 },
        { price: entryMid * 1.2, size_pct: 50 }
      ];
    } else if (validTargets.length > 0) {
      repaired.targets = validTargets;
    }
  } else if (repaired.position === 'short') {
    // For shorts: stop > entry > targets  
    if (repaired.stop && repaired.stop <= entryMid) {
      repaired.stop = entryMid * 1.05; // Fix stop above entry
    }
    const validTargets = repaired.targets.filter(t => t.price < entryMid);
    if (validTargets.length === 0 && entryMid > 0) {
      // Create valid targets if none exist
      repaired.targets = [
        { price: entryMid * 0.9, size_pct: 50 },
        { price: entryMid * 0.8, size_pct: 50 }
      ];
    } else if (validTargets.length > 0) {
      repaired.targets = validTargets;
    }
  }
  
  // RR enforcement
  if (repaired.position !== 'hold' && repaired.stop && entryMid > 0) {
    const stopDistance = Math.abs(entryMid - repaired.stop);
    const minTargetDistance = stopDistance * repaired.rr_min;
    
    const validTargets = repaired.targets.filter(t => {
      const targetDistance = Math.abs(t.price - entryMid);
      return targetDistance >= minTargetDistance;
    });
    
    if (validTargets.length === 0) {
      // No valid targets for min RR - switch to hold
      repaired.position = 'hold';
      repaired.rationale = 'Insufficient RR opportunity; waiting for better setup';
      repaired.confidence = Math.min(repaired.confidence, 0.3);
      repaired.targets = [{ price: 0, size_pct: 100 }]; // Ensure we have a target array
    } else {
      repaired.targets = validTargets;
    }
  }
  
  // ATR-based guardrails for minimum distances
  const atrPx = Math.max(1e-9, atr * currentPrice / 100); // atr is pct, convert to price
  const MIN_SL_DIST = 0.35 * atrPx;    // stop at least 0.35*ATR away
  const MIN_TP_DIST = 0.80 * atrPx;    // tp at least 0.8*ATR away

  // Ensure SL distance
  if (typeof repaired.stop === 'number' && repaired.stop > 0) {
    const slDist = Math.abs(repaired.stop - entryMid);
    if (slDist < MIN_SL_DIST) {
      repaired.stop = repaired.position === 'long'
        ? entryMid - MIN_SL_DIST
        : entryMid + MIN_SL_DIST;
      console.log(`🔧 Adjusted stop loss to meet minimum ATR distance: ${repaired.stop}`);
    }
  }

  // Ensure each target is far enough
  if (Array.isArray(repaired.targets)) {
    repaired.targets = repaired.targets
      .map(t => {
        const dist = Math.abs(t.price - entryMid);
        if (dist < MIN_TP_DIST) {
          const newPrice = repaired.position === 'long' ? entryMid + MIN_TP_DIST : entryMid - MIN_TP_DIST;
          console.log(`🔧 Adjusted target from ${t.price} to ${newPrice} for minimum ATR distance`);
          return {
            ...t,
            price: newPrice
          };
        }
        return t;
      })
      .filter(Boolean);
  }

  // Zone width clamping
  if (repaired.entry.type === 'zone' && repaired.entry.lower && repaired.entry.upper) {
    const zoneWidth = repaired.entry.upper - repaired.entry.lower;
    const atrBand = atr * currentPrice / 100;
    const minWidth = atrBand * 0.25;
    const maxWidth = atrBand * 1.5;
    
    if (zoneWidth < minWidth || zoneWidth > maxWidth) {
      const newWidth = Math.max(minWidth, Math.min(maxWidth, zoneWidth));
      const center = (repaired.entry.lower + repaired.entry.upper) / 2;
      repaired.entry.lower = center - newWidth / 2;
      repaired.entry.upper = center + newWidth / 2;
    }
  }

  // If we had to auto-repair heavily, clamp confidence
  if (repaired.rationale?.toLowerCase().includes('insufficient rr') || repaired.position === 'hold') {
    repaired.confidence = Math.min(repaired.confidence ?? 0.35, 0.35);
  }
  
  // Final safety check - ensure we always have targets
  if (!repaired.targets || repaired.targets.length === 0) {
    repaired.targets = [{ price: 0, size_pct: 100 }];
  }
  
  console.log('Post-repair targets:', repaired.targets.length);
  
  return repaired;
}