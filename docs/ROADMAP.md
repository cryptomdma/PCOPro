# Roadmap

## Phase 0: Foundation (Complete)
- NestJS + Prisma API scaffold with ledger transaction types.
- React/Vite PWA shell with mobile-first flows for products, receiving, checkout, analytics preview.
- Docker Compose for API, DB, and web; seed data placeholders.

## Phase 1: Spreadsheet Parity MVP
- Import products/units/lifecycle from `/reference/spreadsheet/initial_units_annotated.csv` and display metadata from `inventory_list.csv`.
- Enforce lifecycle rules (stock/discontinued) in API responses and UI filters; flag invalid combinations during import.
- Receiving: staged receipts + `receiving_posted` ledger entries with data-driven conversions; back-order tracking.
- Checkout: request → approve → issue with checkout unit multipliers; totals in tracking units.
- Reorder: compute reorder flags from reorder level + stock flag + usage; exclude discontinued.
- Basic analytics matching UsageByMonth/UsageByProduct pivots.
- QR previews and printable labels (desktop admin) using internal product IDs.

**Estimated timeframe:** 3–4 weeks
**Dependencies:** Clean CSV imports, finalized unit multipliers, RBAC wiring.

## Phase 2: QR / Scanning
- Camera-based scanning (QR first, barcode optional) resolving to ProductCode payloads.
- Offline-capable scan resolution using cached ProductCode + product reference data.
- Unknown code workflow for admins to link/create products; technician behavior tied to role permissions.
- Bulk QR label generation and print flows.

**Estimated timeframe:** 2 weeks
**Dependencies:** ProductCode storage, Phase 1 product import completed.

## Phase 3: Offline Sync
- IndexedDB-backed offline queue for receiving/checkout/adjustments with idempotency keys.
- Background sync + retry UX, including per-item error surfacing.
- Reference data cache versioning to keep unit multipliers current while offline.
- Minimal conflict handling (last-write-wins + audit trail); no complex merge UI yet.

**Estimated timeframe:** 3 weeks
**Dependencies:** Stable API contracts; idempotency enforcement server-side.

## Phase 4: Voice + AI
- Speech-to-text shortcuts for checkout/receiving (“Request three gels”).
- AI-assisted reorder recommendations and analytics Q&A (feature-flagged).
- Explainability for AI outputs and human override path.

**Estimated timeframe:** 3–4 weeks (feature-flagged, iterative)
**Dependencies:** Robust analytics dataset from prior phases; opt-in feature flags.
