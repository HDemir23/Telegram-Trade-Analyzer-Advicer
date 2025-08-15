// Define a basic OHLCV interface locally for now to resolve import error
export interface OhlcV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// Input types for Mean Reversion Strategy
export interface MeanReversionInputs {
  ohlcv: OhlcV[];
  rsi: number; // Current RSI value
  bbUpper: number; // Bollinger Band Upper
  bbMiddle: number; // Bollinger Band Middle (SMA)
  bbLower: number; // Bollinger Band Lower
  trendFilter: 'strong_up' | 'weak_up' | 'neutral' | 'weak_down' | 'strong_down'; // Trend filter status
}

// Output types for Mean Reversion Strategy
export interface MeanReversionOutputs {
  entryPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  signal: 'buy' | 'sell' | 'none';
}

export function meanReversionStrategy(inputs: MeanReversionInputs): MeanReversionOutputs {
  const { ohlcv, rsi, bbUpper, bbMiddle, bbLower, trendFilter } = inputs;
  const currentPrice = ohlcv[ohlcv.length - 1]?.close;

  if (!currentPrice) {
    return { entryPrice: null, stopLossPrice: null, takeProfitPrice: null, signal: 'none' };
  }

  let entryPrice: number | null = null;
  let stopLossPrice: number | null = null;
  let takeProfitPrice: number | null = null;
  let signal: 'buy' | 'sell' | 'none' = 'none';

  // Entry at RSI bands
  // Buy signal: RSI oversold and not a strong downtrend
  if (rsi < 30 && trendFilter !== 'strong_down') {
    signal = 'buy';
    entryPrice = currentPrice;
    stopLossPrice = currentPrice * 0.98; // 2% stop loss
    takeProfitPrice = bbMiddle; // Target BB Middle
  }
  // Sell signal: RSI overbought and not a strong uptrend
  else if (rsi > 70 && trendFilter !== 'strong_up') {
    signal = 'sell';
    entryPrice = currentPrice;
    stopLossPrice = currentPrice * 1.02; // 2% stop loss
    takeProfitPrice = bbMiddle; // Target BB Middle
  }

  return {
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    signal,
  };
}

// Minimal test stub (colocated)
function runTest() {
  const testOhlcv: OhlcV[] = [
    { open: 100, high: 105, low: 98, close: 102, volume: 100, timestamp: Date.now() - 5000 },
    { open: 102, high: 108, low: 100, close: 105, volume: 120, timestamp: Date.now() },
  ];

  // Test case 1: Buy signal (RSI oversold, neutral trend)
  const inputs1: MeanReversionInputs = {
    ohlcv: testOhlcv,
    rsi: 25,
    bbUpper: 110,
    bbMiddle: 105,
    bbLower: 100,
    trendFilter: 'neutral',
  };
  const output1 = meanReversionStrategy(inputs1);
  console.log('Test Case 1 (Buy):', output1);
  console.assert(output1.signal === 'buy', 'Test Case 1 Failed: Should be a buy signal');

  // Test case 2: Sell signal (RSI overbought, neutral trend)
  const inputs2: MeanReversionInputs = {
    ohlcv: testOhlcv,
    rsi: 75,
    bbUpper: 110,
    bbMiddle: 105,
    bbLower: 100,
    trendFilter: 'neutral',
  };
  const output2 = meanReversionStrategy(inputs2);
  console.log('Test Case 2 (Sell):', output2);
  console.assert(output2.signal === 'sell', 'Test Case 2 Failed: Should be a sell signal');

  // Test case 3: No signal (RSI in middle, strong up trend)
  const inputs3: MeanReversionInputs = {
    ohlcv: testOhlcv,
    rsi: 50,
    bbUpper: 110,
    bbMiddle: 105,
    bbLower: 100,
    trendFilter: 'strong_up',
  };
  const output3 = meanReversionStrategy(inputs3);
  console.log('Test Case 3 (None):', output3);
  console.assert(output3.signal === 'none', 'Test Case 3 Failed: Should be no signal');

  // Test case 4: No sell signal due to strong_up trend
  const inputs4: MeanReversionInputs = {
    ohlcv: testOhlcv,
    rsi: 75,
    bbUpper: 110,
    bbMiddle: 105,
    bbLower: 100,
    trendFilter: 'strong_up',
  };
  const output4 = meanReversionStrategy(inputs4);
  console.log('Test Case 4 (No Sell due to strong_up):', output4);
  console.assert(output4.signal === 'none', 'Test Case 4 Failed: Should be no sell signal due to strong_up trend');

  // Test case 5: No buy signal due to strong_down trend
  const inputs5: MeanReversionInputs = {
    ohlcv: testOhlcv,
    rsi: 25,
    bbUpper: 110,
    bbMiddle: 105,
    bbLower: 100,
    trendFilter: 'strong_down',
  };
  const output5 = meanReversionStrategy(inputs5);
  console.log('Test Case 5 (No Buy due to strong_down):', output5);
  console.assert(output5.signal === 'none', 'Test Case 5 Failed: Should be no buy signal due to strong_down trend');

  console.log('All Mean Reversion Strategy tests completed.');
}

// To run the test, uncomment the line below (for development/testing purposes)
// runTest();