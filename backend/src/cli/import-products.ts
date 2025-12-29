import 'dotenv/config';
import { ImportService } from '../import/import.service';
import { PrismaService } from '../prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const importService = new ImportService(prisma);

  try {
    const summary = await importService.importProducts();
    console.log('Product import complete');
    console.log(
      `Products - created: ${summary.created}, updated: ${summary.updated}, unchanged: ${summary.unchanged}, skipped: ${summary.skipped}`,
    );
    console.log(`SKU codes - created: ${summary.skuCodesCreated}, skipped: ${summary.skuCodesSkipped}`);
    if (summary.warnings.length) {
      console.warn('Warnings:');
      for (const warning of summary.warnings) {
        console.warn(`- ${warning}`);
      }
    }
    if (summary.errors.length) {
      console.error('Errors:');
      for (const error of summary.errors) {
        console.error(`- ${error}`);
      }
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Import failed: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
