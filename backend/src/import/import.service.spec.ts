import { describe, expect, it } from 'vitest';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma.service';
import path from 'path';

class FakePrismaService implements Partial<PrismaService> {
  private products = new Map<string, any>();
  product = {
    findUnique: async ({ where: { name } }: any) => this.products.get(name) ?? null,
    upsert: async ({ where: { name }, create, update }: any) => {
      const existing = this.products.get(name);
      const record = existing ? { ...existing, ...update } : { id: name, ...create };
      this.products.set(name, record);
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

    const secondPass = await service.importProducts(dataDir);
    expect(secondPass.updated).toBeGreaterThan(0);
    expect(secondPass.created).toBe(0);
    expect(secondPass.warnings.length).toBeGreaterThan(0);
  });
});
