import { sanitizeDecision, cleanJsonFromText } from '../utils/sanitizer';

describe('Contract Firewall and Sanitization', () => {
  test('rejects decisions with NaN values', () => {
    const invalidDecision = {
      asset: 'ETHUSDT',
      market: 'crypto',
      timeframe: '1h',
      timestamp_ms: Date.now(),
      position: 'long',
      entry: { type: 'zone', lower: 3990, upper: 4010 },
      stop: NaN, // Invalid!
      targets: [{ price: 4050, size_pct: 100 }],
      confidence: 0.75,
      rationale: 'Test',
      rr_min: 1.5,
      realized_rr_est: 2.0,
      leverage: 1,
      size_pct: 20,
      data_quality: {
        age_sec: 30,
        coverage: { price: true },
        stale: false
      },
      feature_scores: { trend: 0.7, momentum: 0.6, rsi_signal: 0.5, risk: 0.3 }
    };

    expect(() => sanitizeDecision(invalidDecision)).toThrow('Non-finite numeric field');
  });

  test('rejects decisions with Infinity values', () => {
    const invalidDecision = {
      asset: 'BTCUSDT',
      market: 'crypto',
      timeframe: '1h',
      timestamp_ms: Date.now(),
      position: 'long',
      entry: { type: 'zone', lower: 49000, upper: 51000 },
      stop: 48000,
      targets: [{ price: Infinity, size_pct: 100 }], // Invalid!
      confidence: 0.8,
      rationale: 'Test',
      rr_min: 1.5,
      realized_rr_est: 2.0,
      leverage: 1,
      size_pct: 20,
      data_quality: {
        age_sec: 30,
        coverage: { price: true },
        stale: false
      },
      feature_scores: { trend: 0.7, momentum: 0.6, rsi_signal: 0.5, risk: 0.3 }
    };

    expect(() => sanitizeDecision(invalidDecision)).toThrow('Non-finite numeric field');
  });

  test('accepts valid decisions', () => {
    const validDecision = {
      asset: 'SOLUSDT',
      market: 'crypto',
      timeframe: '1h',
      timestamp_ms: Date.now(),
      position: 'short',
      entry: { type: 'zone', lower: 195, upper: 205 },
      stop: 210,
      targets: [{ price: 180, size_pct: 100 }],
      confidence: 0.65,
      rationale: 'Valid test decision',
      rr_min: 1.5,
      realized_rr_est: 1.8,
      leverage: 1,
      size_pct: 20,
      data_quality: {
        age_sec: 30,
        coverage: { price: true },
        stale: false
      },
      feature_scores: { trend: 0.3, momentum: 0.4, rsi_signal: 0.7, risk: 0.5 }
    };

    expect(() => sanitizeDecision(validDecision)).not.toThrow();
    const result = sanitizeDecision(validDecision);
    expect(result.asset).toBe('SOLUSDT');
    expect(result.position).toBe('short');
  });

  test('cleanJsonFromText removes AI commentary', () => {
    const aiResponse = `Here's the trading analysis you requested:

    Looking at the market conditions, I recommend:

    {
      "position": "long",
      "confidence": 0.75,
      "rationale": "Strong uptrend"
    }

    Note: This analysis is based on current market conditions.
    However, please consider your risk tolerance.`;

    const cleaned = cleanJsonFromText(aiResponse);
    
    expect(cleaned).toBe('{\n      "position": "long",\n      "confidence": 0.75,\n      "rationale": "Strong uptrend"\n    }');
    expect(cleaned).not.toContain('Here\'s');
    expect(cleaned).not.toContain('Note:');
    expect(cleaned).not.toContain('However,');
  });

  test('cleanJsonFromText handles markdown formatting', () => {
    const markdownResponse = `\`\`\`json
    {
      "position": "hold",
      "confidence": 0.3
    }
    \`\`\``;

    const cleaned = cleanJsonFromText(markdownResponse);
    
    expect(cleaned).toBe('{\n      "position": "hold",\n      "confidence": 0.3\n    }');
    expect(cleaned).not.toContain('```');
  });

  test('cleanJsonFromText extracts JSON from mixed content', () => {
    const mixedContent = `Analysis complete. The recommendation is: {"position":"short","confidence":0.8,"stop":210} based on technical indicators.`;

    const cleaned = cleanJsonFromText(mixedContent);
    
    expect(cleaned).toBe('{"position":"short","confidence":0.8,"stop":210}');
  });
});