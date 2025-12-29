import { describe, expect, it } from 'vitest';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma.service';
import path from 'path';

class FakePrismaService implements Partial<PrismaService> {
  private products = new Map<string, any>();
  private codes = new Map<string, any>();

  product = {
    findUnique: async ({ where }: any) => {
      if (where?.name) return this.products.get(where.name) ?? null;
      if (where?.id) return Array.from(this.products.values()).find((p) => p.id === where.id) ?? null;
      return null;
    },
    create: async ({ data }: any) => {
      const record = { id: data.name, ...data };
      this.products.set(record.name, record);
      return record;
    },
    update: async ({ where, data }: any) => {
      const existing =
        (where?.name && this.products.get(where.name)) ??
        Array.from(this.products.values()).find((p) => p.id === where.id);
      const record = { ...existing, ...data };
      this.products.set(record.name, record);
      return record;
    },
  } as any;

  productCode = {
    findUnique: async ({ where: { payload } }: any) => this.codes.get(payload) ?? null,
    create: async ({ data }: any) => {
      const record = { id: data.payload, ...data };
      this.codes.set(record.payload, record);
      return record;
    },
  } as any;
}

describe('ImportService', () => {
  const dataDir = path.resolve(process.cwd(), '../reference/spreadsheet');

  it('imports products idempotently from annotated CSV', async () => {
    const prisma = new FakePrismaService() as any;
    const service = new ImportService(prisma);

    const firstPass = await service.importProducts(dataDir);
    expect(firstPass.created).toBeGreaterThan(0);
    expect(firstPass.updated).toBe(0);
    expect(firstPass.errors).toHaveLength(0);

    const secondPass = await service.importProducts(dataDir);
    expect(secondPass.created).toBe(0);
    expect(secondPass.updated).toBe(0);
    expect(secondPass.unchanged).toBeGreaterThan(0);
    expect(secondPass.errors).toHaveLength(0);
  });
});
