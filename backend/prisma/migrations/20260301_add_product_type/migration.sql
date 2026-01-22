-- Add product type enum and optional field
CREATE TYPE "ProductType" AS ENUM (
  'DUST',
  'GRANULE',
  'CONCENTRATE',
  'AEROSOL',
  'ANT_BAIT',
  'ROACH_BAIT',
  'RODENT_BAIT',
  'SANITATION',
  'OTHER'
);

ALTER TABLE "Product"
ADD COLUMN "productType" "ProductType";
