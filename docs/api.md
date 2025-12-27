# REST API (NestJS/Prisma)

Base path: `/api/v1`. Auth via JWT (access + refresh). All mutation endpoints require `Idempotency-Key` header.

## Auth
- `POST /auth/login` → {accessToken, refreshToken}
- `POST /auth/refresh` → refresh flow

## Reference Data
- `GET /products` (query: search, category, reorderOnly) → paginated list with on-hand (from balance), reorder flag.
- `POST /products` (Admin/Manager) → create product with unit metadata & reorder policy.
- `GET /products/:id` → product detail + packs + codes + QR payload string.
- `POST /products/:id/codes` → bind QR/barcode to product/pack.
- `GET /products/:id/qr.svg` → generated QR image (server-side SVG).

## Incoming (Incoming sheet)
- `POST /incoming` → create receipt (draft).
- `POST /incoming/:id/lines` → add/update lines `{productId, qtyOrdered, qtyReceived, backorderedQty, receivingUnit}`.
- `POST /incoming/:id/post` → posts draft; creates `receiving_posted` transactions per line, updates balances, emits notification.
- `GET /incoming` → list receipts with status filter.

## Checkout / Requests (Checkout sheet)
- `POST /checkout/requests` → technician request or self-checkout depending on setting.
- `POST /checkout/:id/approve` (Manager) → status `approved`.
- `POST /checkout/:id/ready` (Manager) → mark ready; notifies technician.
- `POST /checkout/:id/finalize` (Manager or Tech when allowed) → creates `checkout_finalized` transactions, updates balances, stores `totalBaseQuantity` derived from product metadata.
- `GET /checkout` → list by status/tech/date.

## Adjustments & Counts (Deviations)
- `POST /counts` → audit_count transaction with before/after captured and reason code.
- `POST /adjustments` → adjustment transaction (damage/shrinkage) requiring `reasonCodeId`.

## Analytics
- `GET /analytics/usage` (query: groupBy=date|week|month, productId?, technicianId?, category?) → aggregated usage over ledger.
- `GET /analytics/onhand` → on-hand by product with reorder flag.
- `GET /analytics/export.csv` → CSV snapshot matching UsageByMonth/Product pivot options.

## Notifications
- `GET /notifications` → inbox for current user.
- `POST /notifications/test-email` (Admin) → verify SMTP.

## Reorder
- `GET /reorder/suggestions` → computed using reorder level, average usage, lead time; returns suggested quantity + ordering unit.
- `POST /reorder/approvals` → manager approves and triggers email/webhook.

## Example Request/Response
```http
POST /api/v1/incoming
Authorization: Bearer <token>
Idempotency-Key: 5c8f1e
Content-Type: application/json

{
  "receiptDate": "2024-01-10",
  "supplier": "Acme",
  "lines": [
    { "productId": "prod_1", "qtyOrdered": 2, "qtyReceived": 2, "backorderedQty": 0, "receivingUnit": "case" }
  ]
}
```
Response 201:
```json
{
  "id": "rcpt_123",
  "status": "posted",
  "lines": [
    {
      "productId": "prod_1",
      "qtyReceived": 2,
      "baseQuantity": 2 * 12 * 18 * 1, // derived via product pack and conversion to base unit
      "transactionId": "txn_45"
    }
  ]
}
```
