import { buildAnalysisRequest, askMultiAssetPlan } from '../src/orchestrator';
import { multiAssetOutputSchema } from '../src/schema';

describe('Multi-Asset Orchestrator', () => {
  describe('buildAnalysisRequest', () => {
    it('builds request with sparse data', async () => {
      const request = await buildAnalysisRequest({
        horizon: '1w',
        markets: ['crypto'],
        symbols: [],
        prefer: ['BTCUSDT'],
        include_global: true,
        top: 3
      });

      expect(request.analysis_request.horizon).toBe('1w');
      expect(request.analysis_request.markets).toEqual(['crypto']);
      expect(request.constraints.max_symbols).toBe(5);
    });

    it('includes data digest when provided', async () => {
      const digest = 'Market data shows strong momentum';
      const request = await buildAnalysisRequest({
        horizon: '2w',
        markets: ['crypto', 'spx'],
        symbols: ['SOLUSDT'],
        prefer: [],
        include_global: false,
        top: 5
      }, digest);

      expect(request.analysis_request.notes_from_data_md).toBe(digest);
    });
  });

  describe('askMultiAssetPlan', () => {
    it('returns valid multiAsset output', async () => {
      const input = {
        analysis_request: {
          horizon: '1w',
          markets: ['crypto'],
          symbols: [],
          prefer: ['BTCUSDT'],
          include_global: true,
          top: 3
        },
        universe: { crypto: ['BTCUSDT', 'ETHUSDT'] },
        data: { marketData: null },
        constraints: { max_symbols: 5, token_budget: 2000 }
      };

      const result = await askMultiAssetPlan(input);
      
      expect(() => multiAssetOutputSchema.parse(result)).not.toThrow();
      expect(result.ranking).toBeDefined();
      expect(Array.isArray(result.ranking)).toBe(true);
      expect(result.plans).toBeDefined();
    });

    it('clamps ranking to requested top K', async () => {
      const input = {
        analysis_request: {
          horizon: '1w',
          markets: ['crypto'],
          symbols: [],
          prefer: [],
          include_global: true,
          top: 2
        },
        universe: { crypto: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] },
        data: { marketData: null },
        constraints: { max_symbols: 2, token_budget: 1000 }
      };

      const result = await askMultiAssetPlan(input);
      
      expect(result.ranking.length).toBeLessThanOrEqual(2);
    });
  });
});