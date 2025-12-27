# Import Plan

## Goals
- Use `/reference/spreadsheet/initial_units_annotated.csv` as the canonical source for products, units, and lifecycle flags.
- Enrich display metadata from `inventory_list.csv`.
- Preserve optional SKU/barcode/QR codes via `ProductCode` without requiring them for core operations.
- Keep imports idempotent and auditable without mutating balances directly.

## Process Overview
1. **Load canonical units file** (`initial_units_annotated.csv`).
   - Validate required columns exist and multipliers are positive integers.
   - Derive base unit from `base_type` (MASS→oz, VOLUME→fl_oz, COUNT→each).
2. **Validate lifecycle flags**.
   - Reject any row with `stock? = y` and `discontinued? = y` (data warning, skip until fixed).
   - Mark `discontinued? = y` products inactive; prevent receiving/order creation but keep readable.
3. **Merge display metadata** from `inventory_list.csv` using product name match.
   - Pull EPA number, description/category, reorder levels.
   - If missing match, log warning and import units/lifecycle only.
4. **Upsert products** using internal Product ID (Prisma cuid) as authority.
   - On re-run, match by product name (or future stable key) to avoid duplicates.
   - Update unit labels/multipliers and lifecycle flags if changed; log diffs.
5. **Seed `ProductCode` entries** (optional).
   - If a SKU/barcode/QR column is provided in future exports, upsert `ProductCode` with `codeType` (`sku`, `barcode`, `qr`) and `payload`.
   - No SKU present → system still fully functional; internal Product ID used in QR payloads.
6. **Do NOT import historical ledger rows** from `checkout_log.csv` or `incoming.csv` in MVP; use them only to validate workflow parity.
7. **Publish import report** with counts, warnings (missing matches, invalid lifecycle combos), and idempotency keys used.

## Idempotency Strategy
- Each import run uses a deterministic `batchId` (e.g., timestamped UUID) and per-row `idempotency_key = batchId + product_name`.
- Upsert operations are keyed on product name (or future external stable ID) plus batchId to ensure repeatable runs do not duplicate products or codes.
- Import log table records batchId, counts, warnings, and hash of input files for audit.

## Lifecycle Handling During Import
- **Active stocked** (`stock?=y`, `discontinued?=n`): enable reorder logic and receiving; surface in default listings.
- **Active non-stock** (`stock?=n`, `discontinued?=n`): exclude from reorder suggestions; allow checkout/usage tracking.
- **Discontinued** (`discontinued?=y`): keep history visible; hide from ordering/receiving; optionally allow read-only display in admin.
- **Invalid** (`stock?=y`, `discontinued?=y`): halt import for those rows and report immediately.

## Validation Rules
- Multipliers must be positive integers; zero/blank/negative fails validation.
- `base_type` must be one of `MASS`, `VOLUME`, `COUNT`.
- Unit labels are required for tracking/checkout/ordering; trim/normalize whitespace.
- Duplicate product names within a batch trigger warnings and require manual resolution.
- If reorder fields are missing from `inventory_list.csv`, default to no reorder threshold and log a warning (do not invent values).

## Error Handling
- Collect all row-level errors and warnings; proceed with valid rows unless a blocking error (schema mismatch, invalid lifecycle combo) occurs.
- Emit machine-readable report (JSON) plus human-readable summary.
- Do not mutate balances during import; initial quantities remain from seed/audit flows. If initial counts are re-imported later, record them as `audit_count` transactions rather than direct set.

## Optional SKU Handling
- If SKU provided, create/update `ProductCode` with `codeType=sku` and `payload=SKU value`.
- If barcode or QR payload provided, store accordingly; QR payloads should follow `MGPC:prod:<productId>` unless explicitly mapped otherwise.
- Absence of SKU/barcode/QR is acceptable; system relies on internal Product ID for relationships and QR generation.
