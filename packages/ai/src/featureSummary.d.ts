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
export declare function generateFeatureSummary(snapshot: IndicatorSnapshot): string;
export {};
//# sourceMappingURL=featureSummary.d.ts.map