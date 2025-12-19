# Product Requirements (Mobile-first PCO Inventory)

## Goals
- Replace Excel workbook with a responsive PWA that mirrors sheet semantics while enforcing ledger-based inventory control.
- Fast technician and warehouse experiences on phones/tablets; desktop delivers admin, analytics, and printing.
- Offline-first operation with queued writes and cached reference data.

## User Roles & Permissions
- **Admin**: manage users, settings (including technician self-checkout toggle), products, packs, reorder policies, notifications, and global configuration.
- **Inventory Manager**: own day-to-day inventory (receiving, approvals, adjustments, cycle counts, QR assignment, analytics/report exports).
- **Technician**: checkout/request items, view status, submit cycle counts; may self-checkout if setting enabled.

## Feature Matrix (Mobile vs Desktop)
| Capability | Mobile (Tech/Warehouse) | Desktop (Manager/Admin) |
| --- | --- | --- |
| Login/JWT refresh | ✅ | ✅ |
| View inventory list (search/filters) | ✅ simplified cards, color-coded reorder | ✅ table, export, column chooser |
| Receiving (Incoming sheet) | ✅ staged receipt with scan/voice, post to inventory | ✅ same + edit lines, supplier info |
| Checkout / Requests | ✅ rapid add, scan, voice, sticky date; self-checkout gated | ✅ approve/deny, batch issue, override units |
| Cycle count quick mode | ✅ inline capture, scan-first | ✅ reconciliation with adjustment reason codes |
| QR/barcode scan | ✅ camera-based | ✅ webcam fallback |
| QR label print/generate | 🔲 view-only | ✅ preview, download PNG/SVG, bulk print |
| Analytics (UsageByMonth/Product) | 📊 quick recent usage | 📈 pivot, CSV, printable reports |
| Notifications | ✅ in-app + email events | ✅ inbox center, email config |
| Reorder recommendations | 🔲 view alerts | ✅ review/approve/send via email/webhook |
| Settings/Product master data | 🔲 | ✅ full CRUD, pack sizes, unit conversions, code assignment |

## Sheet-to-App Mapping
- **Inventory List** → `/inventory` view with reorder flag, on-hand, units, EPA Reg #, category, thresholds.
- **Incoming** → staged receipts (status: `draft`, `posted`). Posting creates `receiving_posted` transactions and updates `InventoryBalance` materialized table.
- **Checkout** → technician requests/issuances; `checkout_requested`/`checkout_finalized` transactions respecting self-checkout toggle.
- **UsageByMonth/Product** → analytics pivots over ledger (group by date granularity/product/tech/category).
- **Deviations** → adjustments + audit_count transactions with reason codes, surfaced in reports.
- **Lists** → reference data (categories, suppliers, locations, units, reason codes).
- **Initial&Units** → seed `InventoryTransaction` of type `initial_load` + normalized unit definitions per product.
- **ProductData** → master data + pack sizes + code assignments.

## Functional Workflows
### Receiving
1. Create receipt (date defaults to today, sticky per-user) → add lines via search/scan/voice.
2. Optional backorder quantity recorded on line.
3. Post receipt (online or queued offline). Posting creates ledger rows per line and recalculates on-hand.

### Checkout / Request
- If self-checkout enabled, technician issues directly (creates `checkout_finalized`).
- If disabled, technician creates request → manager reviews → marks Ready → final Checkout posts ledger.
- Unit conversions driven by product metadata (tracking vs checkout vs ordering units).

### Cycle Count & Adjustments
- Quick count on mobile: scan → enter counted quantity in tracking unit → creates `audit_count` transaction; delta reflected in ledger with before/after stored.
- Deviations or damage use `adjustment` with required reason code.

### QR/Barcode Scanning
- QR payload format: `MGPC:prod:<productId>` or `MGPC:pack:<packId>` (configurable prefix). Unknown codes can be bound to product by manager.
- Works in receiving, checkout/request, and cycle count. Prefills product + default checkout unit; user confirms before commit.

### Notifications
- Technician request → manager gets in-app + email.
- Order marked Ready → technician gets in-app notification.
- SMTP configurable; notification provider abstraction for future SMS/push.

### Offline Behavior
- IndexedDB stores: reference data (products, codes, packs, units), pending actions, last sync cursor.
- Mutations enqueue with idempotency key; background sync retries on connectivity. UI shows sync badge and per-action error states.

### Desktop-Only Capabilities
- Bulk QR label generation/printing, analytics pivoting, reorder approvals, user/role management, supplier + lead time management.

## Non-Functional
- Auditability: immutable ledger, idempotency on writes, request/response signatures logged with device metadata.
- Performance: fast mobile navigation, low-bandwidth payloads, pagination + search endpoints.
- Security: RBAC enforced server-side, JWT + refresh tokens, rate limiting, input validation, SMTP secrets in env vars.
