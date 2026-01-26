-- Add default cost per base unit
ALTER TABLE "Product"
ADD COLUMN "defaultCostPerBase" DECIMAL(12, 4);
