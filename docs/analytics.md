# Analytics Design

## Measures
- Quantity used (sum of checkout_finalized base units converted to tracking unit for display).
- Quantity received (receiving_posted).
- Adjustments (audit_count delta + adjustments).
- On-hand (from InventoryBalance snapshots).
- Days of supply: on-hand / average daily usage × lead time consideration.

## Dimensions
- Date (day/week/month), Technician, Product, Category, Location (future), Transaction type.

## Example Pivots
1. **UsageByMonth**: rows = months, columns = product category, values = sum(quantity used) and sum(received).
2. **UsageByProduct**: rows = product, columns = technician, values = sum(quantity used in checkout unit) with optional reorder flag.
3. **Deviations Report**: rows = reason code, columns = technician, values = sum(adjustment quantity) with comments.
4. **Days of Supply**: rows = product, values = on-hand in tracking unit, average daily usage, lead time, recommended reorder qty.

## Data Sources
- Ledger table `InventoryTransaction` is the single source; views/materialized views power fast reads:
  - `vw_usage_by_day` (derived from checkout_finalized).
  - `vw_receipts_by_day` (receiving_posted).
  - `vw_onhand` (current balances).

## Exports
- CSV export endpoint returns pivoted tables with metadata (units, date range).
- Printable reports use CSS print styles in desktop UI.
