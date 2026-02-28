-- Ordering module groundwork: suppliers, purchase orders, PO lines, receiving linkage.

CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PLACED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "PurchaseOrderType" AS ENUM ('EMAIL', 'API');

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "licenseNumber" TEXT,
  "ein" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "shipToScope" TEXT NOT NULL DEFAULT 'WAREHOUSE',
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "orderType" "PurchaseOrderType" NOT NULL DEFAULT 'EMAIL',
  "externalOrderRef" TEXT,
  "notes" TEXT,
  "placedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qtyOrdered" INTEGER NOT NULL,
  "qtyOrderedBase" INTEGER NOT NULL,
  "qtyReceived" INTEGER NOT NULL DEFAULT 0,
  "qtyReceivedBase" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IncomingReceipt"
ADD COLUMN "purchaseOrderId" TEXT;

CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX "PurchaseOrder_shipToScope_idx" ON "PurchaseOrder"("shipToScope");
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_productId_key" ON "PurchaseOrderLine"("purchaseOrderId", "productId");
CREATE INDEX "PurchaseOrderLine_productId_idx" ON "PurchaseOrderLine"("productId");
CREATE INDEX "IncomingReceipt_purchaseOrderId_idx" ON "IncomingReceipt"("purchaseOrderId");

ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderLine"
ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey"
FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderLine"
ADD CONSTRAINT "PurchaseOrderLine_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IncomingReceipt"
ADD CONSTRAINT "IncomingReceipt_purchaseOrderId_fkey"
FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
