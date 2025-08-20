import { toCompactLines } from '../core/main-orchestrator';
import type { Decision } from '../core/decision-schema';

describe('Compact Formatter', () => {
  test('emits exactly 7 lines', () => {
    const decision: any = {
      asset: 'ETHUSDT',
      price: 4000,
      confidence: 0.72,
      position: 'long',
      entry: { type: 'zone', lower: 3995, upper: 4005 },
      stop: 3970,
      targets: [{ price: 4050, size_pct: 100 }],
      rr_min: 1.5
    };

    const output = toCompactLines(decision as Decision);
    const lines = output.split('\n');
    
    expect(lines).toHaveLength(7);
    expect(lines[0]).toMatch(/^coin: /);
    expect(lines[1]).toMatch(/^confidence: /);
    expect(lines[2]).toMatch(/^current_price: /);
    expect(lines[3]).toMatch(/^entry_price: /);
    expect(lines[4]).toMatch(/^tp: /);
    expect(lines[5]).toMatch(/^sl: /);
    expect(lines[6]).toMatch(/^additional: /);
  });

  test('formats HOLD decision correctly', () => {
    const holdDecision: any = {
      asset: 'BTCUSDT',
      price: 50000,
      confidence: 0.25,
      position: 'hold',
      entry: { type: 'zone', lower: 0, upper: 0 },
      stop: 0,
      targets: [{ price: 0, size_pct: 100 }],
      rr_min: 1.5
    };

    const output = toCompactLines(holdDecision as Decision);
    
    expect(output).toContain('coin: BTC');
    expect(output).toContain('confidence: 25%');
    expect(output).toContain('additional: RR≥1.5, hold');
  });

  test('strips USDT from coin name', () => {
    const decision: any = {
      asset: 'SOLUSDT',
      confidence: 0.6,
      position: 'short',
      entry: { type: 'zone', lower: 190, upper: 210 },
      stop: 220,
      targets: [{ price: 180, size_pct: 100 }],
      rr_min: 2.0
    };

    const output = toCompactLines(decision as Decision);
    
    expect(output).toContain('coin: SOL');
    expect(output).not.toContain('USDT');
  });

  test('handles missing price gracefully', () => {
    const decision: any = {
      asset: 'ADAUSDT',
      confidence: 0.55,
      position: 'long',
      entry: { type: 'zone', lower: 0.45, upper: 0.47 },
      stop: 0.42,
      targets: [{ price: 0.52, size_pct: 100 }],
      rr_min: 1.8
    };

    const output = toCompactLines(decision as Decision);
    
    // Should use entry mid when price is missing
    expect(output).toContain('current_price: 0.46');
  });

  test('formats numbers with proper precision', () => {
    const decision: any = {
      asset: 'ETHUSDT',
      price: 4000.123456,
      confidence: 0.789,
      position: 'long',
      entry: { type: 'zone', lower: 3995.987654, upper: 4005.123456 },
      stop: 3970.555555,
      targets: [{ price: 4050.999999, size_pct: 100 }],
      rr_min: 1.5
    };

    const output = toCompactLines(decision as Decision);
    
    expect(output).toContain('confidence: 79%'); // Rounded to nearest percent
    expect(output).toContain('current_price: 4000.123456'); // 6 decimal places max
  });
});