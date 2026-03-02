-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('NONE', 'OPEN', 'MANAGER_RESPONDED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('MISSING_ITEM', 'WRONG_QTY', 'WRONG_PRODUCT', 'DAMAGED', 'OTHER');

-- AlterTable
ALTER TABLE "TransferRequest"
ADD COLUMN "disputeStatus" "DisputeStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "disputeReason" "DisputeReason",
ADD COLUMN "disputePhotoPath" TEXT,
ADD COLUMN "disputeOpenedAt" TIMESTAMP(3),
ADD COLUMN "disputeOpenedByUserId" TEXT,
ADD COLUMN "disputeResolutionNote" TEXT,
ADD COLUMN "disputeResolvedAt" TIMESTAMP(3),
ADD COLUMN "disputeResolvedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "TransferRequest_disputeStatus_idx" ON "TransferRequest"("disputeStatus");

-- AddForeignKey
ALTER TABLE "TransferRequest"
ADD CONSTRAINT "TransferRequest_disputeOpenedByUserId_fkey"
FOREIGN KEY ("disputeOpenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRequest"
ADD CONSTRAINT "TransferRequest_disputeResolvedByUserId_fkey"
FOREIGN KEY ("disputeResolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
