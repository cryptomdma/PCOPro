-- Recreated migration to match DB history: 20260120105720_add_analytics_indexes
-- This migration was previously applied to the database but the folder was removed from the repo.
-- Re-adding it prevents Prisma migration divergence without resetting data.

CREATE INDEX IF NOT EXISTS "InventoryTransaction_productId_idx"
  ON "InventoryTransaction" ("productId");

CREATE INDEX IF NOT EXISTS "InventoryTransaction_scope_idx"
  ON "InventoryTransaction" ("scope");

CREATE INDEX IF NOT EXISTS "InventoryTransaction_type_createdAt_idx"
  ON "InventoryTransaction" ("type", "createdAt");
