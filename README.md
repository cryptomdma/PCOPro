# PCO Inventory PWA (MVP Scaffold)

This repo contains a mobile-first PWA and NestJS API replacing the Excel-based inventory workbook for pest control operators.

The cleaned spreadsheet exports in `/reference/spreadsheet/` are the **source of truth** for products, units, and lifecycle flags. Imports use the annotated unit file to normalize tracking/checkout/ordering conversions while keeping the ledger immutable.

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

### Import & SKU Philosophy
- Use `initial_units_annotated.csv` (plus `inventory_list.csv` metadata) as canonical inputs; imports are idempotent and enforce lifecycle rules.
- Ledger balances are never set directly by import; initial counts should flow through audit/receiving transactions.
- SKUs/barcodes/QRs are optional. If provided, they are stored as `ProductCode` records; internal Product IDs remain authoritative for all relations and generated QR payloads.

## Minimal Flows in the Scaffold
- **Products**: GET/POST `/api/v1/products`
- **Receiving → Post**: POST `/api/v1/incoming`
- **Request → Checkout**: POST `/api/v1/checkout/requests`, POST `/api/v1/checkout/:id/finalize`
- **Basic analytics preview**: `/api/v1/analytics/usage` placeholder returning empty array (extend in service)

## Offline-first
- Service worker (`frontend/public/sw.js`) caches shell assets.
- Offline queue indicator placeholder in UI; hook to IndexedDB to persist queued mutations.

## QR Codes
- QR payloads use `MGPC:prod:<productId>` format. Desktop UI surfaces QR previews per product.
