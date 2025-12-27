-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'INVENTORY_MANAGER', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "UnitBaseType" AS ENUM ('MASS', 'VOLUME', 'COUNT');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('initial_load', 'receiving_posted', 'checkout_requested', 'checkout_finalized', 'adjustment', 'audit_count', 'checkin_return', 'transfer');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('draft', 'posted');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('requested', 'approved', 'ready', 'issued');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "epaRegNo" TEXT,
    "description" TEXT,
    "category" TEXT,
    "baseType" "UnitBaseType" NOT NULL,
    "trackingUnitLabel" TEXT NOT NULL,
    "checkoutUnitLabel" TEXT NOT NULL,
    "orderingUnitLabel" TEXT NOT NULL,
    "trackingToBase" INTEGER NOT NULL,
    "checkoutToBase" INTEGER NOT NULL,
    "orderingToBase" INTEGER NOT NULL,
    "reorderLevelBase" INTEGER,
    "quantityInReorder" INTEGER,
    "leadTimeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPack" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantityPerPack" INTEGER NOT NULL,
    "orderingToBase" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCode" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packId" TEXT,
    "codeType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "productId" TEXT NOT NULL,
    "onHandBase" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "quantityBase" INTEGER NOT NULL,
    "beforeBase" INTEGER NOT NULL,
    "afterBase" INTEGER NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "device" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "incomingLineId" TEXT,
    "checkoutLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingReceipt" (
    "id" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "IncomingReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL,
    "backorderedQty" INTEGER NOT NULL,
    "receivingUnitLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutRequest" (
    "id" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'requested',
    "technicianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyById" TEXT,

    CONSTRAINT "CheckoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyRequested" INTEGER NOT NULL,
    "qtyIssued" INTEGER,
    "checkoutUnitLabel" TEXT NOT NULL,
    "totalBaseQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReasonCode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReasonCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReorderPolicy" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reorderLevelBase" INTEGER NOT NULL,
    "targetDaysOfSupply" INTEGER,
    "supplier" TEXT,
    "leadTimeDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReorderPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCode_payload_key" ON "ProductCode"("payload");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON "InventoryTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReorderPolicy_productId_key" ON "ReorderPolicy"("productId");

-- AddForeignKey
ALTER TABLE "ProductPack" ADD CONSTRAINT "ProductPack_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCode" ADD CONSTRAINT "ProductCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCode" ADD CONSTRAINT "ProductCode_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ProductPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_incomingLineId_fkey" FOREIGN KEY ("incomingLineId") REFERENCES "IncomingLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_checkoutLineId_fkey" FOREIGN KEY ("checkoutLineId") REFERENCES "CheckoutLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingReceipt" ADD CONSTRAINT "IncomingReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingLine" ADD CONSTRAINT "IncomingLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "IncomingReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingLine" ADD CONSTRAINT "IncomingLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutRequest" ADD CONSTRAINT "CheckoutRequest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutLine" ADD CONSTRAINT "CheckoutLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CheckoutRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutLine" ADD CONSTRAINT "CheckoutLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderPolicy" ADD CONSTRAINT "ReorderPolicy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
