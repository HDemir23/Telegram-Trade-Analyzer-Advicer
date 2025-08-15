// Define a basic interface for a trade, assuming it has at least profit and duration for time-based metrics
interface Trade {
  profit: number; // Profit or loss of the trade
  entryTime: Date; // Entry timestamp
  exitTime: Date; // Exit timestamp
}

/**
 * Calculates the total number of trades.
 * @param trades An array of trade objects.
 * @returns The total number of trades.
 */
export function calculateTradesCount(trades: Trade[]): number {
  return trades.length;
}

/**
 * Calculates the Win Rate.
 * @param trades An array of trade objects.
 * @returns The win rate as a percentage.
 */
export function calculateWinRate(trades: Trade[]): number {
  if (trades.length === 0) {
    return 0;
  }
  const winningTrades = trades.filter(trade => trade.profit > 0).length;
  return (winningTrades / trades.length) * 100;
}

/**
 * Calculates the Profit Factor.
 * @param trades An array of trade objects.
 * @returns The profit factor.
 */
export function calculateProfitFactor(trades: Trade[]): number {
  const grossProfit = trades.filter(trade => trade.profit > 0).reduce((sum, trade) => sum + trade.profit, 0);
  const grossLoss = trades.filter(trade => trade.profit < 0).reduce((sum, trade) => sum + Math.abs(trade.profit), 0);
  return grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
}

/**
 * Calculates the Maximum Drawdown (MDD).
 * @param profits An array of cumulative profits.
 * @returns The maximum drawdown.
 */
export function calculateMaxDrawdown(profits: number[]): number {
  if (profits.length === 0) {
    return 0;
  }
  let peak = profits[0];
  let maxDrawdown = 0;
  for (let i = 1; i < profits.length; i++) {
    if (profits[i] > peak) {
      peak = profits[i];
    } else {
      const drawdown = peak - profits[i];
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }
  return maxDrawdown;
}

/**
 * Calculates the Compound Annual Growth Rate (CAGR).
 * @param initialCapital The starting capital.
 * @param finalCapital The ending capital.
 * @param years The number of years the backtest ran.
 * @returns The CAGR as a percentage.
 */
export function calculateCAGR(initialCapital: number, finalCapital: number, years: number): number {
  if (initialCapital <= 0 || years <= 0) {
    return 0;
  }
  return ((Math.pow((finalCapital / initialCapital), (1 / years)) - 1) * 100);
}

/**
 * Calculates the Sharpe Ratio.
 * @param returns An array of periodic returns.
 * @param riskFreeRate The risk-free rate.
 * @returns The Sharpe Ratio.
 */
export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0): number {
  if (returns.length === 0) {
    return 0;
  }
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length);
  return stdDev === 0 ? 0 : (meanReturn - riskFreeRate) / stdDev;
}

/**
 * Calculates the Sortino Ratio.
 * @param returns An array of periodic returns.
 * @param riskFreeRate The risk-free rate.
 * @returns The Sortino Ratio.
 */
export function calculateSortinoRatio(returns: number[], riskFreeRate: number = 0): number {
  if (returns.length === 0) {
    return 0;
  }
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const downsideReturns = returns.filter(r => r < riskFreeRate);
  if (downsideReturns.length === 0) {
    return Infinity; // No downside deviation
  }
  const downsideDeviation = Math.sqrt(downsideReturns.reduce((sum, r) => sum + Math.pow(r - riskFreeRate, 2), 0) / downsideReturns.length);
  return downsideDeviation === 0 ? Infinity : (meanReturn - riskFreeRate) / downsideDeviation;
}