# Audit Count / True-Up

Audit counts reconcile a physical count with the ledger-derived `InventoryBalance` by posting an `audit_count` `InventoryTransaction`. All quantities ultimately post in base units (ounces, fluid_ounces, each).

## Endpoints
- `POST /api/v1/inventory/audit`
  - Body: `productId`, `countedQty` (number), `unit` (`tracking` | `checkout`), `reason` (required), `comment?`, `device?`
  - Idempotency: pass `Idempotency-Key` header; otherwise generated as `audit:<productId>:<isoTimestamp>`
  - Returns: `productId`, `beforeBase`, `countedBase`, `deltaBase`, `afterBase`, `transactionId`, flags `negativeAfter`, `deltaLarge`
  - Ledger steps (single transaction):
    1) Resolve multiplier from unit (`trackingToBase` or `checkoutToBase`)
    2) `countedBase = round(countedQty * multiplier)`
    3) Read/Create `InventoryBalance` (defaults to 0)
    4) `deltaBase = countedBase - currentBase`; `afterBase = currentBase + deltaBase`
    5) Create `InventoryTransaction` (`type = audit_count`, `quantityBase = deltaBase`, `beforeBase`, `afterBase`)
    6) Update `InventoryBalance.onHandBase = afterBase`
  - Notifications:
    - `inventory_negative` when `afterBase < 0`
    - `inventory_audit_large_delta` when `abs(deltaBase) >= max(0.25 * max(1, currentBase), 100)`
    - Sent to all `ADMIN` and `INVENTORY_MANAGER` users (non-blocking)

- `GET /api/v1/inventory/balances?search=&stockedOnly=&includeDiscontinued=`
  - Returns array of `{ productId, name, baseType, trackingUnitLabel, checkoutUnitLabel, trackingToBase, checkoutToBase, onHandBase, onHandTracking, isStocked, isDiscontinued }`
  - Defaults: excludes discontinued unless `includeDiscontinued=true`; `stockedOnly=true` narrows to stocked items.

## UI Workflow
1. Open **Audit Count** from the nav.
2. Search/select a product; current on-hand is shown in tracking units (and base).
3. Enter the counted quantity, pick unit (tracking or checkout), and provide a required reason (+ optional comment/device).
4. Submit. The result panel echoes before/count/delta/after in tracking and base units and surfaces negative or large-delta flags. Balances refresh inline without reloading the page.
