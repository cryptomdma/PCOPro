-- Add par level tracking per product + location scope
CREATE TABLE "ParLevel" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "locationScope" TEXT NOT NULL DEFAULT 'WAREHOUSE',
  "parBase" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ParLevel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParLevel_productId_locationScope_key" ON "ParLevel"("productId", "locationScope");
CREATE INDEX "ParLevel_locationScope_idx" ON "ParLevel"("locationScope");

ALTER TABLE "ParLevel"
ADD CONSTRAINT "ParLevel_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
