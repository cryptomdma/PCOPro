import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to run setup:admin`);
  }
  return value;
}

function generatePassword(): string {
  return randomBytes(12).toString('base64url');
}

async function main() {
  requiredEnv('SETUP_ADMIN_TOKEN');

  const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (existingAdmin) {
    console.log('Admin already exists. No changes made.');
    return;
  }

  const email = process.env.SETUP_ADMIN_EMAIL || 'admin@local.dev';
  const rawPassword = process.env.SETUP_ADMIN_PASSWORD || generatePassword();
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  await prisma.user.create({
    data: {
      email,
      name: 'Admin',
      role: 'ADMIN',
      active: true,
      passwordHash,
    },
  });

  console.log(`Admin created: ${email}`);
  if (!process.env.SETUP_ADMIN_PASSWORD) {
    console.log(`Temporary password (store securely): ${rawPassword}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
