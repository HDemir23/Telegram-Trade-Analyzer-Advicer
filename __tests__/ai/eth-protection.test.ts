import { analyzeRegime, calculateConfidence } from '../../packages/ai/src/regime-analysis';

describe('ETH Protection & Regime Filters', () => {
  describe('RSI Oversold Longs Protection', () => {
    it('should block RSI oversold longs in strong downtrends', () => {
      const mockData = {
        prices: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55], // Strong downtrend
        ma50: 75,
        atr: 2.5,
        rsi: 25, // Oversold
        adx: 35  // Strong trend
      };

      const regime = analyzeRegime(mockData, 55);
      
      expect(regime.trend_regime).toBe('down');
      expect(regime.trend_strength).toBe(35);
      expect(regime.allow_rsi_longs).toBe(false); // Should block oversold longs
      expect(regime.allow_rsi_shorts).toBe(true);  // Should allow shorts
    });

    it('should allow RSI oversold longs in uptrends', () => {
      const mockData = {
        prices: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95], // Strong uptrend
        ma50: 75,
        atr: 2.5,
        rsi: 25, // Oversold (could be pullback in uptrend)
        adx: 30  // Strong trend
      };

      const regime = analyzeRegime(mockData, 95);
      
      expect(regime.trend_regime).toBe('up');
      expect(regime.trend_strength).toBe(30);
      expect(regime.allow_rsi_longs).toBe(true);  // Should allow oversold longs in uptrend
      expect(regime.allow_rsi_shorts).toBe(false); // Should block shorts in uptrend
    });

    it('should allow RSI oversold longs in weak downtrends', () => {
      const mockData = {
        prices: [100, 98, 96, 94, 92, 90, 88, 86, 84, 82], // Weak downtrend
        ma50: 90,
        atr: 1.5,
        rsi: 28, // Oversold
        adx: 20  // Weak trend
      };

      const regime = analyzeRegime(mockData, 82);
      
      expect(regime.trend_regime).toBe('down');
      expect(regime.trend_strength).toBe(20);
      expect(regime.allow_rsi_longs).toBe(true); // Should allow in weak downtrend
      expect(regime.allow_rsi_shorts).toBe(true);
    });

    it('should block RSI overbought shorts in strong uptrends', () => {
      const mockData = {
        prices: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95], // Strong uptrend
        ma50: 75,
        atr: 2.5,
        rsi: 75, // Overbought
        adx: 40  // Very strong trend
      };

      const regime = analyzeRegime(mockData, 95);
      
      expect(regime.trend_regime).toBe('up');
      expect(regime.trend_strength).toBe(40);
      expect(regime.allow_rsi_longs).toBe(true);
      expect(regime.allow_rsi_shorts).toBe(false); // Should block overbought shorts in strong uptrend
    });
  });

  describe('Trend Quality Assessment', () => {
    it('should recognize high-quality trends with good R-squared', () => {
      // Perfect linear uptrend
      const perfectTrend = Array.from({length: 20}, (_, i) => 100 + i * 2);
      const mockData = {
        prices: perfectTrend,
        ma50: 120,
        atr: 1.0,
        rsi: 60,
        adx: 30
      };

      const regime = analyzeRegime(mockData, 138);
      
      expect(regime.trend_quality).toBeGreaterThan(0.8); // High R-squared
      expect(regime.trend_regime).toBe('up');
    });

    it('should recognize low-quality trends with poor R-squared', () => {
      // Choppy, sideways movement
      const choppyPrices = [100, 102, 99, 101, 98, 103, 97, 102, 99, 101, 98, 103, 100, 99, 102, 98, 101, 99, 102, 100];
      const mockData = {
        prices: choppyPrices,
        ma50: 100,
        atr: 2.0,
        rsi: 50,
        adx: 15
      };

      const regime = analyzeRegime(mockData, 100);
      
      expect(regime.trend_quality).toBeLessThan(0.3); // Low R-squared
      expect(regime.trend_regime).toBe('flat');
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate high confidence with good coverage and fresh data', () => {
      const coverage = {
        price: true,
        orderbook: true,
        derivatives: true,
        sentiment: true,
        correlations: true
      };
      
      const featureScores = {
        trend: 0.8,
        momentum: 0.75,
        rsi_signal: 0.7,
        risk: 0.3
      };

      const confidence = calculateConfidence(coverage, 30, 300, featureScores);
      
      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should calculate low confidence with poor coverage and stale data', () => {
      const coverage = {
        price: true,
        orderbook: false,
        derivatives: false,
        sentiment: false,
        correlations: false
      };
      
      const featureScores = {
        trend: 0.3,
        momentum: 0.7,
        rsi_signal: 0.2,
        risk: 0.8
      };

      const confidence = calculateConfidence(coverage, 400, 300, featureScores); // Stale data
      
      expect(confidence).toBeLessThan(0.4);
      expect(confidence).toBeGreaterThanOrEqual(0);
    });

    it('should penalize conflicting signals in agreement score', () => {
      const coverage = {
        price: true,
        orderbook: true,
        derivatives: true,
        sentiment: true,
        correlations: true
      };
      
      // Highly conflicting signals
      const conflictingScores = {
        trend: 0.9,      // Very bullish
        momentum: 0.1,   // Very bearish
        rsi_signal: 0.8, // Bullish
        risk: 0.2        // Low risk
      };

      const confidence = calculateConfidence(coverage, 30, 300, conflictingScores);
      
      // Should be lower than if signals were aligned
      expect(confidence).toBeLessThan(0.6);
    });
  });

  describe('Volatility Regime Classification', () => {
    it('should classify high volatility regime correctly', () => {
      // High volatility prices (large moves)
      const highVolPrices = [100, 110, 95, 108, 92, 115, 88, 112, 90, 118];
      const mockData = {
        prices: highVolPrices,
        ma50: 105,
        atr: 8.0, // High ATR
        rsi: 50,
        adx: 25
      };

      const regime = analyzeRegime(mockData, 118);
      
      expect(regime.volatility_regime).toBe('high');
      expect(regime.atr_zscore).toBeGreaterThan(1.0);
    });

    it('should classify low volatility regime correctly', () => {
      // Low volatility prices (small moves)
      const lowVolPrices = [100, 100.5, 99.8, 100.2, 99.9, 100.1, 99.95, 100.05, 100.1, 99.9];
      const mockData = {
        prices: lowVolPrices,
        ma50: 100,
        atr: 0.3, // Low ATR
        rsi: 50,
        adx: 15
      };

      const regime = analyzeRegime(mockData, 99.9);
      
      expect(regime.volatility_regime).toBe('low');
      expect(regime.atr_zscore).toBeLessThan(-0.5);
    });
  });
});