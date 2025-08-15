interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BreakoutInputs {
  ohlcv: Candle[];
  volZ: number;
  atr: number;
  k: number; // Multiplier for ATR to calculate Stop Loss
  rMultiples: number[]; // Array of R-multiples for Take Profit levels
  channelHigh: number; // High of the channel for breakout
  channelLow: number; // Low of the channel for breakout
}

export interface BreakoutOutputs {
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfits: number[] | null;
}

export function breakoutStrategy(inputs: BreakoutInputs): BreakoutOutputs {
  const { ohlcv, volZ, atr, k, rMultiples, channelHigh, channelLow } = inputs;

  let entryPrice: number | null = null;
  let stopLoss: number | null = null;
  let takeProfits: number[] | null = null;

  // Check for channel break and volume confirmation
  if (ohlcv.length > 0) {
    const lastCandle = ohlcv[ohlcv.length - 1];

    // Entry on channel break (assuming upward breakout for simplicity)
    if (lastCandle.close > channelHigh && volZ > 2) {
      entryPrice = lastCandle.close;
      const risk = atr * k;
      stopLoss = entryPrice - risk;

      takeProfits = rMultiples.map(r => (entryPrice as number) + (r * risk));
    }
    // Add logic for downward breakout if needed
    // else if (lastCandle.close < channelLow && volZ > 2) { ... }
  }

  return {
    entryPrice,
    stopLoss,
    takeProfits,
  };
}