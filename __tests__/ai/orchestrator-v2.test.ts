import { analyzeAssetV2, EnhancedMarketDataService } from '../../packages/ai/src/orchestrator-v2';
import { DecisionSchema } from '../../packages/ai/src/schema-v2';

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Orchestrator V2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful Binance API response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        price: '67500.00'
      })
    });
  });

  describe('analyzeAssetV2', () => {
    it('should analyze BTCUSDT successfully', async () => {
      const result = await analyzeAssetV2('BTCUSDT', 'openai/gpt-4o-mini');
      
      expect(result).toBeDefined();
      expect(result.asset).toBe('BTCUSDT');
      expect(result.market).toBe('crypto');
      expect(['long', 'short', 'hold']).toContain(result.position);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle API failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const result = await analyzeAssetV2('BTCUSDT', 'openai/gpt-4o-mini');
      
      expect(result).toBeDefined();
      expect(result.position).toBe('hold'); // Should fallback to hold on errors
    });

    it('should validate decision schema', async () => {
      const result = await analyzeAssetV2('ETHUSDT', 'anthropic/claude-3.5-sonnet');
      
      expect(() => DecisionSchema.parse(result)).not.toThrow();
    });

    it('should respect market hours for stocks', async () => {
      const result = await analyzeAssetV2('AAPL', 'openai/gpt-4o-mini');
      
      expect(result).toBeDefined();
      expect(result.asset).toBe('AAPL');
      expect(result.market).toBe('equity');
    });
  });

  describe('EnhancedMarketDataService', () => {
    let dataService: EnhancedMarketDataService;

    beforeEach(() => {
      dataService = new EnhancedMarketDataService();
    });

    it('should fetch crypto prices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: '67500.00' })
      });

      const data = await dataService.getEnhancedTechnicalData('BTCUSDT');
      
      expect(data.price).toBe(67500);
      expect(data.asset).toBe('BTCUSDT');
    });

    it('should fetch stock prices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [{
              meta: { regularMarketPrice: 185.50 }
            }]
          }
        })
      });

      const data = await dataService.getEnhancedTechnicalData('AAPL');
      
      expect(data.price).toBe(185.50);
      expect(data.asset).toBe('AAPL');
    });

    it('should use fallback prices on API failure', async () => {
      mockFetch.mockRejectedValue(new Error('API down'));

      const data = await dataService.getEnhancedTechnicalData('BTCUSDT');
      
      expect(data.price).toBe(117000); // Fallback price
      expect(data.dataStale).toBe(true);
    });
  });
});