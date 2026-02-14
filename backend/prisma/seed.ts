import { PrismaClient, UnitBaseType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const techProfile = await prisma.technician.upsert({
    where: { id: 'tech-1' },
    update: {},
    create: { id: 'tech-1', name: 'Tech One' },
  });
  const tech = await prisma.user.upsert({
    where: { email: 'tech@example.com' },
    update: {},
    create: {
      email: 'tech@example.com',
      name: 'Tech One',
      role: 'TECH',
      technicianId: techProfile.id,
      passwordHash: '$2b$10$KIX5J2QUp3NEEraPfYZ7qeFfm6.H/Ejz.gIhVQbK5EOi33ECszOe2', // "password"
    },
  });
  const manager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      email: 'manager@example.com',
      name: 'Inventory Manager',
      role: 'MANAGER',
      passwordHash: '$2b$10$KIX5J2QUp3NEEraPfYZ7qeFfm6.H/Ejz.gIhVQbK5EOi33ECszOe2',
    },
  });

  const suspend = await prisma.product.upsert({
    where: { name: 'Suspend SC' },
    update: {},
    create: {
      name: 'Suspend SC',
      epaRegNo: '',
      baseType: UnitBaseType.VOLUME,
      trackingUnitLabel: 'gal',
      checkoutUnitLabel: 'oz',
      orderingUnitLabel: 'case (12 x 18oz)',
      trackingToBase: 128,
      checkoutToBase: 1,
      orderingToBase: 18,
      reorderLevelBase: 1280,
      leadTimeDays: 7,
      description: 'Insecticide concentrate',
    },
  });

  await prisma.productCode.upsert({
    where: { payload: `MGPC:prod:${suspend.id}` },
    update: {},
    create: { productId: suspend.id, codeType: 'qr', payload: `MGPC:prod:${suspend.id}` },
  });

  await prisma.productPack.upsert({
    where: { id: 'pack-suspend' },
    update: {},
    create: {
      id: 'pack-suspend',
      productId: suspend.id,
      name: 'Case 12 x 18oz',
      quantityPerPack: 12,
      orderingToBase: 18,
    },
  });

  await prisma.incomingReceipt.create({
    data: {
      receiptDate: new Date(),
      status: 'posted',
      createdById: manager.id,
      lines: {
        create: [
          {
            productId: suspend.id,
            qtyOrdered: 2,
            qtyReceived: 2,
            backorderedQty: 0,
            receivingUnitLabel: 'case',
          },
        ],
      },
    },
  });

  console.log({ tech, manager, suspend });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
