import 'dotenv/config';
import { TransactionType } from '@prisma/client';
import { ImportService } from '../import/import.service';
import { PrismaService } from '../prisma.service';

type Args = {
  reason?: string;
  dryRun: boolean;
};

type Summary = {
  productsSeen: number;
  applied: number;
  skippedZero: number;
  skippedMissingProduct: number;
  skippedMissingConversion: number;
  skippedAlreadyApplied: number;
  errorsCount: number;
  warnings: string[];
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = { dryRun: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (arg === '--reason') {
      result.reason = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--reason=')) {
      result.reason = arg.slice('--reason='.length);
      continue;
    }
  }

  return result;
}

async function main() {
  const { reason, dryRun } = parseArgs();
  if (!reason) {
    console.error('Missing required --reason "<text>"');
    process.exit(1);
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  const importService = new ImportService(prisma);

  const summary: Summary = {
    productsSeen: 0,
    applied: 0,
    skippedZero: 0,
    skippedMissingProduct: 0,
    skippedMissingConversion: 0,
    skippedAlreadyApplied: 0,
    errorsCount: 0,
    warnings: [],
  };

  try {
    const { rows, warnings } = importService.loadAnnotatedRows();
    summary.warnings.push(...warnings);

    for (const row of rows) {
      summary.productsSeen += 1;

      if (!row.checkoutToBase || Number.isNaN(row.checkoutToBase)) {
        summary.skippedMissingConversion += 1;
        summary.warnings.push(`Missing checkoutToBase for ${row.name}`);
        continue;
      }

      const initialCheckoutQty = row.initialCheckoutQty ?? 0;
      if (!initialCheckoutQty || initialCheckoutQty <= 0) {
        summary.skippedZero += 1;
        continue;
      }

      const product = await prisma.product.findUnique({ where: { name: row.name } });
      if (!product) {
        summary.skippedMissingProduct += 1;
        summary.warnings.push(`Product not found: ${row.name}`);
        continue;
      }

      const initialBase = Math.round(initialCheckoutQty * row.checkoutToBase);
      const idempotencyKey = `initload:${product.id}:v1`;

      try {
        if (dryRun) {
          const existingTx = await prisma.inventoryTransaction.findUnique({ where: { idempotencyKey } });
          if (existingTx) {
            summary.skippedAlreadyApplied += 1;
            continue;
          }
          summary.applied += 1;
          continue;
        }

        await prisma.$transaction(async (tx) => {
          const existingTx = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey } });
          if (existingTx) {
            summary.skippedAlreadyApplied += 1;
            return;
          }

          const balance = await tx.inventoryBalance.upsert({
            where: { productId: product.id },
            update: {},
            create: { productId: product.id, onHandBase: 0 },
          });

          const beforeBase = balance.onHandBase;
          const afterBase = beforeBase + initialBase;

          await tx.inventoryTransaction.create({
            data: {
              productId: product.id,
              type: TransactionType.initial_load,
              quantityBase: initialBase,
              beforeBase,
              afterBase,
              reason,
              idempotencyKey,
            },
          });

          await tx.inventoryBalance.update({
            where: { productId: product.id },
            data: { onHandBase: afterBase },
          });

          summary.applied += 1;
        });
      } catch (err) {
        summary.errorsCount += 1;
        summary.warnings.push(`Error applying ${row.name}: ${(err as Error).message}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('Opening inventory load summary:');
  console.log(
    `productsSeen=${summary.productsSeen}, applied=${summary.applied}, skippedZero=${summary.skippedZero}, skippedMissingProduct=${summary.skippedMissingProduct}, skippedMissingConversion=${summary.skippedMissingConversion}, skippedAlreadyApplied=${summary.skippedAlreadyApplied}, errorsCount=${summary.errorsCount}`,
  );

  if (summary.warnings.length) {
    console.warn('Warnings (showing up to 20):');
    summary.warnings.slice(0, 20).forEach((w) => console.warn(`- ${w}`));
    if (summary.warnings.length > 20) {
      console.warn(`...and ${summary.warnings.length - 20} more`);
    }
  }

  if (summary.errorsCount > 0) {
    process.exitCode = 1;
  }
}

void main();
