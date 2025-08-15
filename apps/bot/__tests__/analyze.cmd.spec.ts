import { handleAnalyzeCommand } from '../src/commands/analyze';

// Mock dependencies
jest.mock('@trading-bot/ai/orchestrator', () => ({
  buildAnalysisRequest: jest.fn().mockResolvedValue({
    analysis_request: { horizon: '1w', markets: ['crypto'] },
    universe: { crypto: ['BTCUSDT'] },
    data: { marketData: null },
    constraints: { max_symbols: 5, token_budget: 2000 }
  }),
  askMultiAssetPlan: jest.fn().mockResolvedValue({
    ranking: [
      { symbol: 'BTCUSDT', market: 'crypto', score: 0.75, reason: 'Strong momentum' }
    ],
    plans: {
      BTCUSDT: {
        symbol: 'BTCUSDT',
        timeframe: '4h',
        position: 'long',
        entry: { type: 'market', price: 45000, zone: [44500, 45500] },
        stop_loss: 42000,
        take_profits: [{ price: 48000, size_pct: 1.0 }],
        leverage: 1,
        expected_rr: 1.5,
        confidence: 0.75,
        horizon: 'swing_days',
        rationale: {
          trend: 'Uptrend',
          momentum: 'Strong',
          onchain: 'Neutral',
          liquidity: 'Good',
          sentiment: 'Positive',
          risks: ['Market volatility']
        },
        key_levels: {
          supports: [42000, 40000],
          resistances: [48000, 50000]
        },
        indicator_snapshot: {
          rsi: 65,
          macd: { diff: 100, signal: 80, hist: 20 },
          ema: { e20: 44800, e50: 43000, e200: 40000 },
          bb: { mid: 45000, upper: 46000, lower: 44000 },
          atr: 1200
        },
        invalid_if: ['BTC breaks 40k'],
        assumptions: ['Bull market continues'],
        timestamp: new Date().toISOString(),
        version: 'v2.0'
      }
    }
  })
}));

jest.mock('@trading-bot/marketdata/dataDigest', () => ({
  extractDataMdDigest: jest.fn().mockReturnValue('Mock data digest')
}));

describe('/analyze Command', () => {
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
    };
  });

  it('handles basic analyze command', async () => {
    await handleAnalyzeCommand(mockCtx, 'horizon=1w markets=crypto');
    
    expect(mockCtx.reply).toHaveBeenCalledTimes(2); // Ranking + 1 plan
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Market Analysis'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  it('handles empty arguments with defaults', async () => {
    await handleAnalyzeCommand(mockCtx, '');
    
    expect(mockCtx.reply).toHaveBeenCalled();
  });

  it('includes position button in plan response', async () => {
    await handleAnalyzeCommand(mockCtx, 'symbols=BTCUSDT');
    
    const planCall = mockCtx.reply.mock.calls.find((call: any) => 
      call[1]?.reply_markup?.inline_keyboard
    );
    
    expect(planCall).toBeDefined();
    expect(planCall[1].reply_markup.inline_keyboard[0][0].text).toBe('📊 Make Position');
  });

  it('handles errors gracefully', async () => {
    const { buildAnalysisRequest } = require('@trading-bot/ai/orchestrator');
    buildAnalysisRequest.mockRejectedValueOnce(new Error('Test error'));
    
    await handleAnalyzeCommand(mockCtx, 'horizon=1w');
    
    expect(mockCtx.reply).toHaveBeenCalledWith('❌ Analysis failed. Please try again.');
  });
});