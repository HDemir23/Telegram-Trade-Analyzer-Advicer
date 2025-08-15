import { ZodSchema, z } from 'zod';

// Define input types for the Trend strategy
export const TrendStrategyInputSchema = z.object({
  ohlcv: z.array(z.object({
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
  })),
  ema20: z.array(z.number()),
  ema50: z.array(z.number()),
  atr: z.array(z.number()),
  x: z.number(), // Multiplier for ATR in entry pullback
  k: z.number(), // Multiplier for ATR in Stop Loss
});

export type TrendStrategyInput = z.infer<typeof TrendStrategyInputSchema>;

// Define output types for the Trend strategy
export const TrendStrategyOutputSchema = z.object({
  entryPrice: z.number().optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.array(z.number()).optional(),
  bias: z.enum(['bullish', 'bearish', 'neutral']),
});

export type TrendStrategyOutput = z.infer<typeof TrendStrategyOutputSchema>;

/**
 * Implements the "Trend" trading strategy.
 * Bias EMA20>EMA50; entry on pullback to EMA20±x ATR; SL ATR*k; TPs swing highs or R.
 * @param input - The input data for the trend strategy.
 * @returns The output of the trend strategy, including entry, SL, TP, and bias.
 */
export function trendStrategy(input: TrendStrategyInput): TrendStrategyOutput {
  const { ohlcv, ema20, ema50, atr, x, k } = input;

  if (ohlcv.length === 0 || ema20.length === 0 || ema50.length === 0 || atr.length === 0) {
    return { bias: 'neutral' };
  }

  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];
  const lastAtr = atr[atr.length - 1];
  const lastClose = ohlcv[ohlcv.length - 1].close;

  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let entryPrice: number | undefined;
  let stopLoss: number | undefined;
  let takeProfit: number[] | undefined;

  if (lastEma20 > lastEma50) {
    bias = 'bullish';
    // Entry on pullback to EMA20 +/- x ATR
    const lowerBand = lastEma20 - (x * lastAtr);
    const upperBand = lastEma20 + (x * lastAtr);

    if (lastClose >= lowerBand && lastClose <= upperBand) {
      entryPrice = lastClose; // Entry at current close if within pullback range
      if (entryPrice !== undefined) {
        stopLoss = entryPrice - (k * lastAtr); // SL below entry
        // For simplicity, TPs are not fully implemented here as "swing highs or R" requires more complex logic.
        // This would typically involve analyzing historical price action for resistance levels or swing highs.
        takeProfit = [entryPrice + (2 * k * lastAtr)]; // Example TP
      }
    }
  } else if (lastEma20 < lastEma50) {
    bias = 'bearish';
    // Entry on pullback to EMA20 +/- x ATR
    const lowerBand = lastEma20 - (x * lastAtr);
    const upperBand = lastEma20 + (x * lastAtr);

    if (lastClose >= lowerBand && lastClose <= upperBand) {
      entryPrice = lastClose; // Entry at current close if within pullback range
      if (entryPrice !== undefined) {
        stopLoss = entryPrice + (k * lastAtr); // SL above entry
        // For simplicity, TPs are not fully implemented here as "swing highs or R" requires more complex logic.
        // This would typically involve analyzing historical price action for support levels or swing lows.
        takeProfit = [entryPrice - (2 * k * lastAtr)]; // Example TP
      }
    }
  }

  return {
    entryPrice,
    stopLoss,
    takeProfit,
    bias,
  };
}

// Minimal test stub
function runTest() {
  const testOhlcv = [
    { open: 100, high: 110, low: 90, close: 105, volume: 100 },
    { open: 105, high: 115, low: 95, close: 110, volume: 120 },
    { open: 110, high: 120, low: 100, close: 112, volume: 110 },
  ];
  const testEma20 = [102, 107, 110];
  const testEma50 = [100, 103, 106];
  const testAtr = [2, 2.5, 3];
  const testX = 0.5;
  const testK = 1.5;

  const input = {
    ohlcv: testOhlcv,
    ema20: testEma20,
    ema50: testEma50,
    atr: testAtr,
    x: testX,
    k: testK,
  };

  const result = trendStrategy(input);
  console.log('Trend Strategy Test Result:', result);

  // Basic assertions
  if (result.bias === 'bullish' && result.entryPrice !== undefined) {
    console.log('Test Passed: Bullish bias and entry price detected.');
  } else {
    console.log('Test Failed: Unexpected result.');
  }
}

// Uncomment to run the test:
// runTest();