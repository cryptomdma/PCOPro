# CSV Import Pipeline

The canonical, cleaned spreadsheet exports in `reference/spreadsheet/` drive product, unit, and lifecycle data. Imports are idempotent and safe to re-run for refreshed data.

## Files
- `initial_units_annotated.csv` (authoritative): product name, base_type (MASS|VOLUME|COUNT), tracking/checkout/ordering unit labels, *_to_base conversion multipliers, `stock?`, `discontinued?`.
- `inventory_list.csv` (enrichment): EPA number, description, category, reorder_level_display (in tracking units).
- `checkout_log.csv`, `incoming.csv`: workflow reference only; not imported as history.

## Rules
- Product name is the merge key (unique in the database).
- Base units: ounces (mass), fluid ounces (volume), each (count). Conversion multipliers in the CSV map display units to base units.
- Lifecycle:
  - `stock? = y` AND `discontinued? = n` → active stocked
  - `stock? = n` AND `discontinued? = n` → active non-stock
  - `discontinued? = y` → inactive (hidden by default, not orderable/receivable)
  - `stock? = y` AND `discontinued? = y` → imported but surfaced as warning
- Reorder level: `reorder_level_display * tracking_to_base` is stored as `reorderLevelBase`.

## How imports work
1. Service resolves data directory: `reference/spreadsheet/` (repo root) or an override path.
2. Parse `initial_units_annotated.csv` → normalize base types + conversion multipliers.
3. Merge optional enrichment from `inventory_list.csv` by product name.
4. Upsert `Product` records by `name` (idempotent): base type, unit labels, conversion multipliers, lifecycle flags, EPA/category/description, reorder level.
5. Emit summary: `{ created, updated, skipped, warnings }` for visibility and logging.

## Running the import
- API: `POST /api/v1/import/products`
- Seed: `npm run seed` uses the same import service for local dev.
- Custom path: provide a directory when calling the service programmatically (e.g., tests) to point at fixture CSVs.

## Validation & safety
- Missing product name or base_type → skipped with warning.
- Missing conversion factors → skipped with warning.
- `stock?` + `discontinued?` both true → imported but warning recorded.
- Products can function without SKU/barcode/QR; ProductCode records are optional and not required for import.
