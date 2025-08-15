import { OHLCV } from "@trade/types"; // Assuming a types package exists or will be created

/**
 * Calculates the ATR-based stop loss.
 * @param candles OHLCV candles.
 * @param atrMultiplier Multiplier for ATR.
 * @param isLong True if long position, false if short.
 * @returns ATR stop loss price.
 */
export function atrStop(candles: OHLCV[], atrMultiplier: number, isLong: boolean): number {
  // Placeholder for ATR calculation logic
  // This would typically involve calculating ATR from the candles
  // For now, a simplified placeholder
  const lastClose = candles[candles.length - 1].close;
  const atr = 10; // Placeholder ATR value, replace with actual ATR calculation

  if (isLong) {
    return lastClose - atr * atrMultiplier;
  } else {
    return lastClose + atr * atrMultiplier;
  }
}

/**
 * Calculates position size based on risk.
 * @param accountBalance Total account balance.
 * @param riskPerTradePct Percentage of account balance to risk per trade (e.g., 1 for 1%).
 * @param entryPrice Entry price of the trade.
 * @param stopLossPrice Stop loss price of the trade.
 * @returns Calculated position size in units.
 */
export function sizeByRisk(
  accountBalance: number,
  riskPerTradePct: number,
  entryPrice: number,
  stopLossPrice: number
): number {
  const riskAmount = accountBalance * (riskPerTradePct / 100);
  const priceDifference = Math.abs(entryPrice - stopLossPrice);

  if (priceDifference === 0) {
    return 0; // Avoid division by zero
  }

  return riskAmount / priceDifference;
}

/**
 * Calculates Risk/Reward Ratio.
 * @param entryPrice Entry price of the trade.
 * @param stopLossPrice Stop loss price of the trade.
 * @param takeProfitPrice Take profit price of the trade.
 * @returns Risk/Reward ratio.
 */
export function rr(entryPrice: number, stopLossPrice: number, takeProfitPrice: number): number {
  const risk = Math.abs(entryPrice - stopLossPrice);
  const reward = Math.abs(takeProfitPrice - entryPrice);

  if (risk === 0) {
    return 0; // Avoid division by zero
  }

  return reward / risk;
}