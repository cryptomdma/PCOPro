-- DropIndex
DROP INDEX "TransferRequest_createdAt_idx";

-- DropIndex
DROP INDEX "TransferRequest_status_idx";

-- DropIndex
DROP INDEX "TransferRequest_technicianId_idx";

-- AlterTable
ALTER TABLE "TransferRequest" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TransferRequestLine" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "InventoryTransaction_type_createdAt_idx" ON "InventoryTransaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_productId_idx" ON "InventoryTransaction"("productId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_scope_idx" ON "InventoryTransaction"("scope");
