import { PrismaClient } from '@prisma/client';
import { ImportService } from '../src/import/import.service';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const dataDir = path.resolve(__dirname, '../../reference/spreadsheet');
  const importer = new ImportService(prisma as any);

  const tech = await prisma.user.upsert({
    where: { email: 'tech@example.com' },
    update: {},
    create: { email: 'tech@example.com', name: 'Tech One', role: 'TECHNICIAN' },
  });
  const manager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: { email: 'manager@example.com', name: 'Inventory Manager', role: 'INVENTORY_MANAGER' },
  });

  const summary = await importer.importProducts(dataDir);
  console.log({ tech, manager, importSummary: summary });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
