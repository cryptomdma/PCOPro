# Inventory Rules

## Invariants
- On-hand balances are derived from the immutable **ledger**, never mutated directly.
- Every inventory-impacting action emits a transaction with actor, role, timestamp, reason, before/after quantities, and idempotency key.
- All quantity math uses integer base units (oz, fl_oz, each) to avoid rounding loss.
- Unit conversions are **per-product** based on CSV multipliers; no string or name-based heuristics.
- Lifecycle flags (`stock?`, `discontinued?`) gate visibility and ordering eligibility but do not erase history.

## Events That Change Inventory
- `receiving_posted`: moves staged receipts into stock (source: incoming workflow); increases on-hand.
- `checkout_finalized`: issues product to technicians (request → approve → issue); decreases on-hand.
- `checkin_return` (optional): returns unused product; increases on-hand.
- `adjustment`: damage/shrinkage corrections; may increase or decrease; requires reason.
- `audit_count`: cycle count reconciliation; computes delta between physical count and ledger on-hand.
- `transfer` (optional/future): moves quantity between locations; net-zero globally.

Each event records:
- Product ID (internal system ID)
- Quantity delta (base units)
- Pre/post on-hand (base units)
- Actor (user ID + role)
- Device/client info
- Reason/notes
- Idempotency key (prevents double-apply during retries/offline sync)

## Unit Conversion Rules
- **Base units**: MASS→`oz`, VOLUME→`fl_oz`, COUNT→`each`; stored as integers.
- **Tracking unit**: display unit for on-hand; uses `tracking_to_base` multiplier.
- **Checkout unit**: issue unit; uses `checkout_to_base` multiplier; checkout requests and totals convert through base units.
- **Ordering unit**: purchasing/pack size; uses `ordering_to_base` multiplier; receipts convert to base units before posting.
- Conversions always follow: `display_qty * multiplier = base_qty`. Reverse conversions for display divide by multiplier with remainder awareness.

## Rounding & Display
- Storage: integers in base units (no rounding).
- Display: prefer exact integers in display units when divisible; otherwise show decimal with precision sufficient to represent the remainder (e.g., base_qty / multiplier, up to 3 decimal places) and include the original base-unit remainder in tooltips/logs for auditability.
- Totals in checkout/use analytics are computed in **tracking units** for parity with Excel while still storing base-unit deltas.

## Ledger Guarantees
- Immutable append-only transaction log; corrections use new transactions (audit/adjustment), never edits.
- Derived balances are recalculated from the ledger and cached for performance; cache invalidated by new transactions.
- Every client write goes through server validation of lifecycle flags and unit multipliers.
- Offline queue entries carry idempotency keys; server deduplicates to avoid double posting.
- Discontinued products cannot receive `receiving_posted` transactions; checkout may be blocked or require override per admin policy.
