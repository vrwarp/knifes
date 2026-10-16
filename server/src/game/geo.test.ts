import { describe, expect, it } from 'vitest';
import { formatDistance, haversineMeters } from './geo.js';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 34, lng: -118 }, { lat: 34, lng: -118 })).toBe(0);
  });
  it('measures LA to NYC within a percent', () => {
    const d = haversineMeters({ lat: 34.0522, lng: -118.2437 }, { lat: 40.7128, lng: -74.006 });
    expect(d).toBeGreaterThan(3_900_000);
    expect(d).toBeLessThan(3_960_000);
  });
  it('formats metres and kilometres', () => {
    expect(formatDistance(42)).toBe('42 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(25_000)).toBe('25 km');
  });
});
