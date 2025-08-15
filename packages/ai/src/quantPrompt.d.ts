import { z } from 'zod';
import { aiOutputSchema } from './schema';
declare const analysisRequestSchema: z.ZodObject<{
    symbol: z.ZodString;
    timeframe: z.ZodString;
    min_rr: z.ZodNumber;
    leverage_cap: z.ZodNumber;
    data_staleness_sec: z.ZodNumber;
    features: z.ZodObject<{
        candles: z.ZodString;
        liquidity: z.ZodOptional<z.ZodAny>;
        onchain: z.ZodOptional<z.ZodAny>;
        sentiment: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        candles: string;
        onchain?: any;
        liquidity?: any;
        sentiment?: any;
    }, {
        candles: string;
        onchain?: any;
        liquidity?: any;
        sentiment?: any;
    }>;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    timeframe: string;
    min_rr: number;
    leverage_cap: number;
    data_staleness_sec: number;
    features: {
        candles: string;
        onchain?: any;
        liquidity?: any;
        sentiment?: any;
    };
}, {
    symbol: string;
    timeframe: string;
    min_rr: number;
    leverage_cap: number;
    data_staleness_sec: number;
    features: {
        candles: string;
        onchain?: any;
        liquidity?: any;
        sentiment?: any;
    };
}>;
type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
/**
 * Generates a JSON-only prompt for the AI Quant Strategist.
 * @param analysisRequest The analysis request object.
 * @param model The AI model to use (e.g., 'gpt-4o', 'claude-3-opus-20240229').
 * @returns The parsed JSON response from the AI.
 */
export declare function generateQuantPrompt(analysisRequest: AnalysisRequest, model: string): Promise<z.infer<typeof aiOutputSchema>>;
export {};
//# sourceMappingURL=quantPrompt.d.ts.map