import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import {
  Prisma,
  ProductBehavior,
  ProductCategory,
  ProductTrackingMode,
  ProductType,
  Role,
  TransactionType,
  UnitBaseType,
} from '@prisma/client';
import * as QRCode from 'qrcode';
import { parse } from 'csv-parse/sync';
import { toBaseQuantity } from '../utils/units';
import { computeDelta, toCountedBase } from '../inventory/audit-helpers';

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

  async create(dto: CreateProductDto, actor?: { userId: string; role: Role }) {
    const name = dto.name.trim();
    const epaRegNo = dto.epaRegNo.trim();
    const trackingUnitLabel = dto.trackingUnitLabel.trim();
    const checkoutUnitLabel = dto.checkoutUnitLabel.trim();
    const orderingUnitLabel = dto.orderingUnitLabel.trim();
    const hasInitialOnHand = dto.initialOnHand !== undefined && dto.initialOnHand !== null;
    const initialScopeId = dto.initialScopeId?.trim();

    if (!name) {
      throw new BadRequestException('Product name is required');
    }
    if (!epaRegNo) {
      throw new BadRequestException('EPA Reg # is required');
    }
    if (!trackingUnitLabel || !checkoutUnitLabel || !orderingUnitLabel) {
      throw new BadRequestException('All unit labels are required');
    }
    if (hasInitialOnHand && !initialScopeId) {
      throw new BadRequestException('Scope/Location is required when Initial On-Hand is provided');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            name,
            epaRegNo,
            description: dto.description?.trim() || undefined,
            category: dto.category,
            trackingMode: dto.trackingMode,
            productType: dto.productType,
            baseType: dto.baseType,
            trackingUnitLabel,
            checkoutUnitLabel,
            orderingUnitLabel,
            trackingToBase: dto.trackingToBase,
            checkoutToBase: dto.checkoutToBase,
            orderingToBase: dto.orderingToBase,
            reorderLevelBase: dto.reorderLevelBase,
            leadTimeDays: dto.leadTimeDays,
            behavior: dto.behavior,
          },
        });

        if (!hasInitialOnHand) {
          return created;
        }

        const scope = this.normalizeScope(initialScopeId!);
        const countedBase = toCountedBase(dto.initialOnHand!, created.trackingToBase);
        const balance = await tx.inventoryBalance.upsert({
          where: { productId_scope: { productId: created.id, scope } },
          update: {},
          create: { productId: created.id, scope, onHandBase: 0 },
        });
        const currentBase = balance.onHandBase ?? 0;
        const { deltaBase, afterBase } = computeDelta(currentBase, countedBase);
        const idempotencyKey = `initial_on_hand:${created.id}:${scope}:${countedBase}`;
        const existingTx = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey } });

        if (!existingTx && deltaBase !== 0) {
          await tx.inventoryTransaction.create({
            data: {
              productId: created.id,
              scope,
              type: TransactionType.adjustment,
              quantityBase: deltaBase,
              beforeBase: currentBase,
              afterBase,
              actorId: actor?.userId,
              actorRole: actor?.role,
              reason: 'INITIAL_ON_HAND',
              idempotencyKey,
            },
          });

          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { onHandBase: afterBase },
          });
        }

        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = err.meta?.target;
        const isNameConflict =
          (Array.isArray(target) && target.includes('name')) || (typeof target === 'string' && target.includes('name'));
        if (isNameConflict) {
          throw new ConflictException('Product name already exists');
        }
        throw new ConflictException('Create failed due to duplicate data');
      }
      throw err;
    }
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
          data: { epaRegNo: epaValue ?? '' },
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

  async bulkImportCsv(
    buffer: Buffer,
    options?: { mode?: 'upsert' | 'initial_load'; dryRun?: boolean; allowExistingInitialQty?: boolean },
  ) {
    if (!buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }
    const mode = options?.mode === 'initial_load' ? 'initial_load' : 'upsert';
    const dryRun = options?.dryRun ?? false;
    const allowExistingInitialQty = options?.allowExistingInitialQty ?? false;

    const raw = buffer.toString('utf-8');
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const failures: Array<{ rowIndex: number; identifier: string; field?: string; rawValue?: string; reason: string }> = [];
    const unmappedCounts = {
      category: new Map<string, number>(),
      productType: new Map<string, number>(),
    };
    const updatedIds: string[] = [];
    const createdIds: string[] = [];
    const idempotencyKeys: string[] = [];
    let updatedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;
    let initialPostedCount = 0;
    let initialSkippedCount = 0;

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
    const parseBoolean = (value?: string) => {
      if (value === undefined || value === null) return null;
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) return null;
      if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
      return null;
    };
    const normalizeBaseType = (value?: string) => {
      const normalized = (value ?? '').trim().toUpperCase();
      switch (normalized) {
        case 'MASS':
          return UnitBaseType.MASS;
        case 'VOLUME':
          return UnitBaseType.VOLUME;
        case 'COUNT':
          return UnitBaseType.COUNT;
        default:
          return null;
      }
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
      physical: ProductCategory.OTHER,
      exclusion: ProductCategory.OTHER,
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
      'non repellent': ProductType.CONCENTRATE,
      'non-repellent': ProductType.CONCENTRATE,
      igr: ProductType.CONCENTRATE,
      repellent: ProductType.CONCENTRATE,
      surfactant: ProductType.CONCENTRATE,
      adjuvant: ProductType.CONCENTRATE,
      sanitizer: ProductType.SANITATION,
      sanitation: ProductType.SANITATION,
      'ant bait': ProductType.ANT_BAIT,
      'ant bait stations': ProductType.ANT_BAIT,
      'roach bait': ProductType.ROACH_BAIT,
      'rodent bait': ProductType.RODENT_BAIT,
      'termite bait': ProductType.OTHER,
      'mosquito bait': ProductType.OTHER,
      'fly bait': ProductType.OTHER,
      trap: ProductType.OTHER,
      equipment: ProductType.OTHER,
      ppe: ProductType.OTHER,
      'live trap': ProductType.OTHER,
      monitor: ProductType.OTHER,
      'wettable powder': ProductType.DUST,
      dust: ProductType.DUST,
      granule: ProductType.GRANULE,
      aerosol: ProductType.AEROSOL,
      'wasp spray': ProductType.AEROSOL,
      concentrate: ProductType.CONCENTRATE,
      other: ProductType.OTHER,
    };

    const mapCategoryAlias = (value: string) => categoryAliases[normalizeAlias(value)] ?? null;
    const mapProductTypeAlias = (value: string) => productTypeAliases[normalizeAlias(value)] ?? null;
    const recordUnmapped = (map: Map<string, number>, value: string) => {
      const key = (value ?? '').trim();
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + 1);
    };

    const seenSkus = new Map<string, string>();

    for (const [index, row] of rows.entries()) {
      const rowIndex = index + 1;
      const productIdField = getField(row, ['productId', 'product_id', 'id']);
      const skuField = getField(row, ['sku']);
      const nameField = getField(row, ['name', 'product', 'product_name', 'product name']);

      const productId = productIdField.present ? normalizeNullable(productIdField.value) : null;
      const skuIdentifier = skuField.present ? normalizeNullable(skuField.value) : null;
      const nameIdentifier = nameField.present ? normalizeNullable(nameField.value) : null;

      let product: { id: string; trackingToBase: number; checkoutToBase: number; orderingToBase: number } | null = null;
      let identifier = '';

      let skuRawValue: string | undefined;
      try {
        if (productId) {
          product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: { id: true, trackingToBase: true, checkoutToBase: true, orderingToBase: true },
          });
          identifier = `productId:${productId}`;
        } else if (skuIdentifier) {
          const code = await this.prisma.productCode.findFirst({
            where: { payload: skuIdentifier, codeType: 'sku' },
            select: { productId: true },
          });
          if (code) {
            product = await this.prisma.product.findUnique({
              where: { id: code.productId },
              select: { id: true, trackingToBase: true, checkoutToBase: true, orderingToBase: true },
            });
          }
          identifier = `sku:${skuIdentifier}`;
        } else if (nameIdentifier) {
          const matches = await this.prisma.product.findMany({
            where: { name: { equals: nameIdentifier.trim(), mode: 'insensitive' } },
            select: { id: true, trackingToBase: true, checkoutToBase: true, orderingToBase: true },
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

        const updateData: Prisma.ProductUpdateInput = {};

        const epaField = getField(row, ['epa', 'epa_reg_no', 'epa reg no', 'epa_reg']);
        if (epaField.present) {
          updateData.epaRegNo = normalizeNullable(epaField.value, true) ?? '';
        }

        const costField = getField(row, ['defaultCostPerBase', 'default_cost_per_base', 'default_cost', 'cost_per_base']);
        const costPerTrackingField = getField(row, [
          'costPerTracking',
          'costPerTrackingUnit',
          'cost_per_tracking',
          'cost_per_tracking_unit',
        ]);

        let costPerTrackingParsed: number | null | undefined;
        if (costPerTrackingField.present) {
          costPerTrackingParsed = parseDecimal(costPerTrackingField.value);
          if (costPerTrackingParsed === undefined) {
            failures.push({
              rowIndex,
              identifier,
              field: 'costPerTracking',
              rawValue: costPerTrackingField.value,
              reason: 'Invalid costPerTracking',
            });
            continue;
          }
        }

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
        } else if (costPerTrackingField.present) {
          if (costPerTrackingParsed === null) {
            updateData.defaultCostPerBase = null;
          } else if (costPerTrackingParsed !== undefined) {
            const trackingToBase =
              product?.trackingToBase ??
              parseDecimal(getField(row, ['trackingToBase', 'tracking_to_base', 'tracking to base']).value);
            if (!trackingToBase || trackingToBase <= 0) {
              failures.push({
                rowIndex,
                identifier,
                field: 'costPerTracking',
                rawValue: costPerTrackingField.value,
                reason: 'Missing or invalid trackingToBase for costPerTracking conversion',
              });
              continue;
            }
            updateData.defaultCostPerBase = new Prisma.Decimal(costPerTrackingParsed / trackingToBase);
          }
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
              recordUnmapped(unmappedCounts.category, categoryField.value);
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
              recordUnmapped(unmappedCounts.productType, typeField.value);
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

        const initialQtyField =
          mode === 'initial_load' ? getField(row, ['initialQty', 'initial_qty', 'initial', 'qty']) : { value: '', present: false };
        const initialScopeField =
          mode === 'initial_load' ? getField(row, ['initialScope', 'scope', 'locationScope']) : { value: '', present: false };
        const asOfDateField =
          mode === 'initial_load' ? getField(row, ['asOfDate', 'as_of_date', 'date']) : { value: '', present: false };
        const initialQtyParsed = initialQtyField.present ? parseDecimal(initialQtyField.value) : null;
        if (initialQtyField.present && initialQtyParsed === undefined) {
          failures.push({
            rowIndex,
            identifier,
            field: 'initialQty',
            rawValue: initialQtyField.value,
            reason: 'Invalid initialQty',
          });
          continue;
        }

        const shouldHandleInitial = mode === 'initial_load' && initialQtyParsed !== null && initialQtyParsed !== undefined;

        if (!product && productId) {
          failures.push({ rowIndex, identifier, reason: 'Product not found for productId' });
          continue;
        }

        if (hasSkuUpdate && skuValue) {
          const seenProductId = seenSkus.get(skuValue);
          const currentKey = product?.id ?? `row-${rowIndex}`;
          if (seenProductId && seenProductId !== currentKey) {
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

        if (product) {
          const productIdResolved = product.id;
          if (mode === 'initial_load' && shouldHandleInitial && !allowExistingInitialQty && (initialQtyParsed ?? 0) > 0) {
            failures.push({
              rowIndex,
              identifier,
              field: 'initialQty',
              rawValue: initialQtyField.value,
              reason: 'Initial quantity only allowed for newly created products',
            });
            continue;
          }

          if (!Object.keys(updateData).length && !hasSkuUpdate) {
            skippedCount += 1;
            continue;
          }

          if (!dryRun) {
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
          }

          if (hasSkuUpdate && skuValue) {
            seenSkus.set(skuValue, productIdResolved);
          }

          updatedCount += 1;
          if (updatedIds.length < 5) {
            updatedIds.push(productIdResolved);
          }
        } else {
          const nameValue = nameIdentifier ?? normalizeNullable(nameUpdate.value);
          if (!nameValue) {
            failures.push({ rowIndex, identifier, reason: 'Missing name for create' });
            continue;
          }

          const categoryValueRaw = categoryField.present ? String(categoryField.value ?? '').trim() : '';
          const mappedCategory = categoryValueRaw ? mapCategoryAlias(categoryValueRaw) : null;
          if (categoryValueRaw && !mappedCategory) {
            recordUnmapped(unmappedCounts.category, categoryField.value);
            failures.push({
              rowIndex,
              identifier: identifier || `name:${nameValue}`,
              field: 'category',
              rawValue: categoryField.value,
              reason: `Unmapped category value: ${categoryField.value}`,
            });
            continue;
          }

          const typeValueRaw = typeField.present ? String(typeField.value ?? '').trim() : '';
          const mappedType = typeValueRaw ? mapProductTypeAlias(typeValueRaw) : null;
          if (typeValueRaw && !mappedType) {
            recordUnmapped(unmappedCounts.productType, typeField.value);
            failures.push({
              rowIndex,
              identifier: identifier || `name:${nameValue}`,
              field: 'productType',
              rawValue: typeField.value,
              reason: `Unmapped productType value: ${typeField.value}`,
            });
            continue;
          }

          const baseTypeField = getField(row, ['baseType', 'base_type', 'base type']);
          const baseType = normalizeBaseType(baseTypeField.value);
          if (!baseType) {
            failures.push({
              rowIndex,
              identifier: identifier || `name:${nameValue}`,
              field: 'baseType',
              rawValue: baseTypeField.value,
              reason: 'Missing or invalid baseType',
            });
            continue;
          }

          const trackingLabelField = getField(row, ['trackingUnitLabel', 'tracking_unit_label', 'tracking unit label']);
          const checkoutLabelField = getField(row, ['checkoutUnitLabel', 'checkout_unit_label', 'checkout unit label']);
          const orderingLabelField = getField(row, ['orderingUnitLabel', 'ordering_unit_label', 'ordering unit label']);
          const trackingUnitLabel = (trackingLabelField.value ?? '').trim();
          const checkoutUnitLabel = (checkoutLabelField.value ?? '').trim();
          const orderingUnitLabel = (orderingLabelField.value ?? '').trim();

          if (!trackingUnitLabel || !checkoutUnitLabel || !orderingUnitLabel) {
            failures.push({
              rowIndex,
              identifier: identifier || `name:${nameValue}`,
              reason: 'Missing required unit labels for create',
            });
            continue;
          }

          const trackingToBaseField = getField(row, ['trackingToBase', 'tracking_to_base', 'tracking to base']);
          const checkoutToBaseField = getField(row, ['checkoutToBase', 'checkout_to_base', 'checkout to base']);
          const orderingToBaseField = getField(row, ['orderingToBase', 'ordering_to_base', 'ordering to base']);
          const trackingToBase = parseDecimal(trackingToBaseField.value);
          const checkoutToBase = parseDecimal(checkoutToBaseField.value);
          const orderingToBase = parseDecimal(orderingToBaseField.value);

          if (!trackingToBase || !checkoutToBase || !orderingToBase) {
            failures.push({
              rowIndex,
              identifier: identifier || `name:${nameValue}`,
              reason: 'Missing or invalid unit conversion values',
            });
            continue;
          }

          if (skuValue) {
            const existingSku = await this.prisma.productCode.findFirst({
              where: { payload: skuValue, codeType: 'sku' },
              select: { productId: true },
            });
            if (existingSku) {
              failures.push({
                rowIndex,
                identifier: identifier || `name:${nameValue}`,
                field: 'sku',
                rawValue: skuUpdateField.value,
                reason: 'SKU already assigned to another product',
              });
              conflictCount += 1;
              continue;
            }
          }

          if (dryRun) {
            createdCount += 1;
            if (createdIds.length < 5) {
              createdIds.push(nameValue);
            }
            if (skuValue) {
              seenSkus.set(skuValue, `row-${rowIndex}`);
            }
          } else {
            const categoryForMode = mappedCategory ?? ProductCategory.CHEMICAL;
            const trackingMode =
              categoryForMode === ProductCategory.EQUIPMENT || categoryForMode === ProductCategory.PPE
                ? ProductTrackingMode.EQUIPMENT
                : ProductTrackingMode.BULK;

            const isStockedField = getField(row, ['isStocked', 'stock', 'stocked']);
            const doNotStockField = getField(row, ['doNotStock', 'do_not_stock']);
            const discontinuedField = getField(row, ['isDiscontinued', 'discontinued']);

            const isStocked = parseBoolean(doNotStockField.value) === true ? false : parseBoolean(isStockedField.value);
            const isDiscontinued = parseBoolean(discontinuedField.value);

            await this.prisma.$transaction(async (tx) => {
              const created = await tx.product.create({
                data: {
                  name: nameValue,
                  epaRegNo: (updateData.epaRegNo as string | undefined) ?? '',
                  description: updateData.description as string | null | undefined,
                  category: mappedCategory ?? undefined,
                  productType: mappedType ?? undefined,
                  baseType,
                  trackingUnitLabel,
                  checkoutUnitLabel,
                  orderingUnitLabel,
                  trackingToBase: Math.round(trackingToBase),
                  checkoutToBase: Math.round(checkoutToBase),
                  orderingToBase: Math.round(orderingToBase),
                  trackingMode,
                  behavior: ProductBehavior.CONSUMABLE,
                  isStocked: isStocked ?? undefined,
                  isDiscontinued: isDiscontinued ?? undefined,
                  defaultCostPerBase: updateData.defaultCostPerBase as Prisma.Decimal | null | undefined,
                },
              });

              if (skuValue) {
                await tx.productCode.create({
                  data: { productId: created.id, payload: skuValue, codeType: 'sku' },
                });
              }

              if (mode === 'initial_load' && shouldHandleInitial && (initialQtyParsed ?? 0) > 0) {
                const scopeRaw = (initialScopeField.value ?? '').trim();
                const scopeNormalized = scopeRaw.toUpperCase();
                const scope =
                  !scopeRaw || scopeNormalized === 'TRUE' || scopeNormalized === 'FALSE' ? 'WAREHOUSE' : scopeRaw;
                const asOfRaw = (asOfDateField.value ?? '').trim();
                const asOfDate = asOfRaw ? new Date(asOfRaw) : new Date();
                if (Number.isNaN(asOfDate.getTime())) {
                  throw new BadRequestException('Invalid asOfDate');
                }

                const qtyBase = toBaseQuantity(initialQtyParsed ?? 0, Math.round(trackingToBase));
                if (qtyBase <= 0) {
                  initialSkippedCount += 1;
                } else {
                  const asOfKey = asOfDate.toISOString().slice(0, 10);
                  const idempotencyKey = `initload:${scope}:${created.id}:${qtyBase}:${asOfKey}`;
                  if (idempotencyKeys.length < 5) {
                    idempotencyKeys.push(idempotencyKey);
                  }
                  const existingTx = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey } });
                  if (existingTx) {
                    initialSkippedCount += 1;
                  } else {
                    const balance = await tx.inventoryBalance.upsert({
                      where: { productId_scope: { productId: created.id, scope } },
                      update: {},
                      create: { productId: created.id, scope, onHandBase: 0 },
                    });
                    const beforeBase = balance.onHandBase ?? 0;
                    const afterBase = beforeBase + qtyBase;
                    await tx.inventoryTransaction.create({
                      data: {
                        productId: created.id,
                        scope,
                        type: TransactionType.initial_load,
                        quantityBase: qtyBase,
                        beforeBase,
                        afterBase,
                        reason: 'Initial load import',
                        idempotencyKey,
                      },
                    });
                    await tx.inventoryBalance.update({
                      where: { id: balance.id },
                      data: { onHandBase: afterBase },
                    });
                    initialPostedCount += 1;
                  }
                }
              }

              if (createdIds.length < 5) {
                createdIds.push(created.id);
              }

              if (skuValue) {
                seenSkus.set(skuValue, created.id);
              }
            });
            createdCount += 1;
          }
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
    skippedCount = rowsRead - updatedCount - createdCount - failedCount;
    const summary: {
      rowsRead: number;
      mode: string;
      dryRun: boolean;
      createdCount: number;
      updated: number;
      skipped: number;
      failed: number;
      updatedCount: number;
      skippedCount: number;
      failedCount: number;
      created: number;
      initialPostedCount: number;
      initialSkippedCount: number;
      idempotencyKeys: string[];
      updatedSample: string[];
      createdSample: string[];
      failures: Array<{ rowIndex: number; identifier: string; field?: string; rawValue?: string; reason: string }>;
      unmapped?: {
        category: Array<{ value: string; count: number }>;
        productType: Array<{ value: string; count: number }>;
      };
    } = {
      rowsRead,
      mode,
      dryRun,
      createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
      updatedCount,
      skippedCount,
      failedCount,
      created: createdCount,
      initialPostedCount,
      initialSkippedCount,
      idempotencyKeys,
      updatedSample: updatedIds,
      createdSample: createdIds,
      failures,
    };
    if (dryRun) {
      summary['unmapped'] = {
        category: Array.from(unmappedCounts.category.entries()).map(([value, count]) => ({ value, count })),
        productType: Array.from(unmappedCounts.productType.entries()).map(([value, count]) => ({ value, count })),
      };
    }

    if (conflictCount > 0) {
      throw new ConflictException(summary);
    }

    return summary;
  }

  private normalizeScope(scope: string) {
    const normalized = scope.trim();
    if (!normalized) {
      throw new BadRequestException('Scope/Location is required when Initial On-Hand is provided');
    }
    if (normalized === 'WAREHOUSE') {
      return normalized;
    }
    if (normalized.startsWith('TRUCK:') && normalized.length > 'TRUCK:'.length) {
      return normalized;
    }
    throw new BadRequestException('Invalid scope/location');
  }
}
