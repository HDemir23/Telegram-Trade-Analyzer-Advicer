import {
  RSI,
  MACD,
  EMA,
  ATR,
  BollingerBands,
  OBV,
} from "technicalindicators";

export interface OHLCV {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

/**
 * Calculates the Relative Strength Index (RSI).
 * @param closePrices Array of closing prices.
 * @param period The period for RSI calculation (default: 14).
 * @returns Array of RSI values.
 */
export function calculateRSI(closePrices: number[], period: number = 14): number[] {
  return RSI.calculate({ values: closePrices, period: period });
}

/**
 * Calculates the Moving Average Convergence Divergence (MACD) histogram.
 * @param closePrices Array of closing prices.
 * @param fastPeriod The fast period for MACD calculation (default: 12).
 * @param slowPeriod The slow period for MACD calculation (default: 26).
 * @param signalPeriod The signal period for MACD calculation (default: 9).
 * @returns Array of MACD histogram values.
 */
export function calculateMACDHistogram(
  closePrices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): number[] {
  const macdResult = MACD.calculate({
    values: closePrices,
    fastPeriod: fastPeriod,
    slowPeriod: slowPeriod,
    signalPeriod: signalPeriod,
    SimpleMAOscillator: false, // Use EMA for oscillator
    SimpleMASignal: false,     // Use EMA for signal
  });
  return macdResult.map((m: any) => m.histogram).filter((h: any): h is number => h !== undefined);
}

/**
 * Calculates the Exponential Moving Average (EMA).
 * @param values Array of values.
 * @param period The period for EMA calculation.
 * @returns Array of EMA values.
 */
export function calculateEMA(values: number[], period: number): number[] {
  return EMA.calculate({ values: values, period: period });
}

/**
 * Calculates the Average True Range (ATR).
 * @param ohlcv OHLCV data.
 * @param period The period for ATR calculation (default: 14).
 * @returns Array of ATR values.
 */
export function calculateATR(ohlcv: OHLCV, period: number = 14): number[] {
  return ATR.calculate({
    high: ohlcv.high,
    low: ohlcv.low,
    close: ohlcv.close,
    period: period,
  });
}

/**
 * Calculates the Bollinger Bands width.
 * @param closePrices Array of closing prices.
 * @param period The period for Bollinger Bands calculation (default: 20).
 * @param stdDev The standard deviation multiplier (default: 2).
 * @returns Array of Bollinger Bands width values.
 */
export function calculateBollingerBandWidth(
  closePrices: number[],
  period: number = 20,
  stdDev: number = 2
): number[] {
  const bbResult = BollingerBands.calculate({
    values: closePrices,
    period: period,
    stdDev: stdDev,
  });
  return bbResult.map((b: any) => b.upper - b.lower);
}

/**
 * Calculates Donchian Channel (20-period).
 * @param ohlcv OHLCV data.
 * @param period The period for Donchian Channel calculation (default: 20).
 * @returns Array of Donchian Channel values (upper, middle, lower).
 */
export function calculateDonchianChannel(
  ohlcv: OHLCV,
  period: number = 20
): { upper: number; middle: number; lower: number }[] {
  const donchian: { upper: number; middle: number; lower: number }[] = [];
  for (let i = period - 1; i < ohlcv.high.length; i++) {
    const highSlice = ohlcv.high.slice(i - period + 1, i + 1);
    const lowSlice = ohlcv.low.slice(i - period + 1, i + 1);
    const upper = Math.max(...highSlice);
    const lower = Math.min(...lowSlice);
    const middle = (upper + lower) / 2;
    donchian.push({ upper, middle, lower });
  }
  return donchian;
}

/**
 * Calculates On-Balance Volume (OBV).
 * @param ohlcv OHLCV data.
 * @returns Array of OBV values.
 */
export function calculateOBV(ohlcv: OHLCV): number[] {
  return OBV.calculate({
    close: ohlcv.close,
    volume: ohlcv.volume,
  });
}