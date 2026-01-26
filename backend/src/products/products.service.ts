import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { Prisma, Role } from '@prisma/client';
import * as QRCode from 'qrcode';
import { parse } from 'csv-parse/sync';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  list(params: { search?: string; reorderOnly?: boolean; limit?: number; role?: Role }) {
    const where: Prisma.ProductWhereInput = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { epaRegNo: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 500) : 200;
    return this.prisma.product
      .findMany({
        where,
        include: { balances: { where: { scope: 'WAREHOUSE' } } },
        orderBy: { name: 'asc' },
        take: limit,
      })
      .then((products) => {
        const allowCost = params.role === 'ADMIN' || params.role === 'MANAGER';
        return products.map((p) => {
          const payload: any = { ...p, balances: p.balances[0] ?? null };
          if (!allowCost) {
            delete payload.defaultCostPerBase;
          }
          return payload;
        });
      });
  }

  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  async update(id: string, dto: UpdateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.sku !== undefined) {
        const normalized = dto.sku.trim();
        const skuValue = normalized === '' ? null : normalized;

        if (skuValue) {
          const existing = await tx.productCode.findUnique({ where: { payload: skuValue } });
          if (existing && existing.productId !== id) {
            throw new ConflictException('SKU already assigned to another product');
          }

          const existingSku = await tx.productCode.findFirst({
            where: { productId: id, codeType: 'sku' },
          });

          if (existingSku) {
            if (existingSku.payload !== skuValue) {
              await tx.productCode.update({
                where: { id: existingSku.id },
                data: { payload: skuValue },
              });
            }
          } else if (!existing) {
            await tx.productCode.create({
              data: { productId: id, payload: skuValue, codeType: 'sku' },
            });
          }
        } else {
          await tx.productCode.deleteMany({ where: { productId: id, codeType: 'sku' } });
        }
      }

      const costValue = dto.defaultCostPerBase === undefined ? undefined : dto.defaultCostPerBase;

      return tx.product.update({
        where: { id },
        data: {
          defaultCostPerBase: costValue,
          name: dto.name,
          epaRegNo: dto.epaRegNo,
          description: dto.description,
          category: dto.category,
          trackingMode: dto.trackingMode,
          productType: dto.productType,
          baseType: dto.baseType,
          trackingUnitLabel: dto.trackingUnitLabel,
          checkoutUnitLabel: dto.checkoutUnitLabel,
          orderingUnitLabel: dto.orderingUnitLabel,
          trackingToBase: dto.trackingToBase,
          checkoutToBase: dto.checkoutToBase,
          orderingToBase: dto.orderingToBase,
          reorderLevelBase: dto.reorderLevelBase,
          leadTimeDays: dto.leadTimeDays,
          behavior: dto.behavior,
        },
      });
    });
  }

  async detail(id: string, role?: Role) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        packs: true,
        codes: true,
        balances: { where: { scope: 'WAREHOUSE' } },
        reorderPolicy: true,
      },
    });
    if (!product) return null;
    const qrPayload = `MGPC:prod:${product.id}`;
    const qrSvg = await QRCode.toString(qrPayload, { type: 'svg' });
    const allowCost = role === 'ADMIN' || role === 'MANAGER';
    const payload: any = { ...product, balances: product.balances[0] ?? null, qrPayload, qrSvg };
    if (!allowCost) {
      delete payload.defaultCostPerBase;
    }
    return payload;
  }

  async importEpaCsv(buffer: Buffer) {
    // TODO: Align EPA import behavior with initial stock import policy when integrated.
    if (!buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }

    const raw = buffer.toString('utf-8');
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const failures: Array<{ rowIndex: number; identifier: string; reason: string }> = [];
    let updatedCount = 0;
    let skippedCount = 0;

    const normalizeValue = (value?: string) => {
      const normalized = (value ?? '').trim();
      if (!normalized || normalized.toUpperCase() === 'N/A') return null;
      return normalized;
    };

    const pickField = (row: Record<string, string>, keys: string[]) => {
      for (const key of keys) {
        const match = Object.keys(row).find((k) => k.trim().toLowerCase() === key.trim().toLowerCase());
        if (match) return String(row[match]).trim();
      }
      return '';
    };

    for (const [index, row] of rows.entries()) {
      const productId = pickField(row, ['productId', 'product_id', 'id']);
      const sku = pickField(row, ['sku']);
      const name = pickField(row, ['name', 'product', 'product_name', 'product name']);
      const epaValue = normalizeValue(pickField(row, ['epa', 'epa_reg_no', 'epa reg no', 'epa_reg']));

      let product: { id: string } | null = null;
      let identifier = '';

      try {
        if (productId) {
          product = await this.prisma.product.findUnique({ where: { id: productId } });
          identifier = `productId:${productId}`;
        } else if (sku) {
          const code = await this.prisma.productCode.findUnique({ where: { payload: sku } });
          if (code) {
            product = { id: code.productId };
          }
          identifier = `sku:${sku}`;
        } else if (name) {
          const matches = await this.prisma.product.findMany({
            where: { name: { equals: name.trim(), mode: 'insensitive' } },
            select: { id: true },
          });
          if (matches.length === 1) {
            product = matches[0];
          } else if (matches.length > 1) {
            failures.push({ rowIndex: index + 1, identifier: `name:${name}`, reason: 'Multiple products matched' });
            continue;
          }
          identifier = `name:${name}`;
        } else {
          failures.push({ rowIndex: index + 1, identifier: 'unknown', reason: 'Missing identifier' });
          continue;
        }

        if (!product) {
          failures.push({ rowIndex: index + 1, identifier, reason: 'Product not found' });
          continue;
        }

        await this.prisma.product.update({
          where: { id: product.id },
          data: { epaRegNo: epaValue },
        });
        updatedCount += 1;
      } catch (err) {
        failures.push({
          rowIndex: index + 1,
          identifier: identifier || 'unknown',
          reason: (err as Error).message || 'Update failed',
        });
      }
    }

    const failedCount = failures.length;
    const rowsRead = rows.length;
    skippedCount = rowsRead - updatedCount - failedCount;

    return { rowsRead, updatedCount, skippedCount, failedCount, failures };
  }
}
