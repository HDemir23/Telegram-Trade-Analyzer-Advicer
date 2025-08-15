import { OHLCV } from "@trade/types"; // Assuming a types package exists for OHLCV

interface BacktestOptions {
  slippage: number; // e.g., 0.001 for 0.1% slippage
  fees: number;     // e.g., 0.0005 for 0.05% fees per trade
}

interface Trade {
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  timestamp: number;
  feeAmount: number;
  slippageAmount: number;
}

export interface BacktestResult {
  trades: Trade[];
  finalBalance: number;
  // Add more metrics as needed, e.g., profit/loss, drawdown, etc.
}

/**
 * Simulates a trading strategy on historical OHLCV data.
 * Implements next-bar execution, basic slippage, and fees.
 * Assumes no lookahead bias by only using past data for decisions.
 *
 * @param ohlcvData Array of OHLCV data points.
 * @param strategy A function that decides whether to buy, sell, or hold based on historical data.
 *                 It receives the current index and the full OHLCV data, and returns a trade signal.
 * @param initialBalance Starting capital for the backtest.
 * @param options Configuration for slippage and fees.
 * @returns BacktestResult containing simulated trades and final balance.
 */
export function runBacktest(
  ohlcvData: OHLCV[],
  strategy: (index: number, data: OHLCV[]) => 'buy' | 'sell' | 'hold',
  initialBalance: number,
  options: BacktestOptions
): BacktestResult {
  let currentBalance = initialBalance;
  const trades: Trade[] = [];

  for (let i = 0; i < ohlcvData.length; i++) {
    // Next-bar execution: strategy decides based on data up to i-1, trade executes at ohlcvData[i].open
    // For simplicity, we'll assume strategy makes decision at the close of previous bar (i-1)
    // and execution happens at the open of the current bar (i).
    if (i === 0) continue; // Cannot make a decision on the first bar as there's no prior data.

    const signal = strategy(i - 1, ohlcvData); // Strategy uses data up to the previous bar's close

    const currentBar = ohlcvData[i];
    const executionPrice = currentBar.open; // Execute at the open of the current bar

    if (signal === 'buy') {
      // Simulate buy
      const quantity = currentBalance / executionPrice;
      const slippageAmount = quantity * executionPrice * options.slippage;
      const feeAmount = quantity * executionPrice * options.fees;
      const totalCost = (quantity * executionPrice) + slippageAmount + feeAmount;

      if (currentBalance >= totalCost) {
        currentBalance -= totalCost;
        trades.push({
          type: 'buy',
          price: executionPrice,
          quantity: quantity,
          timestamp: currentBar.timestamp,
          feeAmount: feeAmount,
          slippageAmount: slippageAmount,
        });
      }
    } else if (signal === 'sell') {
      // Simulate sell (simplified: assumes we hold enough to sell)
      // In a real scenario, you'd track positions.
      const quantity = trades.reduce((sum, trade) => trade.type === 'buy' ? sum + trade.quantity : sum - trade.quantity, 0);
      if (quantity > 0) {
        const slippageAmount = quantity * executionPrice * options.slippage;
        const feeAmount = quantity * executionPrice * options.fees;
        const totalProceeds = (quantity * executionPrice) - slippageAmount - feeAmount;

        currentBalance += totalProceeds;
        trades.push({
          type: 'sell',
          price: executionPrice,
          quantity: quantity,
          timestamp: currentBar.timestamp,
          feeAmount: feeAmount,
          slippageAmount: slippageAmount,
        });
      }
    }
    // 'hold' does nothing
  }

  return {
    trades,
    finalBalance: currentBalance,
  };
}