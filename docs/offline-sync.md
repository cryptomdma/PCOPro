# Offline Sync Architecture

## Principles
- Server is source of truth; client maintains IndexedDB caches and a reliable mutation queue.
- Every mutation carries an `idempotencyKey`, actor metadata, and offline-created timestamp.
- Conflicts resolved server-side using ledger rules; client reconciles via sync cursor.

## Client Layers
1. **Reference Cache**: products, packs, unit conversions, reason codes, settings, and recent transactions stored in IndexedDB. Populated on login and background refresh.
2. **Mutation Queue**: operations such as receipts, checkout requests, counts, adjustments. Each queued item holds payload, route, method, idempotency key, and createdAt. Queue persists across reloads.
3. **Sync Engine**: 
   - Detects connectivity; flushes queue in FIFO order with retries and exponential backoff.
   - Uses `/sync?cursor=<lastLedgerId>` endpoint to fetch new transactions/balances.
   - Applies optimistic UI updates while respecting ledger immutability (no on-device on-hand mutation except optimistic display tags).
4. **Error Handling**: server validation errors bubble to queue items; user can edit or discard failed entries. Unauthorized clears tokens.

## Server Endpoints for Sync
- `GET /sync` returns:
  - new `InventoryTransaction` rows since cursor,
  - current `InventoryBalance` snapshots touched,
  - updated reference data (products/codes updatedAt).
- `POST /queue` (internal) used by mobile to send bundled mutations when back online.

## Storage Keys (IndexedDB)
- `mgpc.products`, `mgpc.codes`, `mgpc.settings`, `mgpc.queue`, `mgpc.lastCursor`, `mgpc.notifications`, `mgpc.offlineDrafts` (incoming receipts).

## UI Indicators
- Sync badge shows: Online, Offline, Syncing, Attention (failed items).
- Per-action status chips on receipts/requests show whether locally queued or server-accepted.

## Security
- Queue items signed with access token; refresh flow renews tokens before flushing.
- No secrets stored unencrypted; tokens kept in secure storage (IndexedDB + HTTP-only cookies optional for refresh).
