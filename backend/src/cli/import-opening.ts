import 'dotenv/config';
import { TransactionType } from '@prisma/client';
import { ImportService } from '../import/import.service';
import { PrismaService } from '../prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const importService = new ImportService(prisma);

  const summary = {
    loaded: 0,
    skipped: 0,
    warnings: [] as string[],
    errors: [] as string[],
  };

  try {
    const loadResult = importService.loadAnnotatedRows();
    summary.warnings.push(...loadResult.warnings);
    summary.skipped += loadResult.skipped;

    for (const row of loadResult.rows) {
      if (row.initialCheckoutQty <= 0) continue;

      const product = await prisma.product.findUnique({ where: { name: row.name } });
      if (!product) {
        summary.errors.push(`No product found for ${row.name}; run import:products first?`);
        summary.skipped += 1;
        continue;
      }

      const idempotencyKey = `initload:${product.id}`;
      const initialBase = Math.round(row.initialCheckoutQty * row.checkoutToBase);

      try {
        const result = await prisma.$transaction(async (tx) => {
          const existingTx = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey } });
          if (existingTx) {
            return { status: 'skipped' as const };
          }

          await tx.$executeRaw`INSERT INTO "InventoryBalance" ("id", "productId", "scope", "onHandBase") VALUES (gen_random_uuid(), ${product.id}, 'WAREHOUSE', 0) ON CONFLICT ("productId", "scope") DO NOTHING`;
          const balances = await tx.$queryRaw<{ productId: string; onHandBase: number }[]>`
            SELECT "productId", "onHandBase" FROM "InventoryBalance"
            WHERE "productId" = ${product.id} AND "scope" = 'WAREHOUSE'
            FOR UPDATE
          `;
          const balance = balances[0] ?? { onHandBase: 0 };
          const quantityBase = initialBase - balance.onHandBase;

          await tx.inventoryTransaction.create({
            data: {
              productId: product.id,
              type: TransactionType.initial_load,
              quantityBase,
              beforeBase: balance.onHandBase,
              afterBase: initialBase,
              actorRole: 'ADMIN',
              reason: 'Opening inventory load',
              comment: 'Source: initial_units_annotated.csv (Initial in checkout units)',
              idempotencyKey,
            },
          });

          await tx.inventoryBalance.updateMany({
            where: { productId: product.id, scope: 'WAREHOUSE' },
            data: { onHandBase: initialBase },
          });

          return { status: 'loaded' as const };
        });

        if (result?.status === 'skipped') {
          summary.skipped += 1;
        } else {
          summary.loaded += 1;
        }
      } catch (err) {
        summary.errors.push(`Failed to load opening balance for ${row.name}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    summary.errors.push(`Opening import failed: ${(err as Error).message}`);
  } finally {
    await prisma.$disconnect();
  }

  console.log('Opening inventory import complete');
  console.log(`Transactions created: ${summary.loaded}, skipped: ${summary.skipped}`);
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
}

void main();
