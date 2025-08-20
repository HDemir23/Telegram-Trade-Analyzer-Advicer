import { MultiFunnelOrchestrator, QuantScreener, PortfolioSelector } from '../../packages/ai/src/funnel-orchestrator';
import { ScreeningResultSchema, PortfolioResultSchema } from '../../packages/ai/src/funnel-schemas';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Multi-Stage Funnel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ price: '50000.00' })
    });
  });

  describe('QuantScreener', () => {
    let screener: QuantScreener;

    beforeEach(() => {
      screener = new QuantScreener();
    });

    it('should screen assets and return top candidates', async () => {
      const request = {
        timeframe: '1h' as const,
        top_k: 3,
        min_rr: 2.0,
        data_staleness_sec: 300,
        assets: [
          {
            symbol: 'BTCUSDT',
            price: 67500,
            atr_pct: 0.02,
            rsi: 55,
            ma50_slope: 0.05,
            adx: 25,
            age_sec: 30
          },
          {
            symbol: 'ETHUSDT', 
            price: 3500,
            atr_pct: 0.025,
            rsi: 45,
            ma50_slope: -0.02,
            adx: 30,
            age_sec: 45
          }
        ]
      };

      const result = await screener.screenAssets(request);
      
      expect(ScreeningResultSchema.parse(result)).toBeDefined();
      expect(result.timeframe).toBe('1h');
      expect(result.top).toHaveLength(2);
      expect(result.top[0].symbol).toBeDefined();
      expect(result.top[0].score).toBeGreaterThanOrEqual(0);
      expect(result.top[0].score).toBeLessThanOrEqual(1);
    });

    it('should use fallback scoring when AI fails', async () => {
      // Mock AI failure
      mockFetch.mockRejectedValue(new Error('AI API down'));

      const request = {
        timeframe: '1h' as const,
        top_k: 2,
        min_rr: 2.0,
        data_staleness_sec: 300,
        assets: [
          {
            symbol: 'BTCUSDT',
            price: 67500,
            atr_pct: 0.02,
            rsi: 55,
            ma50_slope: 0.05,
            adx: 25,
            age_sec: 30
          }
        ]
      };

      const result = await screener.screenAssets(request);
      
      expect(result).toBeDefined();
      expect(result.top).toHaveLength(1);
      expect(result.top[0].reason).toContain('Strong'); // Fallback reasoning
    });
  });

  describe('PortfolioSelector', () => {
    let selector: PortfolioSelector;

    beforeEach(() => {
      selector = new PortfolioSelector();
    });

    it('should select 3 positions from valid decisions', async () => {
      const validDecisions = [
        {
          asset: 'BTCUSDT',
          position: 'long' as const,
          confidence: 0.75,
          realized_rr_est: 2.5,
          data_quality: { stale: false },
          feature_scores: { risk: 0.3 }
        },
        {
          asset: 'ETHUSDT', 
          position: 'short' as const,
          confidence: 0.65,
          realized_rr_est: 2.0,
          data_quality: { stale: false },
          feature_scores: { risk: 0.4 }
        },
        {
          asset: 'AAPL',
          position: 'long' as const, 
          confidence: 0.70,
          realized_rr_est: 2.2,
          data_quality: { stale: false },
          feature_scores: { risk: 0.25 }
        }
      ];

      const request = {
        timeframe: '1h' as const,
        risk_budget_pct: 60,
        max_corr: 0.5,
        universe: validDecisions
      };

      const result = await selector.selectPortfolio(request);
      
      expect(PortfolioResultSchema.parse(result)).toBeDefined();
      expect(result.picks).toHaveLength(3);
      expect(result.picks.every(pick => pick.size_pct > 0)).toBe(true);
      expect(result.reserves_pct).toBeGreaterThanOrEqual(0);
    });

    it('should handle insufficient valid decisions', async () => {
      const request = {
        timeframe: '1h' as const,
        risk_budget_pct: 60,
        max_corr: 0.5,
        universe: [
          {
            asset: 'BTCUSDT',
            position: 'hold' as const, // Invalid for portfolio
            confidence: 0.3,
            realized_rr_est: 0,
            data_quality: { stale: true }
          }
        ]
      };

      const result = await selector.selectPortfolio(request);
      
      expect(result.picks.length).toBeLessThan(3);
      expect(result.reserves_pct).toBeGreaterThan(0);
    });
  });

  describe('MultiFunnelOrchestrator', () => {
    let orchestrator: MultiFunnelOrchestrator;

    beforeEach(() => {
      orchestrator = new MultiFunnelOrchestrator();
    });

    it('should execute full funnel pipeline', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'AAPL'];
      
      const result = await orchestrator.executeFullFunnel(symbols, '1h', 3);
      
      expect(result).toBeDefined();
      expect(result.timeframe).toBe('1h');
      expect(result.picks.length).toBeLessThanOrEqual(3);
    }, 60000); // Longer timeout for full pipeline
  });
});