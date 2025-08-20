// Dynamic staleness detection based on timeframe
// Fixes the root cause where 6h candles were flagged STALE at 77 minutes

/**
 * Normalize timeframe string to lowercase and handle unknown values
 */
function normalizeTimeframe(tf: string): string {
  const normalized = tf.toLowerCase().trim();
  const validTfs = ["15m", "30m", "1h", "4h", "6h", "12h", "1d", "3d", "1w"];
  
  if (!validTfs.includes(normalized)) {
    console.warn(`Unknown timeframe '${tf}', falling back to '1h'`);
    return "1h";
  }
  
  return normalized;
}

/**
 * Check if timeframe is multi-hour (4h or longer)
 */
function isMultiHourTimeframe(tf: string): boolean {
  return ["4h", "6h", "12h", "1d", "3d", "1w"].includes(tf);
}

/**
 * Normalize age from potential milliseconds to seconds
 */
export function normalizeAgeSec(ageSec: number, tf: string): number {
  // If ageSec is > 1_000_000 (≈11.5 days) assume ms were passed
  if (ageSec > 1_000_000) {
    console.warn(`Age ${ageSec} seems to be in milliseconds, converting to seconds for timeframe ${tf}`);
    return ageSec / 1000;
  }
  
  // If ageSec <= 0, coerce to 0
  if (ageSec <= 0) {
    return 0;
  }
  
  return ageSec;
}

export function intervalSec(tf: "15m" | "30m" | "1h" | "4h" | "6h" | "12h" | "1d" | "3d" | "1w"): number {
  const normalizedTf = normalizeTimeframe(tf);
  const intervals = {
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "6h": 21600,
    "12h": 43200,
    "1d": 86400,
    "3d": 259200,
    "1w": 604800
  };
  return intervals[normalizedTf as keyof typeof intervals] ?? 3600;
}

export function allowedAgeSec(tf: string, floor: number = 300): number {
  const normalizedTf = normalizeTimeframe(tf);
  const intervalSeconds = intervalSec(normalizedTf as any);
  const tfIsMultiHour = isMultiHourTimeframe(normalizedTf);
  
  // Use more lenient multiplier for multi-hour TFs
  const multiplier = tfIsMultiHour ? 0.95 : 0.8;
  const extraSlack = tfIsMultiHour ? 300 : 0; // +5 minutes for multi-hour TFs
  
  return Math.max(floor, Math.floor(multiplier * intervalSeconds) + extraSlack);
}

export function isStale(ageSec: number, tf: string, floor: number = 300): boolean {
  const normalizedAge = normalizeAgeSec(ageSec, tf);
  return normalizedAge > allowedAgeSec(tf, floor);
}

// Helper to get human readable staleness info
export function stalenessInfo(ageSec: number, tf: string) {
  const normalizedAge = normalizeAgeSec(ageSec, tf);
  const allowed = allowedAgeSec(tf);
  const stale = isStale(ageSec, tf);
  return {
    ageSec: normalizedAge,
    allowedAgeSec: allowed,
    stale,
    status: stale ? 'STALE' : 'FRESH',
    ageMinutes: Math.round(normalizedAge / 60),
    allowedMinutes: Math.round(allowed / 60)
  };
}


