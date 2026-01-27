import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { Prisma, ProductCategory, ProductType, Role } from '@prisma/client';
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

  async bulkImportCsv(buffer: Buffer) {
    if (!buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }

    const raw = buffer.toString('utf-8');
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const failures: Array<{ rowIndex: number; identifier: string; field?: string; rawValue?: string; reason: string }> =
      [];
    const updatedIds: string[] = [];
    let updatedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;

    const normalizeKey = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase();
    const normalizeAlias = (value: string) => {
      const normalized = value
        .replace(/^\uFEFF/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return normalized
        .replace(/(ant|roach|rodent|termite|mosquito)bait/g, '$1 bait')
        .replace(/livetrap/g, 'live trap')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const getField = (row: Record<string, string>, keys: string[]) => {
      const rowKeys = Object.keys(row);
      for (const key of keys) {
        const match = rowKeys.find((k) => normalizeKey(k) === normalizeKey(key));
        if (match) {
          return { value: row[match], present: true };
        }
      }
      return { value: '', present: false };
    };

    const normalizeNullable = (value?: string, allowNA = false) => {
      const normalized = (value ?? '').trim();
      if (!normalized) return null;
      if (allowNA && normalized.toUpperCase() === 'N/A') return null;
      return normalized;
    };

    const parseDecimal = (value?: string) => {
      const normalized = (value ?? '').trim();
      if (!normalized || normalized.toUpperCase() === 'N/A') return null;
      const cleaned = normalized.replace(/,/g, '');
      const parsed = Number(cleaned);
      if (!Number.isFinite(parsed)) return undefined;
      return parsed;
    };

    const categoryAliases: Record<string, ProductCategory> = {
      chemical: ProductCategory.CHEMICAL,
      trap: ProductCategory.EQUIPMENT,
      equipment: ProductCategory.EQUIPMENT,
      ppe: ProductCategory.PPE,
      sanitation: ProductCategory.CHEMICAL,
      other: ProductCategory.OTHER,
      bait: ProductCategory.CHEMICAL,
      'ant bait': ProductCategory.CHEMICAL,
      'roach bait': ProductCategory.CHEMICAL,
      'rodent bait': ProductCategory.CHEMICAL,
      'termite bait': ProductCategory.CHEMICAL,
      'mosquito bait': ProductCategory.CHEMICAL,
    };

    const productTypeAliases: Record<string, ProductType> = {
      insecticide: ProductType.CONCENTRATE,
      termiticide: ProductType.CONCENTRATE,
      larvicide: ProductType.CONCENTRATE,
      igr: ProductType.CONCENTRATE,
      repellent: ProductType.CONCENTRATE,
      adjuvant: ProductType.CONCENTRATE,
      sanitizer: ProductType.SANITATION,
      sanitation: ProductType.SANITATION,
      'ant bait': ProductType.ANT_BAIT,
      'roach bait': ProductType.ROACH_BAIT,
      'rodent bait': ProductType.RODENT_BAIT,
      'termite bait': ProductType.OTHER,
      'mosquito bait': ProductType.OTHER,
      trap: ProductType.OTHER,
      equipment: ProductType.OTHER,
      ppe: ProductType.OTHER,
      'live trap': ProductType.OTHER,
      monitor: ProductType.OTHER,
      dust: ProductType.DUST,
      granule: ProductType.GRANULE,
      aerosol: ProductType.AEROSOL,
      concentrate: ProductType.CONCENTRATE,
      other: ProductType.OTHER,
    };

    const mapCategoryAlias = (value: string) => categoryAliases[normalizeAlias(value)] ?? null;
    const mapProductTypeAlias = (value: string) => productTypeAliases[normalizeAlias(value)] ?? null;

    const seenSkus = new Map<string, string>();

    for (const [index, row] of rows.entries()) {
      const rowIndex = index + 1;
      const productIdField = getField(row, ['productId', 'product_id', 'id']);
      const skuField = getField(row, ['sku']);
      const nameField = getField(row, ['name', 'product', 'product_name', 'product name']);

      const productId = productIdField.present ? normalizeNullable(productIdField.value) : null;
      const skuIdentifier = skuField.present ? normalizeNullable(skuField.value) : null;
      const nameIdentifier = nameField.present ? normalizeNullable(nameField.value) : null;

      let product: { id: string } | null = null;
      let identifier = '';

      let skuRawValue: string | undefined;
      try {
        if (productId) {
          product = await this.prisma.product.findUnique({ where: { id: productId } });
          identifier = `productId:${productId}`;
        } else if (skuIdentifier) {
          const code = await this.prisma.productCode.findFirst({
            where: { payload: skuIdentifier, codeType: 'sku' },
            select: { productId: true },
          });
          if (code) {
            product = { id: code.productId };
          }
          identifier = `sku:${skuIdentifier}`;
        } else if (nameIdentifier) {
          const matches = await this.prisma.product.findMany({
            where: { name: { equals: nameIdentifier.trim(), mode: 'insensitive' } },
            select: { id: true },
          });
          if (matches.length === 1) {
            product = matches[0];
          } else if (matches.length > 1) {
            failures.push({
              rowIndex,
              identifier: `name:${nameIdentifier}`,
              reason: 'Multiple products matched',
            });
            continue;
          }
          identifier = `name:${nameIdentifier}`;
        } else {
          failures.push({ rowIndex, identifier: 'unknown', reason: 'Missing identifier' });
          continue;
        }

        if (!product) {
          failures.push({ rowIndex, identifier, reason: 'Product not found' });
          continue;
        }

        const productIdResolved = product.id;

        const updateData: Prisma.ProductUpdateInput = {};

        const epaField = getField(row, ['epa', 'epa_reg_no', 'epa reg no', 'epa_reg']);
        if (epaField.present) {
          updateData.epaRegNo = normalizeNullable(epaField.value, true);
        }

        const costField = getField(row, ['defaultCostPerBase', 'default_cost_per_base', 'default_cost', 'cost_per_base']);
        if (costField.present) {
          const parsed = parseDecimal(costField.value);
          if (parsed === undefined) {
            failures.push({
              rowIndex,
              identifier,
              field: 'defaultCostPerBase',
              rawValue: costField.value,
              reason: 'Invalid defaultCostPerBase',
            });
            continue;
          }
          updateData.defaultCostPerBase = parsed === null ? null : new Prisma.Decimal(parsed);
        }

        const nameUpdate = getField(row, ['name', 'product_name', 'product name']);
        if (nameUpdate.present) {
          const normalizedName = (nameUpdate.value ?? '').trim();
          if (normalizedName) {
            updateData.name = normalizedName;
          }
        }

        const categoryField = getField(row, ['category', 'productCategory', 'product_category']);
        if (categoryField.present) {
          const normalized = (categoryField.value ?? '').trim();
          if (normalized) {
            const mapped = mapCategoryAlias(normalized);
            if (!mapped) {
              failures.push({
                rowIndex,
                identifier,
                field: 'category',
                rawValue: categoryField.value,
                reason: `Unmapped category value: ${categoryField.value}`,
              });
              continue;
            }
            updateData.category = mapped;
          }
        }

        const typeField = getField(row, ['productType', 'product_type', 'type']);
        if (typeField.present) {
          const normalized = (typeField.value ?? '').trim();
          if (!normalized) {
            updateData.productType = null;
          } else {
            const mapped = mapProductTypeAlias(normalized);
            if (!mapped) {
              failures.push({
                rowIndex,
                identifier,
                field: 'productType',
                rawValue: typeField.value,
                reason: `Unmapped productType value: ${typeField.value}`,
              });
              continue;
            }
            updateData.productType = mapped;
          }
        }

        const skuUpdateField = getField(row, ['sku']);
        const hasSkuUpdate = skuUpdateField.present;
        const skuValue = hasSkuUpdate ? normalizeNullable(skuUpdateField.value, true) : null;
        skuRawValue = hasSkuUpdate ? skuUpdateField.value : undefined;

        if (!Object.keys(updateData).length && !hasSkuUpdate) {
          skippedCount += 1;
          continue;
        }

        if (hasSkuUpdate && skuValue) {
          const seenProductId = seenSkus.get(skuValue);
          if (seenProductId && seenProductId !== productIdResolved) {
            failures.push({
              rowIndex,
              identifier,
              field: 'sku',
              rawValue: skuUpdateField.value,
              reason: 'SKU already assigned to another product',
            });
            conflictCount += 1;
            continue;
          }
        }

        await this.prisma.$transaction(async (tx) => {
          if (hasSkuUpdate) {
            if (!skuValue) {
              await tx.productCode.deleteMany({ where: { productId: productIdResolved, codeType: 'sku' } });
            } else {
              const existing = await tx.productCode.findFirst({
                where: { payload: skuValue, codeType: 'sku' },
                select: { productId: true, id: true, payload: true },
              });
              if (existing && existing.productId !== productIdResolved) {
                throw new ConflictException('SKU already assigned to another product');
              }
              const currentSku = await tx.productCode.findFirst({
                where: { productId: productIdResolved, codeType: 'sku' },
                select: { id: true, payload: true },
              });
              if (currentSku) {
                if (currentSku.payload !== skuValue) {
                  await tx.productCode.update({ where: { id: currentSku.id }, data: { payload: skuValue } });
                }
              } else {
                await tx.productCode.create({ data: { productId: productIdResolved, payload: skuValue, codeType: 'sku' } });
              }
            }
          }

          if (Object.keys(updateData).length) {
            await tx.product.update({ where: { id: productIdResolved }, data: updateData });
          }
        });

        if (hasSkuUpdate && skuValue) {
          seenSkus.set(skuValue, productIdResolved);
        }

        updatedCount += 1;
        if (updatedIds.length < 5) {
          updatedIds.push(productIdResolved);
        }
      } catch (err: any) {
        const reason = err?.message || 'Update failed';
        if (reason.includes('SKU already assigned')) {
          conflictCount += 1;
          failures.push({
            rowIndex,
            identifier: identifier || 'unknown',
            field: 'sku',
            rawValue: skuRawValue,
            reason,
          });
          continue;
        }
        failures.push({ rowIndex, identifier: identifier || 'unknown', reason });
      }
    }

    const failedCount = failures.length;
    const rowsRead = rows.length;
    skippedCount = rowsRead - updatedCount - failedCount;
    const summary = {
      rowsRead,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
      updatedCount,
      skippedCount,
      failedCount,
      updatedSample: updatedIds,
      failures,
    };

    if (conflictCount > 0) {
      throw new ConflictException(summary);
    }

    return summary;
  }
}
