-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isDiscontinued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isStocked" BOOLEAN NOT NULL DEFAULT true;
