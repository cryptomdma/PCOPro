import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UnitBaseType } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
};

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  async importProducts(baseDir?: string): Promise<ImportSummary> {
    const dataDir = this.resolveDataDir(baseDir);
    const unitsPath = path.join(dataDir, 'initial_units_annotated.csv');
    if (!fs.existsSync(unitsPath)) {
      throw new Error(`initial_units_annotated.csv not found in ${dataDir}`);
    }
    const unitsCsv = fs.readFileSync(unitsPath, 'utf-8');
    const unitRows = parse(unitsCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const metadataMap = this.loadMetadataByName(dataDir);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const warnings: string[] = [];

    for (const row of unitRows) {
      const name = (row['product name'] || row['product_name'] || '').trim();
      if (!name) {
        warnings.push('Skipped row with missing product name');
        skipped += 1;
        continue;
      }

      const baseTypeLabel = (row.base_type || '').trim().toUpperCase();
      const baseType = this.resolveBaseType(baseTypeLabel);
      if (!baseType) {
        warnings.push(`Unrecognized base_type for ${name}`);
        skipped += 1;
        continue;
      }

      const trackingToBase = this.parseInteger(row['tracking_to_base'] ?? row.tracking_to_base);
      const checkoutToBase = this.parseInteger(row['checkout_to_base'] ?? row.checkout_to_base);
      const orderingToBase = this.parseInteger(row['ordering_to_base'] ?? row.ordering_to_base);
      if (!trackingToBase || !checkoutToBase || !orderingToBase) {
        warnings.push(`Missing conversion factor(s) for ${name}`);
        skipped += 1;
        continue;
      }

      const isStocked = this.parseYesNo(row['stock?']);
      const isDiscontinued = this.parseYesNo(row['discontinued?']);
      if (isStocked && isDiscontinued) {
        warnings.push(`Product ${name} marked as stocked and discontinued`);
      }

      const metadata = metadataMap.get(name);
      const reorderLevelDisplay = metadata?.reorderLevelDisplay ?? null;
      const reorderLevelBase = reorderLevelDisplay != null ? Math.round(reorderLevelDisplay * trackingToBase) : null;

      const existing = await this.prisma.product.findUnique({ where: { name } });

      await this.prisma.product.upsert({
        where: { name },
        create: {
          name,
          baseType,
          trackingUnitLabel: row.tracking_unit_label,
          checkoutUnitLabel: row.checkout_unit_label,
          orderingUnitLabel: row.ordering_unit_label,
          trackingToBase,
          checkoutToBase,
          orderingToBase,
          isStocked,
          isDiscontinued,
          epaRegNo: metadata?.epaRegNo,
          description: metadata?.description,
          category: metadata?.category,
          reorderLevelBase: reorderLevelBase ?? undefined,
        },
        update: {
          baseType,
          trackingUnitLabel: row.tracking_unit_label,
          checkoutUnitLabel: row.checkout_unit_label,
          orderingUnitLabel: row.ordering_unit_label,
          trackingToBase,
          checkoutToBase,
          orderingToBase,
          isStocked,
          isDiscontinued,
          epaRegNo: metadata?.epaRegNo,
          description: metadata?.description,
          category: metadata?.category,
          reorderLevelBase: reorderLevelBase ?? undefined,
        },
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    return { created, updated, skipped, warnings };
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
      const name = (row['product name'] || row['product_name'] || '').trim();
      if (!name) continue;
      const reorderLevelDisplayRaw = row.reorder_level_display ?? row['reorder_level_display'];
      const parsedReorderLevel = reorderLevelDisplayRaw !== undefined && reorderLevelDisplayRaw !== '' ? Number(reorderLevelDisplayRaw) : undefined;
      const reorderLevelDisplay = parsedReorderLevel !== undefined && !Number.isNaN(parsedReorderLevel) ? parsedReorderLevel : undefined;
      map.set(name, {
        epaRegNo: row.epa_reg_no,
        description: row.description,
        category: row.category,
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
    const num = Number(value);
    if (Number.isNaN(num)) return null;
    return Math.round(num);
  }
}
