# PCO Inventory PWA (MVP Scaffold)

This repo contains a mobile-first PWA and NestJS API replacing the Excel-based inventory workbook for pest control operators.

## Running with Docker Compose
```
docker-compose up --build
```
- API: http://localhost:3000/api/v1
- Web (Vite dev server): http://localhost:5173
- Postgres: localhost:5432 (pco/pco)

Seed data: `docker-compose run --rm backend npm run prisma:generate && docker-compose run --rm backend npx prisma migrate dev --name init && docker-compose run --rm backend npm run seed`

## Key Paths
- Docs: `docs/`
- API (NestJS): `backend/src`
- Prisma schema: `backend/prisma/schema.prisma`
- Web (React PWA): `frontend/src`

## Minimal Flows in the Scaffold
- **Products**: GET/POST `/api/v1/products`
- **Receiving**: POST `/api/v1/incoming`
- **Request/Finalize Checkout**: POST `/api/v1/checkout/requests`, POST `/api/v1/checkout/:id/finalize`
- **Audit Count / True-Up**: POST `/api/v1/inventory/audit`, balances via `/api/v1/inventory/balances` (default scope `WAREHOUSE`)
- **Scoped Transfers**: POST `/api/v1/inventory/transfer` to move stock between scopes (default from `WAREHOUSE` to `TRUCK:<technicianId>`) with idempotent paired transactions
- **Basic analytics preview**: `/api/v1/analytics/usage` placeholder returning empty array (extend in service)

## Offline-first
- Service worker (`frontend/public/sw.js`) caches shell assets.
- Offline queue indicator placeholder in UI; hook to IndexedDB to persist queued mutations.

## QR Codes
- QR payloads use `MGPC:prod:<productId>` format. Desktop UI surfaces QR previews per product.

## Audit Count (Physical true-up)
- UI: open **Audit Count** from the nav, search/select a product, enter counted quantity + unit + reason, submit to true-up balances. Results show before/count/delta/after in tracking + base units with flags for negative or large swings.
- API: `POST /api/v1/inventory/audit` with `productId`, `countedQty`, `unit` (`tracking` | `checkout`), `reason`, optional `comment`/`device`, optional `scope` (default `WAREHOUSE`). Optional `Idempotency-Key` header guards duplicate posts.
- Reference: `docs/audit-count.md` for the full flow and notification rules.
