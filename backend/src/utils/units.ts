import { UnitBaseType } from '@prisma/client';

export type ProductUnitShape = {
  baseType: UnitBaseType;
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
  orderingUnitLabel: string;
  trackingToBase: number;
  checkoutToBase: number;
  orderingToBase: number;
};

export function getUnitFactor(product: ProductUnitShape, unitLabel?: string, fallback: 'tracking' | 'checkout' | 'ordering' = 'ordering'): number {
  const normalized = (unitLabel ?? '').trim().toLowerCase();
  if (normalized && normalized === product.trackingUnitLabel.trim().toLowerCase()) {
    return product.trackingToBase;
  }
  if (normalized && normalized === product.checkoutUnitLabel.trim().toLowerCase()) {
    return product.checkoutToBase;
  }
  if (normalized && normalized === product.orderingUnitLabel.trim().toLowerCase()) {
    return product.orderingToBase;
  }

  if (fallback === 'tracking') return product.trackingToBase;
  if (fallback === 'checkout') return product.checkoutToBase;
  return product.orderingToBase;
}

export function toBaseQuantity(quantity: number, factor: number): number {
  return Math.round(quantity * factor);
}

export function baseToDisplay(baseQuantity: number, factor: number): number {
  const raw = baseQuantity / factor;
  return Math.round(raw * 100) / 100;
}

export function formatDisplayQuantity(baseQuantity: number, factor: number, unitLabel: string): string {
  const value = baseToDisplay(baseQuantity, factor);
  return `${value} ${unitLabel}`;
}
