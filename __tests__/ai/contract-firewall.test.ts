import { validateStageResponse } from '../../packages/ai/src/funnel-orchestrator';

describe('Contract Firewall', () => {
  describe('Stage S Validation', () => {
    it('should accept valid Stage S response', () => {
      const validResponse = JSON.stringify({
        timeframe: '1h',
        top: [
          {
            symbol: 'BTCUSDT',
            score: 0.85,
            dir: 'long',
            rr_potential: 2.5,
            risks: ['volatility'],
            reason: 'Strong uptrend momentum'
          }
        ]
      });

      expect(() => validateStageResponse(validResponse, 'S')).not.toThrow();
    });

    it('should reject Stage S response with extra keys', () => {
      const invalidResponse = JSON.stringify({
        timeframe: '1h',
        top: [],
        ranking: [], // Extra key that violates contract
        confidence: 0.8
      });

      expect(() => validateStageResponse(invalidResponse, 'S'))
        .toThrow(/STAGE_S_CONTRACT_VIOLATION.*ranking,confidence/);
    });

    it('should reject Stage S response with malformed top array', () => {
      const invalidResponse = JSON.stringify({
        timeframe: '1h',
        top: [
          {
            symbol: 'BTCUSDT',
            // Missing score and dir
            rr_potential: 2.5
          }
        ]
      });

      expect(() => validateStageResponse(invalidResponse, 'S'))
        .toThrow(/STAGE_S_INVALID_TOP_STRUCTURE/);
    });
  });

  describe('Stage P Validation', () => {
    it('should accept valid Stage P response', () => {
      const validResponse = JSON.stringify({
        timeframe: '1h',
        picks: [
          {
            asset: 'BTCUSDT',
            position: 'long',
            size_pct: 20,
            expected_rr: 2.5,
            confidence: 0.75,
            overlap_beta: 0.3,
            notes: 'Strong momentum setup'
          }
        ],
        reserves_pct: 40,
        diversification: {
          pairwise_max_corr: 0.4,
          sector_spread: ['Crypto']
        }
      });

      expect(() => validateStageResponse(validResponse, 'P')).not.toThrow();
    });

    it('should reject Stage P response with extra keys', () => {
      const invalidResponse = JSON.stringify({
        timeframe: '1h',
        picks: [],
        reserves_pct: 40,
        diversification: {},
        ranking: [], // Extra key
        metadata: {} // Extra key
      });

      expect(() => validateStageResponse(invalidResponse, 'P'))
        .toThrow(/STAGE_P_CONTRACT_VIOLATION.*ranking,metadata/);
    });

    it('should reject Stage P response with malformed picks array', () => {
      const invalidResponse = JSON.stringify({
        timeframe: '1h',
        picks: [
          {
            asset: 'BTCUSDT',
            // Missing position and size_pct
            expected_rr: 2.5
          }
        ],
        reserves_pct: 40,
        diversification: {}
      });

      expect(() => validateStageResponse(invalidResponse, 'P'))
        .toThrow(/STAGE_P_INVALID_PICKS_STRUCTURE/);
    });
  });
});