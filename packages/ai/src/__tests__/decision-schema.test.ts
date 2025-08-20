import { validateAndRepair, getEntryMid } from '../core/decision-schema';

describe('Schema V2 - Validation and Repair', () => {
  test('repairs inverted tp/sl and enforces RR', () => {
    const invalidDecision = {
      asset: 'ETHUSDT',
      market: 'crypto' as const,
      timeframe: '1h' as const,
      timestamp_ms: Date.now(),
      position: 'long' as const,
      entry: { type: 'zone' as const, lower: 3990, upper: 4010 },
      stop: 4020, // WRONG: stop above entry for long
      targets: [{ price: 3980, size_pct: 100 }], // WRONG: target below entry for long
      confidence: 0.8,
      rationale: 'Test case',
      rr_min: 2.0,
      realized_rr_est: 1.0,
      leverage: 1,
      size_pct: 20,
      data_quality: {
        age_sec: 30,
        coverage: { price: true },
        stale: false
      },
      feature_scores: { trend: 0.7, momentum: 0.6, rsi_signal: 0.5, risk: 0.3 }
    };

    const repaired = validateAndRepair(invalidDecision, 1.2, 4000);
    
    // Should fix stop to be below entry for long
    expect(repaired.stop!).toBeLessThan(4000);
    
    // Should fix target to be above entry for long
    expect(repaired.targets[0].price).toBeGreaterThan(4010);
    
    // Should maintain basic structure
    expect(repaired.asset).toBe('ETHUSDT');
    expect(repaired.position).toBe('long');
  });

  test('enforces minimum ATR distances', () => {
    const decision = {
      asset: 'BTCUSDT',
      market: 'crypto' as const,
      timeframe: '1h' as const,
      timestamp_ms: Date.now(),
      position: 'long' as const,
      entry: { type: 'zone' as const, lower: 49999, upper: 50001 }, // Very narrow entry
      stop: 49999.5, // Too close to entry
      targets: [{ price: 50000.5, size_pct: 100 }], // Too close to entry
      confidence: 0.75,
      rationale: 'Test ATR enforcement',
      rr_min: 1.5,
      realized_rr_est: 1.0,
      leverage: 1,
      size_pct: 20,
      data_quality: {
        age_sec: 30,
        coverage: { price: true },
        stale: false
      },
      feature_scores: { trend: 0.7, momentum: 0.6, rsi_signal: 0.5, risk: 0.3 }
    };

    const repaired = validateAndRepair(decision, 2.0, 50000); // 2% ATR
    
    const entryMid = getEntryMid(repaired.entry);
    const atrPx = 2.0 * 50000 / 100; // 1000 px
    
    // Stop should be at least 0.35*ATR away (350px)
    expect(Math.abs((repaired.stop || 0) - entryMid)).toBeGreaterThanOrEqual(350);
    
    // Target should be at least 0.8*ATR away (800px)
    expect(Math.abs(repaired.targets[0].price - entryMid)).toBeGreaterThanOrEqual(800);
  });

  test('forces HOLD for insufficient RR', () => {
    const lowRRDecision = {
      asset: 'SOLUSDT',
      market: 'crypto' as const,
      timeframe: '1h' as const,
      timestamp_ms: Date.now(),
      position: 'long' as const,
      entry: { type: 'zone' as const, lower: 190, upper: 210 },
      stop: 180,
      targets: [{ price: 205, size_pct: 100 }], // Very low RR
      confidence: 0.8,
      rationale: 'Low RR test',
      rr_min: 2.5,
      realized_rr_est: 0.5,
      leverage: 1,
      size_pct: 20,
      data_quality: {
        age_sec: 30,
        coverage: { price: true },
        stale: false
      },
      feature_scores: { trend: 0.7, momentum: 0.6, rsi_signal: 0.5, risk: 0.3 }
    };

    const repaired = validateAndRepair(lowRRDecision, 1.0, 200);
    
    // Should force HOLD due to insufficient RR
    expect(repaired.position).toBe('hold');
    expect(repaired.confidence).toBeLessThanOrEqual(0.35);
    expect(repaired.rationale).toContain('Insufficient RR');
  });

  test('getEntryMid calculates correct midpoint', () => {
    const zoneEntry = { type: 'zone' as const, lower: 100, upper: 200 };
    expect(getEntryMid(zoneEntry)).toBe(150);
    
    const priceEntry = { type: 'limit' as const, price: 175 };
    expect(getEntryMid(priceEntry)).toBe(175);
    
    const invalidEntry = { type: 'market' as const };
    expect(getEntryMid(invalidEntry)).toBe(0);
  });
});