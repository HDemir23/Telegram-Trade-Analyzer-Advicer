"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiAssetOutputSchema = exports.quantV2PlanSchema = exports.aiOutputSchema = void 0;
const zod_1 = require("zod");
exports.aiOutputSchema = zod_1.z.object({
    symbol: zod_1.z.string(),
    timeframe: zod_1.z.string(),
    position: zod_1.z.enum(["long", "short", "hold", "avoid"]),
    entry: zod_1.z.object({
        type: zod_1.z.enum(["limit", "market", "zone"]),
        price: zod_1.z.number(),
        zone: zod_1.z.tuple([zod_1.z.number(), zod_1.z.number()])
    }),
    stop_loss: zod_1.z.number(),
    take_profits: zod_1.z.array(zod_1.z.object({
        price: zod_1.z.number(),
        size_pct: zod_1.z.number().min(0)
    })),
    leverage: zod_1.z.number().min(1),
    expected_rr: zod_1.z.number().min(0),
    confidence: zod_1.z.number().min(0).max(1),
    horizon: zod_1.z.enum(["scalp_hrs", "swing_days", "position_weeks"]),
    rationale: zod_1.z.object({
        trend: zod_1.z.string(),
        momentum: zod_1.z.string(),
        onchain: zod_1.z.string(),
        liquidity: zod_1.z.string(),
        sentiment: zod_1.z.string(),
        risks: zod_1.z.array(zod_1.z.string())
    }),
    key_levels: zod_1.z.object({
        supports: zod_1.z.array(zod_1.z.number()),
        resistances: zod_1.z.array(zod_1.z.number())
    }),
    indicator_snapshot: zod_1.z.object({
        rsi: zod_1.z.number(),
        macd: zod_1.z.object({
            diff: zod_1.z.number(),
            signal: zod_1.z.number(),
            hist: zod_1.z.number()
        }),
        ema: zod_1.z.object({
            e20: zod_1.z.number(),
            e50: zod_1.z.number(),
            e200: zod_1.z.number()
        }),
        bb: zod_1.z.object({
            mid: zod_1.z.number(),
            upper: zod_1.z.number(),
            lower: zod_1.z.number()
        }),
        atr: zod_1.z.number()
    }),
    invalid_if: zod_1.z.array(zod_1.z.string()),
    assumptions: zod_1.z.array(zod_1.z.string()),
    timestamp: zod_1.z.string(),
    version: zod_1.z.string()
});
exports.quantV2PlanSchema = exports.aiOutputSchema;
exports.multiAssetOutputSchema = zod_1.z.object({
    ranking: zod_1.z.array(zod_1.z.object({
        symbol: zod_1.z.string(),
        market: zod_1.z.string(),
        score: zod_1.z.number(),
        reason: zod_1.z.string().optional()
    })),
    plans: zod_1.z.record(exports.aiOutputSchema)
});
//# sourceMappingURL=schema.js.map