UPDATE "Product"
SET "epaRegNo" = ''
WHERE "epaRegNo" IS NULL;

ALTER TABLE "Product"
ALTER COLUMN "epaRegNo" SET NOT NULL;
