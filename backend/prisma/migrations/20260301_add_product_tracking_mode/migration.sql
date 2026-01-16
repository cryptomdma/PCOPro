-- Add tracking mode for distinguishing equipment vs bulk products
CREATE TYPE "ProductTrackingMode" AS ENUM ('EQUIPMENT', 'BULK');

ALTER TABLE "Product"
ADD COLUMN "trackingMode" "ProductTrackingMode" NOT NULL DEFAULT 'BULK';
