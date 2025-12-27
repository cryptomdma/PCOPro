# Spreadsheet Mapping

This document records how the cleaned CSV exports in `/reference/spreadsheet/` map into the application. These files are the canonical source for product, unit, and lifecycle rules; no guesses or ad-hoc defaults should override what they express.

## Files

### `initial_units_annotated.csv`
Primary authoritative file containing normalized unit metadata and lifecycle flags per product.

Columns:
- **product name**: human-readable name from Excel; used to match supporting files.
- **base_type**: `MASS`, `VOLUME`, or `COUNT`; drives selection of base unit (`oz`, `fl_oz`, `each`).
- **tracking_unit_label**: display unit for inventory (e.g., `lb`, `gal`, `box`).
- **tracking_to_base**: integer multiplier from tracking unit to the canonical base unit.
- **checkout_unit_label**: display unit used when issuing product to technicians.
- **checkout_to_base**: integer multiplier from checkout unit to the canonical base unit.
- **ordering_unit_label**: purchasing unit label (often a pack or case).
- **ordering_to_base**: integer multiplier from ordering unit to the canonical base unit; supports pack sizes (e.g., case of 12x18oz).
- **stock? (y/n)**: whether the product is normally stocked and participates in reorder logic.
- **discontinued? (y/n)**: whether the product is retired; discontinued products are not orderable or receivable.

Lifecycle interpretation:
- `stock? = y` AND `discontinued? = n` → active stocked product (appears in reorder and on-hand views).
- `stock? = n` AND `discontinued? = n` → active non-stock product (available for checkout/usage reporting but excluded from reorder recs).
- `discontinued? = y` → inactive (hidden by default, not orderable or receivable, history remains visible).
- `stock? = y` AND `discontinued? = y` → **invalid combination**; import must flag as a data warning and block until resolved.

### `inventory_list.csv`
Reference for product display metadata.

Columns (observed from spreadsheet headers):
- Product name (joins to `initial_units_annotated.csv`)
- EPA Reg # (may be blank for equipment/consumables)
- Description / category
- Quantity in Stock (Excel’s visible balance; replaced by ledger-derived on-hand)
- Units (display units; superseded by normalized unit labels)
- Reorder Level / Quantity in Reorder (inputs for reorder logic)
- Flagged reorder items (Excel formula; now computed server-side based on thresholds)

### `checkout_log.csv`
Reference log for historical checkout behavior and “Total” computation in Excel.

Columns:
- Date
- Tech
- Product
- Qty (checkout unit quantity issued)
- Total (derived in Excel using per-product checkout → tracking unit conversion; replicated by data-driven conversions in-app)

### `incoming.csv`
Reference for receiving workflow and staged receipts.

Columns:
- Date
- Product
- Qty (quantity received into staging using ordering or tracking units per sheet convention)
- B/O (back-order indicator; represented as a staged receipt that is not yet posted)

## Unit System & Base Units
- Canonical storage uses **integer base units**:
  - MASS → ounce (`oz`)
  - VOLUME → fluid ounce (`fl_oz`)
  - COUNT → each (`each`)
- Multipliers from the CSV (`*_to_base`) convert display units to base units without rounding; conversions are **data-driven per product**, never name-based.
- Pack sizes (ordering units) are captured via the ordering multiplier; checkout and tracking conversions remain independent.

## Replacing Excel Behaviors
- **Carry-forward balances**: Excel showed running balances; the app derives on-hand via immutable ledger transactions instead of mutating cells.
- **“Total” column**: Calculated via per-product conversion factors stored in `initial_units_annotated.csv`; the backend computes totals uniformly for checkout and analytics.
- **Reorder flags**: Previously Excel formulas; now computed dynamically from `inventory_list.csv` thresholds + usage averages, respecting lifecycle flags.
- **Back-order handling**: Excel’s `B/O` column becomes staged receipts with explicit status; posting creates a ledger `receiving_posted` event.
- **Unit inconsistencies**: The CSV provides normalized unit labels and multipliers; the UI surfaces these consistently across receiving, checkout, and analytics.

## Mapping Summary
- **Products**: seeded from `initial_units_annotated.csv` + descriptive fields from `inventory_list.csv`.
- **Units**: all three unit roles (tracking, checkout, ordering) come from `initial_units_annotated.csv` multipliers and labels.
- **Lifecycle**: `stock?` and `discontinued?` control visibility, ordering eligibility, and reorder logic; invalid combos halt import.
- **Transactions**: historical rows in `checkout_log.csv` and `incoming.csv` are reference-only for workflow validation; they are **not** imported as ledger history in MVP.
