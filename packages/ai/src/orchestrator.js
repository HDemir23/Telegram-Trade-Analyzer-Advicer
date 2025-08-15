"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAnalysisRequest = buildAnalysisRequest;
exports.askMultiAssetPlan = askMultiAssetPlan;
const schema_1 = require("./schema");
async function buildAnalysisRequest(opts, dataDigest) {
    // TODO: Import actual data providers
    const mockData = {
        marketData: null,
        technical: null,
        orderbook: null,
        onchain: null,
        sentiment: null,
        fundamentals: null,
        derivatives: null,
    };
    // TODO: Import actual universe configuration
    const mockUniverse = {
        crypto: opts.markets.includes('crypto') ? ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] : undefined,
        spx: opts.markets.includes('spx') ? ['AAPL', 'MSFT', 'GOOGL'] : undefined,
        bist: opts.markets.includes('bist') ? ['THYAO', 'AKBNK', 'GARAN'] : undefined,
    };
    return {
        analysis_request: {
            ...opts,
            notes_from_data_md: dataDigest?.slice(0, 600),
        },
        universe: mockUniverse,
        data: mockData,
        constraints: {
            max_symbols: 5,
            token_budget: 2000,
        },
    };
}
async function askMultiAssetPlan(input) {
    const systemPrompt = `You are AI Quant Strategist. Return **only JSON**. No prose. No code blocks. Do not place orders. Use risk-first logic. If data is stale/insufficient → prefer \`hold\` and lower \`confidence\`.`;
    const userPrompt = `analysis_request = ${JSON.stringify(input.analysis_request)}

universe = ${JSON.stringify(input.universe)}

data = ${JSON.stringify(input.data)}

constraints = ${JSON.stringify(input.constraints)}

Return JSON with keys: \`ranking\`, \`plans\`. Each \`plans[SYMBOL]\` must match **quant.v2**.`;
    try {
        // TODO: Replace with actual AI service call
        const mockResponse = {
            ranking: [
                { symbol: 'SOLUSDT', market: 'crypto', score: 0.78, reason: 'Strong momentum, oversold bounce' },
                { symbol: 'BTCUSDT', market: 'crypto', score: 0.65, reason: 'Consolidation above support' }
            ],
            plans: {
                SOLUSDT: {
                    symbol: 'SOLUSDT',
                    timeframe: '4h',
                    position: 'long',
                    entry: { type: 'zone', price: 195.5, zone: [194.0, 197.0] },
                    stop_loss: 188.0,
                    take_profits: [{ price: 210.0, size_pct: 0.5 }, { price: 225.0, size_pct: 0.5 }],
                    leverage: 2,
                    expected_rr: 2.1,
                    confidence: 0.78,
                    horizon: 'swing_days',
                    rationale: {
                        trend: 'Uptrend intact above 190',
                        momentum: 'RSI recovering from oversold',
                        onchain: 'Whale accumulation detected',
                        liquidity: 'Good depth at support levels',
                        sentiment: 'Neutral to positive',
                        risks: ['BTC correlation risk', 'General market volatility']
                    },
                    key_levels: {
                        supports: [190.0, 185.0],
                        resistances: [210.0, 225.0, 240.0]
                    },
                    indicator_snapshot: {
                        rsi: 42.5,
                        macd: { diff: 0.8, signal: 1.2, hist: -0.4 },
                        ema: { e20: 198.5, e50: 195.2, e200: 180.1 },
                        bb: { mid: 197.0, upper: 205.0, lower: 189.0 },
                        atr: 8.5
                    },
                    invalid_if: ['Close below 185', 'BTC breaks 40k'],
                    assumptions: ['Market remains above key support', 'No major news events'],
                    timestamp: new Date().toISOString(),
                    version: 'v2.0'
                }
            }
        };
        const validatedResponse = schema_1.multiAssetOutputSchema.parse(mockResponse);
        return validatedResponse;
    }
    catch (error) {
        // Single retry attempt
        console.warn('First attempt failed, retrying...', error);
        // Simplified mock for retry
        const fallbackResponse = {
            ranking: [{ symbol: 'BTCUSDT', market: 'crypto', score: 0.5, reason: 'Hold position' }],
            plans: {}
        };
        return schema_1.multiAssetOutputSchema.parse(fallbackResponse);
    }
}
//# sourceMappingURL=orchestrator.js.map