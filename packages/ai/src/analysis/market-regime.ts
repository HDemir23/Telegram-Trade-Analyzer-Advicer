// Regime filters to prevent ETH-type mistakes
export interface RegimeAnalysis {
  trend_regime: 'up' | 'down' | 'flat';
  trend_strength: number; // ADX
  trend_quality: number;  // R-squared
  ma_slope: number;
  volatility_regime: 'low' | 'medium' | 'high';
  atr_zscore: number;
  allow_rsi_longs: boolean;
  allow_rsi_shorts: boolean;
}

export interface PriceData {
  prices: number[];
  ma50: number;
  atr: number;
  rsi: number;
  adx: number;
}

export function analyzeRegime(data: PriceData, currentPrice: number): RegimeAnalysis {
  const { prices, ma50, atr, rsi, adx } = data;
  
  // Calculate MA50 slope (trend direction)
  const ma_slope = calculateMASlope(prices, 50);
  
  // Calculate R-squared for trend quality
  const trend_quality = calculateTrendQuality(prices.slice(-20)); // Last 20 periods
  
  // Determine trend regime
  let trend_regime: 'up' | 'down' | 'flat' = 'flat';
  if (ma_slope > 0.001 && trend_quality > 0.3) {
    trend_regime = 'up';
  } else if (ma_slope < -0.001 && trend_quality > 0.3) {
    trend_regime = 'down';
  }
  
  // Calculate volatility regime
  const atr_pct = (atr / currentPrice) * 100;
  const atr_zscore = calculateATRZScore(prices, atr_pct);
  
  let volatility_regime: 'low' | 'medium' | 'high' = 'medium';
  if (atr_zscore < -0.5) volatility_regime = 'low';
  else if (atr_zscore > 1.5) volatility_regime = 'high';
  
  // RSI signal filtering based on regime
  const allow_rsi_longs = shouldAllowRSILongs(rsi, trend_regime, adx);
  const allow_rsi_shorts = shouldAllowRSIShorts(rsi, trend_regime, adx);
  
  return {
    trend_regime,
    trend_strength: adx,
    trend_quality,
    ma_slope,
    volatility_regime,
    atr_zscore,
    allow_rsi_longs,
    allow_rsi_shorts
  };
}

function calculateMASlope(prices: number[], periods: number): number {
  if (prices.length < periods * 2) return 0;
  
  const recentPrices = prices.slice(-periods);
  const priorPrices = prices.slice(-periods * 2, -periods);
  
  if (recentPrices.length === 0 || priorPrices.length === 0) return 0;
  
  const recentMA = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const priorMA = priorPrices.reduce((a, b) => a + b, 0) / priorPrices.length;
  
  if (priorMA === 0) return 0;
  return (recentMA - priorMA) / priorMA;
}

function calculateTrendQuality(prices: number[]): number {
  if (prices.length < 10) return 0;
  
  // Calculate R-squared of linear fit
  const n = prices.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = prices;
  
  const sumX = x.reduce((a, b) => a + b);
  const sumY = y.reduce((a, b) => a + b);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate R-squared
  const yMean = sumY / n;
  const ssRes = y.reduce((sum, yi, i) => {
    const predicted = slope * x[i] + intercept;
    return sum + Math.pow(yi - predicted, 2);
  }, 0);
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  
  const rSquared = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  return rSquared;
}

function calculateATRZScore(prices: number[], currentATRPct: number): number {
  if (prices.length < 20) return 0;
  
  // Calculate historical ATR percentages
  const atrValues = [];
  for (let i = 14; i < prices.length - 1; i++) {
    const high = Math.max(...prices.slice(i - 13, i + 1));
    const low = Math.min(...prices.slice(i - 13, i + 1));
    const atr = (high - low) / prices[i] * 100;
    atrValues.push(atr);
  }
  
  if (atrValues.length === 0) return 0;
  
  const mean = atrValues.reduce((a, b) => a + b) / atrValues.length;
  const variance = atrValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / atrValues.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev === 0 ? 0 : (currentATRPct - mean) / stdDev;
}

function shouldAllowRSILongs(rsi: number, trendRegime: 'up' | 'down' | 'flat', adx: number): boolean {
  // ETH mistake prevention: Don't allow RSI oversold longs in strong downtrends
  if (rsi < 30 && trendRegime === 'down' && adx > 25) {
    return false; // Block oversold longs in strong downtrends
  }
  
  // Only allow RSI oversold longs in up/flat trends or weak downtrends
  return trendRegime !== 'down' || adx < 25;
}

function shouldAllowRSIShorts(rsi: number, trendRegime: 'up' | 'down' | 'flat', adx: number): boolean {
  // Don't allow RSI overbought shorts in strong uptrends
  if (rsi > 70 && trendRegime === 'up' && adx > 35) {
    return false; // Block overbought shorts in strong uptrends
  }
  
  return trendRegime !== 'up' || adx < 35;
}

// Deterministic confidence calculation
export function calculateConfidence(
  coverage: Record<string, boolean>,
  age_sec: number,
  data_staleness_sec: number,
  feature_scores: Record<string, number>
): number {
  // Coverage score (25% weight)
  const available_features = Object.values(coverage).filter(Boolean).length;
  const total_features = Object.keys(coverage).length;
  const coverage_score = available_features / total_features;
  
  // Recency score (35% weight)
  const recency_score = Math.max(0, 1 - age_sec / data_staleness_sec);
  
  // Agreement score (40% weight) - how aligned are the feature scores
  const scores = Object.values(feature_scores).filter(s => s !== undefined);
  if (scores.length === 0) return 0;
  
  const mean = scores.reduce((a, b) => a + b) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const agreement_score = Math.max(0, 1 - Math.sqrt(variance)); // Higher agreement = lower variance
  
  // Weighted confidence
  const confidence = 0.25 * coverage_score + 0.35 * recency_score + 0.40 * agreement_score;
  
  return Math.max(0, Math.min(1, confidence));
}