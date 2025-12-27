# Product Requirements Document (Lean)

## Problem Statement
PCO technicians and managers currently rely on an Excel workbook for inventory tracking, unit conversions, and reorder decisions. The manual process is error-prone, inconsistent in units, and lacks auditability. We need a mobile-first, ledger-backed system that preserves the spreadsheet’s business rules while improving reliability, offline resilience, and scanning readiness.

## Users
- **Admin**: configures roles, notification settings, and technician self-checkout policy; manages discontinued products.
- **Inventory Manager**: owns receiving, approvals, adjustments/audits, reorder recommendations, and label printing.
- **Technician**: requests or self-checks out product (depending on policy), scans labels, and views issued history.

## Core Workflows
### Product Management
- Create/edit products sourced from `initial_units_annotated.csv` metadata with lifecycle flags.
- Manage unit multipliers per product (tracking/checkout/ordering) and ensure conversions remain data-driven.
- Optional SKU/barcode/QR codes stored as `ProductCode` records; internal Product ID remains authoritative.
- Mark products discontinued (hidden from ordering/receiving) or non-stock (no reorder suggestions).

### Receiving
- Create staged receipts (import or manual) mapped from `incoming.csv` structure.
- Post receipts to ledger as `receiving_posted` with idempotency protection.
- Handle back-orders as pending receipts; prevent posting to discontinued products.

### Checkout (Request → Approve → Issue)
- Technicians submit requests or self-checkout (if policy allows) using checkout units from CSV multipliers.
- Managers approve/fulfill; finalization creates `checkout_finalized` ledger entries.
- Totals displayed in tracking units for Excel parity; all math uses base units.

### Analytics
- Usage by date/tech/product/category; parity with spreadsheet pivots (UsageByMonth / UsageByProduct).
- Reorder insights using reorder level, stock flag, and usage trends.
- Export CSV and print-friendly reports.

## Non-Goals (MVP)
- AI reorder explanations or conversational analytics (stub only).
- Full offline conflict resolution UI (offline queue only).
- Mandatory SKU assignment; system must function without SKUs.
- Importing historical checkout/incoming logs as ledger history (reference only in MVP).

## SKU / Scanning Support
- Optional SKU/barcode/QR via `ProductCode` (types: sku, barcode, qr); payloads resolve directly to product when scanned.
- Unknown scans prompt admin to link/create; technician behavior follows role permissions.
- QR payload format: `MGPC:prod:<productId>` or `MGPC:pack:<packId>`; prefix configurable.

## Offline Philosophy
- Client queues mutations in IndexedDB with idempotency keys; server deduplicates.
- Reference data (products, units, codes) cached for offline lookup and scanning.
- UI surfaces sync status and retriable errors; no silent drops.

## Acceptance Criteria (MVP)
- Product list seeded from CSVs with lifecycle flags and unit multipliers reflected in API responses and UI labels.
- Receiving workflow posts staged receipts to ledger with correct base-unit conversion; blocks discontinued items.
- Checkout flow respects technician self-checkout policy and records `checkout_finalized` entries using checkout multipliers.
- Reorder suggestions use stock flag + reorder levels; discontinued items excluded.
- QR previews available on product detail; codes optional and not required for operations.
- Offline queue present for receiving/checkout mutations; sync indicator visible.
