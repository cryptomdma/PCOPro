# Testing Plan

## Automated
- **Unit tests (backend)**: service-level tests for unit conversion, ledger posting, idempotency enforcement, RBAC guards.
- **API tests**: supertest against Nest app covering receiving → post, checkout request → finalize, reorder suggestion computation.
- **Frontend tests**: component tests (Vitest/RTL) for mobile flows: request form, offline queue, QR decode handler.
- **Integration**: Prisma + Postgres test container; seed data per scenario.

## Manual
- Offline scenarios: enqueue checkout while offline, reconnect, verify ledger.
- QR scanning on mobile: simulate code detection and unknown code assignment.
- Reorder suggestions vs average usage and lead time.
- Print preview for QR labels (desktop).

## CI Hooks
- `npm run lint` in frontend and backend
- `npm test` for unit/API
- `prisma validate` for schema consistency
