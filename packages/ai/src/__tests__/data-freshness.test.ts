import { intervalSec, allowedAgeSec, isStale, stalenessInfo, normalizeAgeSec } from '../utils/data-freshness';

describe('data-freshness', () => {
  describe('intervalSec', () => {
    it('returns expected seconds for sample timeframes', () => {
      expect(intervalSec('15m')).toBe(900);
      expect(intervalSec('30m')).toBe(1800);
      expect(intervalSec('1h')).toBe(3600);
      expect(intervalSec('4h')).toBe(14400);
      expect(intervalSec('6h')).toBe(21600);
      expect(intervalSec('12h')).toBe(43200);
      expect(intervalSec('1d')).toBe(86400);
      expect(intervalSec('3d')).toBe(259200);
      expect(intervalSec('1w')).toBe(604800);
    });

    it('handles case insensitive input', () => {
      expect(intervalSec('1H' as any)).toBe(3600);
      expect(intervalSec('6H' as any)).toBe(21600);
    });

    it('falls back to 1h for unknown timeframes', () => {
      expect(intervalSec('unknown' as any)).toBe(3600);
    });
  });

  describe('allowedAgeSec', () => {
    it('uses 0.8 multiplier for short timeframes (<=1h)', () => {
      // 15m: 900 * 0.8 = 720 seconds
      expect(allowedAgeSec('15m')).toBe(720);
      // 1h: 3600 * 0.8 = 2880 seconds
      expect(allowedAgeSec('1h')).toBe(2880);
    });

    it('uses 0.95 multiplier + 300s slack for multi-hour timeframes', () => {
      // 4h: 14400 * 0.95 + 300 = 13680 + 300 = 13980 seconds
      expect(allowedAgeSec('4h')).toBe(13980);
      // 6h: 21600 * 0.95 + 300 = 20520 + 300 = 20820 seconds (≈347 minutes)
      expect(allowedAgeSec('6h')).toBe(20820);
      // 12h: 43200 * 0.95 + 300 = 41040 + 300 = 41340 seconds
      expect(allowedAgeSec('12h')).toBe(41340);
    });

    it('respects floor parameter', () => {
      // Even for very short intervals, should not go below floor
      expect(allowedAgeSec('15m', 1000)).toBe(1000);
    });
  });

  describe('normalizeAgeSec', () => {
    it('converts milliseconds to seconds when age > 1_000_000', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // 77 minutes in milliseconds = 77 * 60 * 1000 = 4,620,000
      const ageMs = 77 * 60 * 1000;
      const normalized = normalizeAgeSec(ageMs, '6h');
      
      expect(normalized).toBe(4620); // 77 minutes in seconds
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('seems to be in milliseconds')
      );
      
      consoleSpy.mockRestore();
    });

    it('returns age as-is when in reasonable seconds range', () => {
      expect(normalizeAgeSec(4620, '6h')).toBe(4620); // 77 minutes
      expect(normalizeAgeSec(300, '1h')).toBe(300); // 5 minutes
    });

    it('coerces negative ages to 0', () => {
      expect(normalizeAgeSec(-100, '1h')).toBe(0);
      expect(normalizeAgeSec(0, '1h')).toBe(0);
    });
  });

  describe('isStale', () => {
    it('returns false for 6h timeframe with 77 minutes age', () => {
      const age77min = 77 * 60; // 4620 seconds
      expect(isStale(age77min, '6h')).toBe(false);
    });

    it('returns true when age exceeds allowedAgeSec', () => {
      // For 1h: allowed = 2880s (48min), so 50min should be stale
      const age50min = 50 * 60;
      expect(isStale(age50min, '1h')).toBe(true);
    });

    it('handles millisecond input correctly', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // 77 minutes in milliseconds should not be stale for 6h
      const age77minMs = 77 * 60 * 1000;
      expect(isStale(age77minMs, '6h')).toBe(false);
      
      consoleSpy.mockRestore();
    });
  });

  describe('stalenessInfo', () => {
    it('provides comprehensive staleness information', () => {
      const age77min = 77 * 60; // 4620 seconds
      const info = stalenessInfo(age77min, '6h');
      
      expect(info).toEqual({
        ageSec: 4620,
        allowedAgeSec: 20820, // 6h * 0.95 + 300
        stale: false,
        status: 'FRESH',
        ageMinutes: 77,
        allowedMinutes: 347 // Math.round(20820 / 60)
      });
    });

    it('handles stale data correctly', () => {
      const age50min = 50 * 60;
      const info = stalenessInfo(age50min, '1h');
      
      expect(info.stale).toBe(true);
      expect(info.status).toBe('STALE');
      expect(info.ageMinutes).toBe(50);
    });

    it('normalizes millisecond input', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const age77minMs = 77 * 60 * 1000;
      const info = stalenessInfo(age77minMs, '6h');
      
      expect(info.ageSec).toBe(4620); // Normalized to seconds
      expect(info.ageMinutes).toBe(77);
      
      consoleSpy.mockRestore();
    });
  });
});