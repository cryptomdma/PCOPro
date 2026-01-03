-- Role enum migration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role_new') THEN
    CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'MANAGER', 'WAREHOUSE', 'TECH');
  END IF;
END$$;

ALTER TABLE "InventoryTransaction"
  ALTER COLUMN "actorRole" DROP DEFAULT,
  ALTER COLUMN "actorRole" TYPE "Role_new" USING (
    CASE
      WHEN "actorRole" = 'ADMIN' THEN 'ADMIN'::"Role_new"
      WHEN "actorRole" = 'INVENTORY_MANAGER' THEN 'MANAGER'::"Role_new"
      WHEN "actorRole" = 'TECHNICIAN' THEN 'TECH'::"Role_new"
      WHEN "actorRole" = 'WAREHOUSE' THEN 'WAREHOUSE'::"Role_new"
      ELSE NULL
    END
  );

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new" USING (
    CASE
      WHEN "role" = 'ADMIN' THEN 'ADMIN'::"Role_new"
      WHEN "role" = 'INVENTORY_MANAGER' THEN 'MANAGER'::"Role_new"
      WHEN "role" = 'TECHNICIAN' THEN 'TECH'::"Role_new"
      WHEN "role" = 'WAREHOUSE' THEN 'WAREHOUSE'::"Role_new"
      ELSE 'TECH'::"Role_new"
    END
  );

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- New enums
CREATE TYPE "TransferDirection" AS ENUM ('ISSUE', 'RETURN');
CREATE TYPE "TransferRequestStatus" AS ENUM ('OPEN', 'SUBMITTED', 'FINALIZED', 'ACK_PENDING', 'ACKNOWLEDGED', 'REJECTED', 'CANCELED', 'DISPUTED');

-- User fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "technicianId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
UPDATE "User" SET "passwordHash" = COALESCE("passwordHash", '$2b$10$KIX5J2QUp3NEEraPfYZ7qeFfm6.H/Ejz.gIhVQbK5EOi33ECszOe2');
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Transfer request tables
CREATE TABLE IF NOT EXISTS "TransferRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "direction" "TransferDirection" NOT NULL,
    "fromScope" TEXT NOT NULL,
    "toScope" TEXT NOT NULL,
    "status" "TransferRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByUserId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "disputeNote" TEXT,
    "requestIdempotencyKey" TEXT,
    CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TransferRequest_requestIdempotencyKey_key" UNIQUE ("requestIdempotencyKey"),
    CONSTRAINT "TransferRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransferRequest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransferRequest_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransferRequest_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransferRequestLine" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "transferRequestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitLabel" TEXT NOT NULL,
    CONSTRAINT "TransferRequestLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TransferRequestLine_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES "TransferRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransferRequestLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TransferRequest_status_idx" ON "TransferRequest"("status");
CREATE INDEX IF NOT EXISTS "TransferRequest_technicianId_idx" ON "TransferRequest"("technicianId");
CREATE INDEX IF NOT EXISTS "TransferRequest_createdAt_idx" ON "TransferRequest"("createdAt");
