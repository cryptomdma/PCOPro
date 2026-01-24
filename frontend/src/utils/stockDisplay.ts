type StockDisplayInput = {
  role?: string | null;
  onHandBase?: number | null;
  trackingToBase?: number | null;
  trackingUnitLabel?: string | null;
};

const roundTo = (value: number, precision = 2) => {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
};

export function getStockDisplay({
  role,
  onHandBase,
  trackingToBase,
  trackingUnitLabel,
}: StockDisplayInput) {
  const base = onHandBase ?? 0;
  const inStock = base > 0;

  if (role === 'TECH') {
    return { label: inStock ? 'In Stock' : 'Out of Stock', inStock, quantityTracking: null };
  }

  if (!trackingToBase || !trackingUnitLabel) {
    return { label: '-', inStock, quantityTracking: null };
  }

  const quantityTracking = roundTo(base / trackingToBase);
  return { label: `${quantityTracking} ${trackingUnitLabel}`, inStock, quantityTracking };
}
