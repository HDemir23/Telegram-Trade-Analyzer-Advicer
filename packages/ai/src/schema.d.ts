import { z } from "zod";
export declare const aiOutputSchema: z.ZodObject<{
    symbol: z.ZodString;
    timeframe: z.ZodString;
    position: z.ZodEnum<["long", "short", "hold", "avoid"]>;
    entry: z.ZodObject<{
        type: z.ZodEnum<["limit", "market", "zone"]>;
        price: z.ZodNumber;
        zone: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    }, "strip", z.ZodTypeAny, {
        price: number;
        zone: [number, number];
        type: "limit" | "market" | "zone";
    }, {
        price: number;
        zone: [number, number];
        type: "limit" | "market" | "zone";
    }>;
    stop_loss: z.ZodNumber;
    take_profits: z.ZodArray<z.ZodObject<{
        price: z.ZodNumber;
        size_pct: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        price: number;
        size_pct: number;
    }, {
        price: number;
        size_pct: number;
    }>, "many">;
    leverage: z.ZodNumber;
    expected_rr: z.ZodNumber;
    confidence: z.ZodNumber;
    horizon: z.ZodEnum<["scalp_hrs", "swing_days", "position_weeks"]>;
    rationale: z.ZodObject<{
        trend: z.ZodString;
        momentum: z.ZodString;
        onchain: z.ZodString;
        liquidity: z.ZodString;
        sentiment: z.ZodString;
        risks: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        trend: string;
        momentum: string;
        onchain: string;
        liquidity: string;
        sentiment: string;
        risks: string[];
    }, {
        trend: string;
        momentum: string;
        onchain: string;
        liquidity: string;
        sentiment: string;
        risks: string[];
    }>;
    key_levels: z.ZodObject<{
        supports: z.ZodArray<z.ZodNumber, "many">;
        resistances: z.ZodArray<z.ZodNumber, "many">;
    }, "strip", z.ZodTypeAny, {
        supports: number[];
        resistances: number[];
    }, {
        supports: number[];
        resistances: number[];
    }>;
    indicator_snapshot: z.ZodObject<{
        rsi: z.ZodNumber;
        macd: z.ZodObject<{
            diff: z.ZodNumber;
            signal: z.ZodNumber;
            hist: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            diff: number;
            signal: number;
            hist: number;
        }, {
            diff: number;
            signal: number;
            hist: number;
        }>;
        ema: z.ZodObject<{
            e20: z.ZodNumber;
            e50: z.ZodNumber;
            e200: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            e20: number;
            e50: number;
            e200: number;
        }, {
            e20: number;
            e50: number;
            e200: number;
        }>;
        bb: z.ZodObject<{
            mid: z.ZodNumber;
            upper: z.ZodNumber;
            lower: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            mid: number;
            upper: number;
            lower: number;
        }, {
            mid: number;
            upper: number;
            lower: number;
        }>;
        atr: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        rsi: number;
        macd: {
            diff: number;
            signal: number;
            hist: number;
        };
        ema: {
            e20: number;
            e50: number;
            e200: number;
        };
        bb: {
            mid: number;
            upper: number;
            lower: number;
        };
        atr: number;
    }, {
        rsi: number;
        macd: {
            diff: number;
            signal: number;
            hist: number;
        };
        ema: {
            e20: number;
            e50: number;
            e200: number;
        };
        bb: {
            mid: number;
            upper: number;
            lower: number;
        };
        atr: number;
    }>;
    invalid_if: z.ZodArray<z.ZodString, "many">;
    assumptions: z.ZodArray<z.ZodString, "many">;
    timestamp: z.ZodString;
    version: z.ZodString;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    position: "hold" | "long" | "short" | "avoid";
    timeframe: string;
    entry: {
        price: number;
        zone: [number, number];
        type: "limit" | "market" | "zone";
    };
    stop_loss: number;
    take_profits: {
        price: number;
        size_pct: number;
    }[];
    leverage: number;
    expected_rr: number;
    confidence: number;
    horizon: "swing_days" | "scalp_hrs" | "position_weeks";
    rationale: {
        trend: string;
        momentum: string;
        onchain: string;
        liquidity: string;
        sentiment: string;
        risks: string[];
    };
    key_levels: {
        supports: number[];
        resistances: number[];
    };
    indicator_snapshot: {
        rsi: number;
        macd: {
            diff: number;
            signal: number;
            hist: number;
        };
        ema: {
            e20: number;
            e50: number;
            e200: number;
        };
        bb: {
            mid: number;
            upper: number;
            lower: number;
        };
        atr: number;
    };
    invalid_if: string[];
    assumptions: string[];
    timestamp: string;
    version: string;
}, {
    symbol: string;
    position: "hold" | "long" | "short" | "avoid";
    timeframe: string;
    entry: {
        price: number;
        zone: [number, number];
        type: "limit" | "market" | "zone";
    };
    stop_loss: number;
    take_profits: {
        price: number;
        size_pct: number;
    }[];
    leverage: number;
    expected_rr: number;
    confidence: number;
    horizon: "swing_days" | "scalp_hrs" | "position_weeks";
    rationale: {
        trend: string;
        momentum: string;
        onchain: string;
        liquidity: string;
        sentiment: string;
        risks: string[];
    };
    key_levels: {
        supports: number[];
        resistances: number[];
    };
    indicator_snapshot: {
        rsi: number;
        macd: {
            diff: number;
            signal: number;
            hist: number;
        };
        ema: {
            e20: number;
            e50: number;
            e200: number;
        };
        bb: {
            mid: number;
            upper: number;
            lower: number;
        };
        atr: number;
    };
    invalid_if: string[];
    assumptions: string[];
    timestamp: string;
    version: string;
}>;
export type AiOutput = z.infer<typeof aiOutputSchema>;
export declare const quantV2PlanSchema: z.ZodObject<{
    symbol: z.ZodString;
    timeframe: z.ZodString;
    position: z.ZodEnum<["long", "short", "hold", "avoid"]>;
    entry: z.ZodObject<{
        type: z.ZodEnum<["limit", "market", "zone"]>;
        price: z.ZodNumber;
        zone: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    }, "strip", z.ZodTypeAny, {
        price: number;
        zone: [number, number];
        type: "limit" | "market" | "zone";
    }, {
        price: number;
        zone: [number, number];
        type: "limit" | "market" | "zone";
    }>;
    stop_loss: z.ZodNumber;
    take_profits: z.ZodArray<z.ZodObject<{
        price: z.ZodNumber;
        size_pct: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        price: number;
        size_pct: number;
    }, {
        price: number;
        size_pct: number;
    }>, "many">;
    leverage: z.ZodNumber;
    expected_rr: z.ZodNumber;
    confidence: z.ZodNumber;
    horizon: z.ZodEnum<["scalp_hrs", "swing_days", "position_weeks"]>;
    rationale: z.ZodObject<{
        trend: z.ZodString;
        momentum: z.ZodString;
        onchain: z.ZodString;
        liquidity: z.ZodString;
        sentiment: z.ZodString;
        risks: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        trend: string;
        momentum: string;
        onchain: string;
        liquidity: string;
        sentiment: string;
        risks: string[];
    }, {
        trend: string;
        momentum: string;
        onchain: string;
        liquidity: string;
        sentiment: string;
        risks: string[];
    }>;
    key_levels: z.ZodObject<{
        supports: z.ZodArray<z.ZodNumber, "many">;
        resistances: z.ZodArray<z.ZodNumber, "many">;
    }, "strip", z.ZodTypeAny, {
        supports: number[];
        resistances: number[];
    }, {
        supports: number[];
        resistances: number[];
    }>;
    indicator_snapshot: z.ZodObject<{
        rsi: z.ZodNumber;
        macd: z.ZodObject<{
            diff: z.ZodNumber;
            signal: z.ZodNumber;
            hist: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            diff: number;
            signal: number;
            hist: number;
        }, {
            diff: number;
            signal: number;
            hist: number;
        }>;
        ema: z.ZodObject<{
            e20: z.ZodNumber;
            e50: z.ZodNumber;
            e200: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            e20: number;
            e50: number;
            e200: number;
        }, {
            e20: number;
            e50: number;
            e200: number;
        }>;
        bb: z.ZodObject<{
            mid: z.ZodNumber;
            upper: z.ZodNumber;
            lower: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            mid: number;
            upper: number;
            lower: number;
        }, {
            mid: number;
            upper: number;
            lower: number;
        }>;
        atr: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        rsi: number;
        macd: {
            diff: number;
            signal: number;
            hist: number;
        };
        ema: {
            e20: number;
            e50: number;
            e200: number;
        };
        bb: {
            mid: number;
            upper: number;
            lower: number;
        };
        atr: number;
    }, {
        rsi: number;
        macd: {
            diff: number;
            signal: number;
            hist: number;
        };
        ema: {
            e20: number;
            e50: number;
            e200: number;
        };
        bb: {
            mid: number;
            upper: number;
            lower: number;
        };
        atr: number;
    }>;
    invalid_if: z.ZodArray<z.ZodString, "many">;
    assumptions: z.ZodArray<z.ZodString, "many">;
    timestamp: z.ZodString;
    version: z.ZodString;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    position: "hold" | "long" | "short" | "avoid";
    timeframe: string;
    entry: {
        price: number;
        zone: [number, number];
        type: "limit" | "market" | "zone";
    };
    stop_loss: number;
    take_profits: {
        price: number;
        size_pct: number;
    }[];
    leverage: number;
    expected_rr: number;
    confidence: number;
    horizon: "swing_days" | "scalp_hrs" | "position_weeks";
    rationale: {
        trend: string;
        momentum: string;
        onchain: string;
        liquidity: string;
        sentiment: string;
        risks: string[];
    };
    key_levels: {
        supports: number[];
        resistances: number[];
    };
    indicator_snapshot: {
        rsi: number;
        macd: {
            diff: number;
            signal: number;
            hist: number;
        };
        ema: {
            e20: number;
            e50: number;
            e200: number;
        };
        bb: {
            mid: number;
            upper: number;
            lower: number;
        };
        atr: number;
    };
    invalid_if: string[];
    assumptions: string[];
    timestamp: string;
    version: string;
}, {
    symbol: string;
    position: "hold" | "long" | "short" | "avoid";
    timeframe: string;
    entry: {
        price: number;
        zone: [number, number];
        type: "limit" | "market" | "zone";
    };
    stop_loss: number;
    take_profits: {
        price: number;
        size_pct: number;
    }[];
    leverage: number;
    expected_rr: number;
    confidence: number;
    horizon: "swing_days" | "scalp_hrs" | "position_weeks";
    rationale: {
        trend: string;
        momentum: string;
        onchain: string;
        liquidity: string;
        sentiment: string;
        risks: string[];
    };
    key_levels: {
        supports: number[];
        resistances: number[];
    };
    indicator_snapshot: {
        rsi: number;
        macd: {
            diff: number;
            signal: number;
            hist: number;
        };
        ema: {
            e20: number;
            e50: number;
            e200: number;
        };
        bb: {
            mid: number;
            upper: number;
            lower: number;
        };
        atr: number;
    };
    invalid_if: string[];
    assumptions: string[];
    timestamp: string;
    version: string;
}>;
export declare const multiAssetOutputSchema: z.ZodObject<{
    ranking: z.ZodArray<z.ZodObject<{
        symbol: z.ZodString;
        market: z.ZodString;
        score: z.ZodNumber;
        reason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        symbol: string;
        market: string;
        score: number;
        reason?: string | undefined;
    }, {
        symbol: string;
        market: string;
        score: number;
        reason?: string | undefined;
    }>, "many">;
    plans: z.ZodRecord<z.ZodString, z.ZodObject<{
        symbol: z.ZodString;
        timeframe: z.ZodString;
        position: z.ZodEnum<["long", "short", "hold", "avoid"]>;
        entry: z.ZodObject<{
            type: z.ZodEnum<["limit", "market", "zone"]>;
            price: z.ZodNumber;
            zone: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        }, "strip", z.ZodTypeAny, {
            price: number;
            zone: [number, number];
            type: "limit" | "market" | "zone";
        }, {
            price: number;
            zone: [number, number];
            type: "limit" | "market" | "zone";
        }>;
        stop_loss: z.ZodNumber;
        take_profits: z.ZodArray<z.ZodObject<{
            price: z.ZodNumber;
            size_pct: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            price: number;
            size_pct: number;
        }, {
            price: number;
            size_pct: number;
        }>, "many">;
        leverage: z.ZodNumber;
        expected_rr: z.ZodNumber;
        confidence: z.ZodNumber;
        horizon: z.ZodEnum<["scalp_hrs", "swing_days", "position_weeks"]>;
        rationale: z.ZodObject<{
            trend: z.ZodString;
            momentum: z.ZodString;
            onchain: z.ZodString;
            liquidity: z.ZodString;
            sentiment: z.ZodString;
            risks: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            trend: string;
            momentum: string;
            onchain: string;
            liquidity: string;
            sentiment: string;
            risks: string[];
        }, {
            trend: string;
            momentum: string;
            onchain: string;
            liquidity: string;
            sentiment: string;
            risks: string[];
        }>;
        key_levels: z.ZodObject<{
            supports: z.ZodArray<z.ZodNumber, "many">;
            resistances: z.ZodArray<z.ZodNumber, "many">;
        }, "strip", z.ZodTypeAny, {
            supports: number[];
            resistances: number[];
        }, {
            supports: number[];
            resistances: number[];
        }>;
        indicator_snapshot: z.ZodObject<{
            rsi: z.ZodNumber;
            macd: z.ZodObject<{
                diff: z.ZodNumber;
                signal: z.ZodNumber;
                hist: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                diff: number;
                signal: number;
                hist: number;
            }, {
                diff: number;
                signal: number;
                hist: number;
            }>;
            ema: z.ZodObject<{
                e20: z.ZodNumber;
                e50: z.ZodNumber;
                e200: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                e20: number;
                e50: number;
                e200: number;
            }, {
                e20: number;
                e50: number;
                e200: number;
            }>;
            bb: z.ZodObject<{
                mid: z.ZodNumber;
                upper: z.ZodNumber;
                lower: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                mid: number;
                upper: number;
                lower: number;
            }, {
                mid: number;
                upper: number;
                lower: number;
            }>;
            atr: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            rsi: number;
            macd: {
                diff: number;
                signal: number;
                hist: number;
            };
            ema: {
                e20: number;
                e50: number;
                e200: number;
            };
            bb: {
                mid: number;
                upper: number;
                lower: number;
            };
            atr: number;
        }, {
            rsi: number;
            macd: {
                diff: number;
                signal: number;
                hist: number;
            };
            ema: {
                e20: number;
                e50: number;
                e200: number;
            };
            bb: {
                mid: number;
                upper: number;
                lower: number;
            };
            atr: number;
        }>;
        invalid_if: z.ZodArray<z.ZodString, "many">;
        assumptions: z.ZodArray<z.ZodString, "many">;
        timestamp: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        symbol: string;
        position: "hold" | "long" | "short" | "avoid";
        timeframe: string;
        entry: {
            price: number;
            zone: [number, number];
            type: "limit" | "market" | "zone";
        };
        stop_loss: number;
        take_profits: {
            price: number;
            size_pct: number;
        }[];
        leverage: number;
        expected_rr: number;
        confidence: number;
        horizon: "swing_days" | "scalp_hrs" | "position_weeks";
        rationale: {
            trend: string;
            momentum: string;
            onchain: string;
            liquidity: string;
            sentiment: string;
            risks: string[];
        };
        key_levels: {
            supports: number[];
            resistances: number[];
        };
        indicator_snapshot: {
            rsi: number;
            macd: {
                diff: number;
                signal: number;
                hist: number;
            };
            ema: {
                e20: number;
                e50: number;
                e200: number;
            };
            bb: {
                mid: number;
                upper: number;
                lower: number;
            };
            atr: number;
        };
        invalid_if: string[];
        assumptions: string[];
        timestamp: string;
        version: string;
    }, {
        symbol: string;
        position: "hold" | "long" | "short" | "avoid";
        timeframe: string;
        entry: {
            price: number;
            zone: [number, number];
            type: "limit" | "market" | "zone";
        };
        stop_loss: number;
        take_profits: {
            price: number;
            size_pct: number;
        }[];
        leverage: number;
        expected_rr: number;
        confidence: number;
        horizon: "swing_days" | "scalp_hrs" | "position_weeks";
        rationale: {
            trend: string;
            momentum: string;
            onchain: string;
            liquidity: string;
            sentiment: string;
            risks: string[];
        };
        key_levels: {
            supports: number[];
            resistances: number[];
        };
        indicator_snapshot: {
            rsi: number;
            macd: {
                diff: number;
                signal: number;
                hist: number;
            };
            ema: {
                e20: number;
                e50: number;
                e200: number;
            };
            bb: {
                mid: number;
                upper: number;
                lower: number;
            };
            atr: number;
        };
        invalid_if: string[];
        assumptions: string[];
        timestamp: string;
        version: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    ranking: {
        symbol: string;
        market: string;
        score: number;
        reason?: string | undefined;
    }[];
    plans: Record<string, {
        symbol: string;
        position: "hold" | "long" | "short" | "avoid";
        timeframe: string;
        entry: {
            price: number;
            zone: [number, number];
            type: "limit" | "market" | "zone";
        };
        stop_loss: number;
        take_profits: {
            price: number;
            size_pct: number;
        }[];
        leverage: number;
        expected_rr: number;
        confidence: number;
        horizon: "swing_days" | "scalp_hrs" | "position_weeks";
        rationale: {
            trend: string;
            momentum: string;
            onchain: string;
            liquidity: string;
            sentiment: string;
            risks: string[];
        };
        key_levels: {
            supports: number[];
            resistances: number[];
        };
        indicator_snapshot: {
            rsi: number;
            macd: {
                diff: number;
                signal: number;
                hist: number;
            };
            ema: {
                e20: number;
                e50: number;
                e200: number;
            };
            bb: {
                mid: number;
                upper: number;
                lower: number;
            };
            atr: number;
        };
        invalid_if: string[];
        assumptions: string[];
        timestamp: string;
        version: string;
    }>;
}, {
    ranking: {
        symbol: string;
        market: string;
        score: number;
        reason?: string | undefined;
    }[];
    plans: Record<string, {
        symbol: string;
        position: "hold" | "long" | "short" | "avoid";
        timeframe: string;
        entry: {
            price: number;
            zone: [number, number];
            type: "limit" | "market" | "zone";
        };
        stop_loss: number;
        take_profits: {
            price: number;
            size_pct: number;
        }[];
        leverage: number;
        expected_rr: number;
        confidence: number;
        horizon: "swing_days" | "scalp_hrs" | "position_weeks";
        rationale: {
            trend: string;
            momentum: string;
            onchain: string;
            liquidity: string;
            sentiment: string;
            risks: string[];
        };
        key_levels: {
            supports: number[];
            resistances: number[];
        };
        indicator_snapshot: {
            rsi: number;
            macd: {
                diff: number;
                signal: number;
                hist: number;
            };
            ema: {
                e20: number;
                e50: number;
                e200: number;
            };
            bb: {
                mid: number;
                upper: number;
                lower: number;
            };
            atr: number;
        };
        invalid_if: string[];
        assumptions: string[];
        timestamp: string;
        version: string;
    }>;
}>;
export type MultiAssetOutput = z.infer<typeof multiAssetOutputSchema>;
//# sourceMappingURL=schema.d.ts.map