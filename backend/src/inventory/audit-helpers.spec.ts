import { describe, expect, it } from 'vitest';
import { computeDelta, isLargeDelta, resolveMultiplier, toCountedBase } from './audit-helpers';

const sampleProduct = {
  trackingToBase: 128,
  checkoutToBase: 16,
};

describe('audit helpers', () => {
  it('resolves multipliers and computes counted base + delta', () => {
    const multiplier = resolveMultiplier(sampleProduct, 'tracking');
    expect(multiplier).toBe(128);
    const countedBase = toCountedBase(2.5, multiplier);
    expect(countedBase).toBe(320);
    const { deltaBase, afterBase } = computeDelta(280, countedBase);
    expect(deltaBase).toBe(40);
    expect(afterBase).toBe(320);
  });

  it('detects large deltas using threshold rule', () => {
    expect(isLargeDelta(0, 50)).toBe(false); // threshold max(0.25*1, 100) = 100
    expect(isLargeDelta(0, 100)).toBe(true);
    expect(isLargeDelta(400, 80)).toBe(false); // 0.25 * 400 = 100 -> threshold 100
    expect(isLargeDelta(400, -120)).toBe(true);
    expect(isLargeDelta(2000, 300)).toBe(true); // threshold 500
    expect(isLargeDelta(2000, 200)).toBe(false);
  });
});
