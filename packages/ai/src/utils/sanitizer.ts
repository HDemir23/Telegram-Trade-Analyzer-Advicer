// Contract firewall - strip junk & retry once
import { DecisionSchema } from '../core/decision-schema';

export function sanitizeDecision(raw: any): any {
  try {
    // Parse and drop unknown keys using Zod
    const parsed = DecisionSchema.parse(raw);
    
    // Reject non-finite numbers
    const allNumsOk = (vals: number[]) => vals.every(v => Number.isFinite(v) && !Number.isNaN(v));
    
    const numbersToCheck = [
      parsed.timestamp_ms,
      parsed.stop ?? 0,
      parsed.confidence ?? 0,
      parsed.rr_min,
      parsed.realized_rr_est,
      ...(parsed.targets?.map(t => t.price) ?? []),
      ...(parsed.targets?.map(t => t.size_pct) ?? [])
    ];
    
    if (!allNumsOk(numbersToCheck)) {
      throw new Error('Non-finite numeric field detected');
    }
    
    // Check entry field numbers
    if (parsed.entry.type === 'zone' && parsed.entry.lower && parsed.entry.upper) {
      if (!allNumsOk([parsed.entry.lower, parsed.entry.upper])) {
        throw new Error('Non-finite entry zone values');
      }
    }
    if (parsed.entry.price && !Number.isFinite(parsed.entry.price)) {
      throw new Error('Non-finite entry price');
    }
    
    return parsed;
  } catch (error) {
    throw new Error(`Sanitization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function cleanJsonFromText(text: string): string {
  // Remove common AI prefixes and suffixes
  return text
    .trim()
    // Remove AI commentary before JSON
    .replace(/^.*?(?=\{)/s, '')
    // Remove everything after the last closing brace
    .replace(/\}[^}]*$/s, '}')
    // Remove markdown formatting
    .replace(/```json\n?/g, '')
    .replace(/\n?```/g, '')
    // Remove common explanatory phrases
    .replace(/^(Here's|Here is|Based on|Looking at).*?:/gmi, '')
    .trim();
}