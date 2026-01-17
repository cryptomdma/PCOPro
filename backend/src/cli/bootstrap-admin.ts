import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Admin bootstrap is disabled in production.');
  }

  const email = 'admin@local.dev';
  const password = 'Admin123!';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Admin',
      role: 'ADMIN',
      active: true,
      passwordHash,
    },
    create: {
      email,
      name: 'Admin',
      role: 'ADMIN',
      active: true,
      passwordHash,
    },
  });

  console.log(`Bootstrapped admin user: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
