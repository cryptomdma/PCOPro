import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma, UnitBaseType, ProductCategory, ProductBehavior, ProductTrackingMode } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { toBaseQuantity } from '../utils/units';

export type AnnotatedProductRow = {
  name: string;
  productSku?: string;
  baseType: UnitBaseType;
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
  orderingUnitLabel: string;
  trackingToBase: number;
  checkoutToBase: number;
  orderingToBase: number;
  isStocked: boolean;
  isDiscontinued: boolean;
  initialCheckoutQty: number;
  sourceIndex: number;
  metadata?: { epaRegNo?: string; description?: string; category?: string; reorderLevelDisplay?: number };
};

export type ImportSummary = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  skuCodesCreated: number;
  skuCodesSkipped: number;
  warnings: string[];
  errors: string[];
};

export type InitialStockSummary = {
  created: number;
  rowsRead: number;
  rowsProcessed: number;
  rowsSkippedZero: number;
  skipped: number;
  idempotencyKeys: string[];
  warnings: string[];
  errors: string[];
};

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  async importProducts(baseDir?: string): Promise<ImportSummary> {
    const summary: ImportSummary = {
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      skuCodesCreated: 0,
      skuCodesSkipped: 0,
      warnings: [],
      errors: [],
    };

    const { rows, warnings, skipped } = this.loadAnnotatedRows(baseDir);
    summary.warnings.push(...warnings);
    summary.skipped += skipped;

    for (const row of rows) {
      try {
        const reorderLevelDisplay = row.metadata?.reorderLevelDisplay;
        const reorderLevelBase =
          reorderLevelDisplay != null ? Math.round(reorderLevelDisplay * row.trackingToBase) : undefined;

        const category = this.resolveCategory(row.metadata?.category);
        const desired = {
          name: row.name,
          baseType: row.baseType,
          trackingUnitLabel: row.trackingUnitLabel,
          checkoutUnitLabel: row.checkoutUnitLabel,
          orderingUnitLabel: row.orderingUnitLabel,
          trackingToBase: row.trackingToBase,
          checkoutToBase: row.checkoutToBase,
          orderingToBase: row.orderingToBase,
          isStocked: row.isStocked,
          isDiscontinued: row.isDiscontinued,
          epaRegNo: row.metadata?.epaRegNo ?? undefined,
          description: row.metadata?.description ?? undefined,
          category,
          behavior: this.resolveBehavior(row.metadata?.category),
          trackingMode: this.resolveTrackingMode(category),
          reorderLevelBase,
        };

        const existing = await this.prisma.product.findUnique({ where: { name: row.name } });
        let productId = existing?.id;

        if (!existing) {
          const created = await this.prisma.product.create({ data: desired });
          productId = created.id;
          summary.created += 1;
        } else {
          if (this.needsProductUpdate(existing, desired)) {
            await this.prisma.product.update({
              where: { id: existing.id },
              data: desired,
            });
            summary.updated += 1;
          } else {
            summary.unchanged += 1;
          }
        }

        if (productId && row.productSku) {
          const skuResult = await this.ensureSkuCode(productId, row.productSku.trim());
          summary.skuCodesCreated += skuResult.created;
          summary.skuCodesSkipped += skuResult.skipped;
          if (skuResult.warning) {
            summary.warnings.push(skuResult.warning);
          }
        }
      } catch (err) {
        summary.errors.push(`Failed to import ${row.name}: ${(err as Error).message}`);
      }
    }

    return summary;
  }

  loadAnnotatedRows(baseDir?: string): {
    rows: AnnotatedProductRow[];
    warnings: string[];
    skipped: number;
    rowsRead: number;
  } {
    const dataDir = this.resolveDataDir(baseDir);
    const unitsPath = path.join(dataDir, 'initial_units_annotated.csv');
    if (!fs.existsSync(unitsPath)) {
      throw new Error(`initial_units_annotated.csv not found in ${dataDir}`);
    }

    const unitsCsv = fs.readFileSync(unitsPath, 'utf-8');
    const parsed = this.parseAnnotatedUnitsCsv(unitsCsv);
    const unitRows = parsed.rows;

    const metadataMap = this.loadMetadataByName(dataDir);

    const warnings: string[] = [];
    warnings.push(...parsed.warnings);
    const rows: AnnotatedProductRow[] = [];
    let skipped = 0;

    for (const [index, row] of unitRows.entries()) {
      const name = this.pickField(row, ['product name', 'product_name', 'product', 'Product']);
      if (!name) {
        warnings.push('Skipped row with missing product name');
        skipped += 1;
        continue;
      }

      const baseTypeLabel = this.pickField(row, ['base_type', 'base type']).toUpperCase();
      const baseType = this.resolveBaseType(baseTypeLabel);
      if (!baseType) {
        warnings.push(`Unrecognized base_type for ${name}`);
        skipped += 1;
        continue;
      }

      const trackingToBase = this.parseInteger(this.pickField(row, ['tracking_to_base', 'tracking to base']));
      const checkoutToBase = this.parseInteger(this.pickField(row, ['checkout_to_base', 'checkout to base']));
      const orderingToBase = this.parseInteger(this.pickField(row, ['ordering_to_base', 'ordering to base']));
      if (!trackingToBase || !checkoutToBase || !orderingToBase) {
        warnings.push(`Missing conversion factor(s) for ${name}`);
        skipped += 1;
        continue;
      }

      const isStocked = this.parseYesNo(this.pickField(row, ['stock?']));
      const isDiscontinued = this.parseYesNo(this.pickField(row, ['discontinued?']));
      if (isStocked && isDiscontinued) {
        warnings.push(`Product ${name} marked as stocked and discontinued`);
      }

      rows.push({
        name,
        productSku: this.pickField(row, ['product_sku', 'sku']),
        baseType,
        trackingUnitLabel: this.pickField(row, ['tracking_unit_label', 'tracking unit label']),
        checkoutUnitLabel: this.pickField(row, ['checkout_unit_label', 'checkout unit label']),
        orderingUnitLabel: this.pickField(row, ['ordering_unit_label', 'ordering unit label']),
        trackingToBase,
        checkoutToBase,
        orderingToBase,
        isStocked,
        isDiscontinued,
        initialCheckoutQty: this.parseNumber(this.pickField(row, ['initial', 'initial ', 'initial_qty'])) ?? 0,
        sourceIndex: index,
        metadata: metadataMap.get(name),
      });
    }

    return { rows, warnings, skipped, rowsRead: parsed.rowsRead };
  }

  async importInitialStock(baseDir?: string, actorId?: string): Promise<InitialStockSummary> {
    const summary: InitialStockSummary = {
      created: 0,
      rowsRead: 0,
      rowsProcessed: 0,
      rowsSkippedZero: 0,
      skipped: 0,
      idempotencyKeys: [],
      warnings: [],
      errors: [],
    };

    const { rows, warnings, skipped, rowsRead } = this.loadAnnotatedRows(baseDir);
    summary.warnings.push(...warnings);
    summary.skipped += skipped;
    summary.rowsRead = rowsRead;

    const dataDir = this.resolveDataDir(baseDir);
    const sourceFile = path.basename(path.join(dataDir, 'initial_units_annotated.csv'));
    const idempotencySampleLimit = 10;

    for (const row of rows) {
      if (!row.initialCheckoutQty || row.initialCheckoutQty <= 0) {
        summary.rowsSkippedZero += 1;
        continue;
      }

      summary.rowsProcessed += 1;

      try {
        const product = await this.prisma.product.findUnique({ where: { name: row.name } });
        if (!product) {
          summary.warnings.push(`Initial stock skipped; product not found for ${row.name}`);
          summary.skipped += 1;
          continue;
        }

        const qtyBase = toBaseQuantity(row.initialCheckoutQty, row.trackingToBase);
        if (qtyBase <= 0) {
          summary.skipped += 1;
          continue;
        }

        const idempotencyKey = `initstock:${sourceFile}:${row.sourceIndex}:${product.id}:${row.initialCheckoutQty}`;
        if (summary.idempotencyKeys.length < idempotencySampleLimit) {
          summary.idempotencyKeys.push(idempotencyKey);
        }
        const existing = await this.prisma.inventoryTransaction.findUnique({ where: { idempotencyKey } });
        if (existing) {
          summary.skipped += 1;
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          const balance = await tx.inventoryBalance.upsert({
            where: { productId_scope: { productId: product.id, scope: 'WAREHOUSE' } },
            update: {},
            create: { productId: product.id, scope: 'WAREHOUSE' },
          });

          const afterBase = (balance.onHandBase ?? 0) + qtyBase;
          await tx.inventoryTransaction.create({
            data: {
              productId: product.id,
              scope: 'WAREHOUSE',
              type: 'receiving_posted',
              quantityBase: qtyBase,
              beforeBase: balance.onHandBase ?? 0,
              afterBase,
              actorId,
              actorRole: actorId ? undefined : 'ADMIN',
              reason: 'Initial stock import',
              idempotencyKey,
            },
          });

          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { onHandBase: afterBase },
          });
        });

        summary.created += 1;
      } catch (err) {
        summary.errors.push(`Initial stock failed for ${row.name}: ${(err as Error).message}`);
      }
    }

    return summary;
  }

  private resolveDataDir(preferred?: string): string {
    const candidates = [
      preferred,
      path.resolve(process.cwd(), 'reference', 'spreadsheet'),
      path.resolve(process.cwd(), '..', 'reference', 'spreadsheet'),
    ].filter(Boolean) as string[];
    const match = candidates.find((dir) => fs.existsSync(dir));
    return match ?? candidates[candidates.length - 1];
  }

  private loadMetadataByName(baseDir: string) {
    const metadataPath = path.join(baseDir, 'inventory_list.csv');
    const map = new Map<string, { epaRegNo?: string; description?: string; category?: string; reorderLevelDisplay?: number }>();
    if (!fs.existsSync(metadataPath)) return map;
    const csv = fs.readFileSync(metadataPath, 'utf-8');
    const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    for (const row of rows) {
      const name = this.pickField(row, ['product name', 'product_name', 'product', 'Product']);
      if (!name) continue;
      const reorderLevelDisplayRaw = this.pickField(row, ['reorder_level_display', 'reorder level display']);
      const parsedReorderLevel =
        reorderLevelDisplayRaw !== undefined && reorderLevelDisplayRaw !== '' ? Number(reorderLevelDisplayRaw) : undefined;
      const reorderLevelDisplay =
        parsedReorderLevel !== undefined && !Number.isNaN(parsedReorderLevel) ? parsedReorderLevel : undefined;
      map.set(name, {
        epaRegNo: this.pickField(row, ['epa_reg_no']),
        description: this.pickField(row, ['description']),
        category: this.pickField(row, ['category']),
        reorderLevelDisplay,
      });
    }
    return map;
  }

  private resolveBaseType(label: string): UnitBaseType | null {
    switch (label) {
      case 'MASS':
        return UnitBaseType.MASS;
      case 'VOLUME':
        return UnitBaseType.VOLUME;
      case 'COUNT':
        return UnitBaseType.COUNT;
      default:
        return null;
    }
  }

  private parseYesNo(value?: string): boolean {
    if (!value) return false;
    return value.trim().toLowerCase().startsWith('y');
  }

  private parseInteger(value?: string): number | null {
    if (value === undefined || value === null || value === '') return null;
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const num = Number(normalized);
    if (Number.isNaN(num)) return null;
    return Math.round(num);
  }

  private parseNumber(value?: string): number | null {
    if (value === undefined || value === null || value === '') return null;
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const num = Number(normalized);
    if (Number.isNaN(num)) return null;
    return num;
  }

  private pickField(row: Record<string, string>, keys: string[]): string {
    for (const key of keys) {
      const desired = this.normalizeHeaderKey(key);
      const match = Object.keys(row).find((k) => this.normalizeHeaderKey(k) === desired);
      if (match) {
        const value = row[match];
        if (value !== undefined && value !== null) {
          return String(value).trim();
        }
      }
    }
    return '';
  }

  private needsProductUpdate(
    existing: Record<string, unknown>,
    desired: Prisma.ProductUncheckedCreateInput,
  ) {
    const fields: (keyof Prisma.ProductUncheckedCreateInput)[] = [
      'baseType',
      'trackingUnitLabel',
      'checkoutUnitLabel',
      'orderingUnitLabel',
      'trackingToBase',
      'checkoutToBase',
      'orderingToBase',
      'isStocked',
      'isDiscontinued',
      'epaRegNo',
      'description',
      'category',
      'reorderLevelBase',
      'trackingMode',
    ];

    return fields.some((field) => {
      const nextRaw = (desired as any)[field];
      if (nextRaw === undefined) return false;
      const current = (existing as any)[field] ?? null;
      const next = nextRaw ?? null;
      return current !== next;
    });
  }

  private async ensureSkuCode(
    productId: string,
    productSku?: string,
  ): Promise<{ created: number; skipped: number; warning?: string }> {
    if (!productSku) return { created: 0, skipped: 0 };
    const payload = productSku.trim();
    if (!payload) return { created: 0, skipped: 0 };

    const existing = await this.prisma.productCode.findUnique({ where: { payload } });
    if (!existing) {
      await this.prisma.productCode.create({
        data: { productId, payload, codeType: 'sku' },
      });
      return { created: 1, skipped: 0 };
    }

    if (existing.productId === productId && existing.codeType === 'sku') {
      return { created: 0, skipped: 1 };
    }

    return { created: 0, skipped: 1, warning: `SKU ${payload} already assigned to a different record` };
  }

  private resolveCategory(label?: string): ProductCategory | undefined {
    if (!label) return undefined;
    const normalized = label.trim().toUpperCase();
    switch (normalized) {
      case 'CHEMICAL':
        return ProductCategory.CHEMICAL;
      case 'EQUIPMENT':
        return ProductCategory.EQUIPMENT;
      case 'PPE':
        return ProductCategory.PPE;
      case 'OTHER':
        return ProductCategory.OTHER;
      default:
        return undefined;
    }
  }

  private resolveBehavior(label?: string): ProductBehavior | undefined {
    if (!label) return undefined;
    const normalized = label.trim().toUpperCase();
    switch (normalized) {
      case 'NONCONSUMABLE':
        return ProductBehavior.NONCONSUMABLE;
      case 'REGULATED_CUSTOMER_BOUND':
        return ProductBehavior.REGULATED_CUSTOMER_BOUND;
      case 'CONSUMABLE':
      default:
        return ProductBehavior.CONSUMABLE;
    }
  }

  private resolveTrackingMode(category?: ProductCategory): ProductTrackingMode {
    if (category === ProductCategory.EQUIPMENT || category === ProductCategory.PPE) {
      return ProductTrackingMode.EQUIPMENT;
    }
    return ProductTrackingMode.BULK;
  }

  private parseAnnotatedUnitsCsv(unitsCsv: string): { rows: Record<string, string>[]; rowsRead: number; warnings: string[] } {
    const records = parse(unitsCsv, {
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];

    const warnings: string[] = [];
    const headerIndex = this.detectHeaderRow(records);
    const headerRowIndex = headerIndex === -1 ? 0 : headerIndex;
    if (headerIndex === -1) {
      warnings.push('Header row not detected; defaulted to first non-empty row');
    }

    const headers = (records[headerRowIndex] ?? []).map((cell) => this.normalizeHeaderKey(String(cell)));
    const rows: Record<string, string>[] = [];

    for (let idx = headerRowIndex + 1; idx < records.length; idx += 1) {
      const record = records[idx];
      if (this.isRowEmpty(record)) continue;
      const row: Record<string, string> = {};
      headers.forEach((header, colIndex) => {
        if (!header) return;
        const raw = record[colIndex];
        const value = raw === undefined || raw === null ? '' : String(raw).trim();
        if (row[header] === undefined || row[header] === '') {
          row[header] = value;
        }
      });
      rows.push(row);
    }

    return { rows, rowsRead: rows.length, warnings };
  }

  private detectHeaderRow(records: string[][]): number {
    const expected = new Set([
      'product',
      'product name',
      'product sku',
      'base type',
      'tracking to base',
      'checkout to base',
      'ordering to base',
      'tracking unit label',
      'checkout unit label',
      'ordering unit label',
      'initial',
      'stock?',
      'discontinued?',
    ]);

    for (let idx = 0; idx < records.length; idx += 1) {
      const normalized = records[idx].map((cell) => this.normalizeHeaderKey(String(cell)));
      const matchCount = normalized.filter((cell) => expected.has(cell)).length;
      const hasProduct = normalized.includes('product') || normalized.includes('product name');
      if (hasProduct && matchCount >= 3) {
        return idx;
      }
    }

    return -1;
  }

  private normalizeHeaderKey(value: string): string {
    return value
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private isRowEmpty(record: string[]): boolean {
    return record.every((cell) => !String(cell ?? '').trim());
  }
}
