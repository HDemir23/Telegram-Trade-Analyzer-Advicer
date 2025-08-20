import { analyzeAssetV2 } from '../../packages/ai/src/orchestrator-v2';

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Equity Market Hours Gates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful API responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            meta: { regularMarketPrice: 185.50 }
          }]
        }
      })
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should force HOLD for US stocks during market closed hours', async () => {
    // Mock Sunday night (market closed)
    const sundayNight = new Date('2024-12-15T23:00:00-05:00'); // Sunday 11pm EST
    jest.useFakeTimers();
    jest.setSystemTime(sundayNight);

    const result = await analyzeAssetV2('AAPL', 'openai/gpt-4o-mini');
    
    expect(result.position).toBe('hold');
    expect(result.rationale).toContain('market_closed');
    expect(result.asset).toBe('AAPL');
    expect(result.market).toBe('equity');
  });

  it('should allow analysis during US market hours', async () => {
    // Mock Tuesday 2pm EST (market open)
    const tuesdayAfternoon = new Date('2024-12-17T14:00:00-05:00');
    jest.useFakeTimers();
    jest.setSystemTime(tuesdayAfternoon);

    const result = await analyzeAssetV2('AAPL', 'openai/gpt-4o-mini');
    
    expect(result).toBeDefined();
    expect(result.asset).toBe('AAPL');
    expect(result.market).toBe('equity');
    // Should not be forced to hold due to market hours
    if (result.position === 'hold') {
      expect(result.rationale).not.toContain('market_closed');
    }
  });

  it('should force HOLD for stale equity quotes during market hours', async () => {
    // Mock Wednesday 2pm EST (market open)
    const wednesdayAfternoon = new Date('2024-12-18T14:00:00-05:00');
    jest.useFakeTimers();
    jest.setSystemTime(wednesdayAfternoon);

    // Mock stale data (older than 3 minutes during market hours)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            meta: { 
              regularMarketPrice: 185.50,
              // Mock old timestamp (5 minutes ago)
              regularMarketTime: Math.floor(Date.now() / 1000) - 300
            }
          }]
        }
      })
    });

    const result = await analyzeAssetV2('AAPL', 'openai/gpt-4o-mini');
    
    expect(result.position).toBe('hold');
    // Should be forced to hold due to stale data, not market hours
    expect(result.rationale).toContain('stale');
  });

  it('should not apply gates to crypto assets', async () => {
    // Mock Sunday night (US market closed, but crypto always open)
    const sundayNight = new Date('2024-12-15T23:00:00-05:00');
    jest.useFakeTimers();
    jest.setSystemTime(sundayNight);

    // Mock crypto price response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ price: '67500.00' })
    });

    const result = await analyzeAssetV2('BTCUSDT', 'openai/gpt-4o-mini');
    
    expect(result).toBeDefined();
    expect(result.asset).toBe('BTCUSDT');
    expect(result.market).toBe('crypto');
    // Should not be forced to hold due to market hours (crypto is 24/7)
    if (result.position === 'hold') {
      expect(result.rationale).not.toContain('market_closed');
    }
  });

  it('should recognize BIST stocks and apply Turkish market hours', async () => {
    // Test would require proper BIST market hours logic
    // This is a placeholder for BIST-specific testing
    const result = await analyzeAssetV2('THYAO', 'openai/gpt-4o-mini');
    
    expect(result).toBeDefined();
    expect(result.asset).toBe('THYAO');
    expect(result.market).toBe('equity');
  });
});