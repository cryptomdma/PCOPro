-- Add audit session tables for bulk inventory audits
CREATE TYPE "AuditStatus" AS ENUM ('DRAFT', 'FINALIZED');
CREATE TYPE "AuditUnitBasis" AS ENUM ('CHECKOUT', 'TRACKING');

CREATE TABLE "AuditSession" (
  "id" TEXT NOT NULL,
  "locationScope" TEXT NOT NULL DEFAULT 'WAREHOUSE',
  "status" "AuditStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt" TIMESTAMP(3),

  CONSTRAINT "AuditSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLine" (
  "id" TEXT NOT NULL,
  "auditSessionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "countedQty" DECIMAL NOT NULL,
  "unitBasis" "AuditUnitBasis" NOT NULL,
  "desiredBase" DECIMAL NOT NULL,
  "deltaBase" DECIMAL NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditLine_auditSessionId_productId_key" ON "AuditLine"("auditSessionId", "productId");
CREATE INDEX "AuditLine_productId_idx" ON "AuditLine"("productId");
CREATE INDEX "AuditSession_status_idx" ON "AuditSession"("status");
CREATE INDEX "AuditSession_locationScope_idx" ON "AuditSession"("locationScope");

ALTER TABLE "AuditSession"
ADD CONSTRAINT "AuditSession_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLine"
ADD CONSTRAINT "AuditLine_auditSessionId_fkey"
FOREIGN KEY ("auditSessionId") REFERENCES "AuditSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLine"
ADD CONSTRAINT "AuditLine_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
