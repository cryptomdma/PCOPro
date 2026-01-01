import { Product } from '@prisma/client';

export type AuditUnit = 'tracking' | 'checkout';

export function resolveMultiplier(product: Pick<Product, 'trackingToBase' | 'checkoutToBase'>, unit: AuditUnit): number {
  return unit === 'checkout' ? product.checkoutToBase : product.trackingToBase;
}

export function toCountedBase(countedQty: number, multiplier: number): number {
  return Math.round(countedQty * multiplier);
}

export function computeDelta(currentBase: number, countedBase: number) {
  const deltaBase = countedBase - currentBase;
  const afterBase = currentBase + deltaBase;
  return { deltaBase, afterBase };
}

export function isLargeDelta(currentBase: number, deltaBase: number): boolean {
  const absDelta = Math.abs(deltaBase);
  const baseline = Math.max(1, currentBase);
  const threshold = Math.max(0.25 * baseline, 100);
  return absDelta >= threshold;
}
