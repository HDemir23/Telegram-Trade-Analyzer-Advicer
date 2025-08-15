/**
 * @file packages/ai/src/featureSummary.ts
 * @description Converts indicator snapshots into a compact numeric JSON format for AI prompts.
 */

/**
 * Represents a simplified indicator snapshot.
 * In a real scenario, this would likely be a more detailed type from the 'indicators' package.
 */
interface IndicatorSnapshot {
  [key: string]: number;
}

/**
 * Converts an indicator snapshot into a compact numeric JSON string.
 * Ensures deterministic ordering of keys and fixed decimal places for numeric values.
 *
 * @param snapshot The indicator snapshot to convert.
 * @returns A compact JSON string representing the feature summary.
 */
export function generateFeatureSummary(snapshot: IndicatorSnapshot): string {
  const summary: { [key: string]: number } = {};
  const keys = Object.keys(snapshot).sort(); // Ensure deterministic ordering

  for (const key of keys) {
    // Round to 2 decimal places for compactness and consistency.
    // This can be adjusted based on AI model requirements.
    summary[key] = parseFloat(snapshot[key].toFixed(2));
  }

  return JSON.stringify(summary);
}

// Minimal test stub
if (require.main === module) {
  const testSnapshot: IndicatorSnapshot = {
    rsi: 72.12345,
    macd: 1.56789,
    volume: 12345.67,
    atr: 2.34,
    ema20: 100.12,
    ema50: 98.76,
  };

  const featureSummary = generateFeatureSummary(testSnapshot);
  console.log('Generated Feature Summary:', featureSummary);
  // Expected output (order of keys might vary based on stringify, but values should be rounded):
  // {"atr":2.34,"ema20":100.12,"ema50":98.76,"macd":1.57,"rsi":72.12,"volume":12345.67}
}