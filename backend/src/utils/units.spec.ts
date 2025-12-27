import { describe, expect, it } from 'vitest';
import { baseToDisplay, formatDisplayQuantity, getUnitFactor, toBaseQuantity } from './units';
import { UnitBaseType } from '@prisma/client';

const sampleProduct = {
  baseType: UnitBaseType.VOLUME,
  trackingUnitLabel: 'gallon',
  checkoutUnitLabel: 'fluid ounce',
  orderingUnitLabel: 'jug (1 gal)',
  trackingToBase: 128,
  checkoutToBase: 1,
  orderingToBase: 128,
};

describe('unit helpers', () => {
  it('resolves factors by matching labels and falls back to ordering', () => {
    expect(getUnitFactor(sampleProduct, 'gallon')).toBe(128);
    expect(getUnitFactor(sampleProduct, 'fluid ounce')).toBe(1);
    expect(getUnitFactor(sampleProduct, 'jug (1 gal)')).toBe(128);
    expect(getUnitFactor(sampleProduct, 'unknown')).toBe(128);
    expect(getUnitFactor(sampleProduct, undefined, 'checkout')).toBe(1);
  });

  it('converts to base and rounds deterministically', () => {
    expect(toBaseQuantity(1, 128)).toBe(128);
    expect(toBaseQuantity(2.5, 16)).toBe(40);
  });

  it('formats base quantities back to display units', () => {
    expect(baseToDisplay(256, 128)).toBe(2);
    expect(formatDisplayQuantity(64, 32, 'quart')).toBe('2 quart');
  });
});
