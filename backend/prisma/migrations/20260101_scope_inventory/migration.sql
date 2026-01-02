-- Enable pgcrypto if not present for gen_random_uuid
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END $$;

-- New enums for product classification
CREATE TYPE "ProductCategory" AS ENUM ('CHEMICAL', 'EQUIPMENT', 'PPE', 'OTHER');
CREATE TYPE "ProductBehavior" AS ENUM ('CONSUMABLE', 'NONCONSUMABLE', 'REGULATED_CUSTOMER_BOUND');

-- Update Product category + add behavior
ALTER TABLE "Product" ADD COLUMN "behavior" "ProductBehavior" NOT NULL DEFAULT 'CONSUMABLE';
ALTER TABLE "Product"
  ALTER COLUMN "category" TYPE "ProductCategory" USING (
    CASE
      WHEN "category" IS NULL OR "category" = '' THEN 'CHEMICAL'
      WHEN lower("category") = 'chemical' THEN 'CHEMICAL'
      WHEN lower("category") = 'equipment' THEN 'EQUIPMENT'
      WHEN lower("category") = 'ppe' THEN 'PPE'
      ELSE 'OTHER'
    END::"ProductCategory"
  ),
  ALTER COLUMN "category" SET DEFAULT 'CHEMICAL',
  ALTER COLUMN "category" SET NOT NULL;

-- InventoryBalance becomes scoped (productId + scope) with separate PK
ALTER TABLE "InventoryBalance" DROP CONSTRAINT "InventoryBalance_pkey";
ALTER TABLE "InventoryBalance" ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "InventoryBalance" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'WAREHOUSE';
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "InventoryBalance_productId_scope_key" ON "InventoryBalance"("productId", "scope");

-- InventoryTransaction scope + transfer metadata
ALTER TABLE "InventoryTransaction" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'WAREHOUSE';
ALTER TABLE "InventoryTransaction" ADD COLUMN "transferGroupId" TEXT;
ALTER TABLE "InventoryTransaction" ADD COLUMN "transferIdempotencyKey" TEXT;
CREATE INDEX "InventoryTransaction_transferIdempotencyKey_idx" ON "InventoryTransaction"("transferIdempotencyKey");
