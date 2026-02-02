import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateIncomingDto } from './dto';
import { getUnitFactor, toBaseQuantity } from '../utils/units';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';

@Injectable()
export class IncomingService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateIncomingDto, actor?: { userId?: string; role?: string }) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one line is required.');
    }

    const scope = dto.scope || 'WAREHOUSE';
    const receiptDate = new Date(dto.receiptDate);
    if (Number.isNaN(receiptDate.getTime())) {
      throw new BadRequestException('Invalid receipt date.');
    }

    const lineInputs = dto.lines.filter((line) => line.productId && line.qtyReceived > 0);
    if (!lineInputs.length) {
      throw new BadRequestException('At least one line with qtyReceived > 0 is required.');
    }

    const productIds = Array.from(new Set(lineInputs.map((line) => line.productId)));
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    const aggregated = new Map<string, { productId: string; qtyReceived: number; receivingUnitLabel: string; qtyBase: number }>();
    for (const line of lineInputs) {
      const product = productMap.get(line.productId);
      if (!product) {
        throw new BadRequestException(`Product not found: ${line.productId}`);
      }
      const normalizedUnit = (line.receivingUnitLabel ?? '').trim().toLowerCase();
      const orderingUnit = product.orderingUnitLabel.trim().toLowerCase();
      if (normalizedUnit && normalizedUnit !== orderingUnit) {
        throw new BadRequestException(`Receiving unit must match ordering unit for ${product.name}.`);
      }
      const factor = getUnitFactor(product, product.orderingUnitLabel, 'ordering');
      if (!factor || factor <= 0) {
        throw new BadRequestException(`Missing ordering conversion for ${product.name}.`);
      }
      const qtyBase = toBaseQuantity(line.qtyReceived, factor);
      if (qtyBase <= 0) {
        throw new BadRequestException(`Quantity must be greater than 0 for ${product.name}.`);
      }
      const existing = aggregated.get(product.id);
      if (existing) {
        existing.qtyReceived += line.qtyReceived;
        existing.qtyBase += qtyBase;
      } else {
        aggregated.set(product.id, {
          productId: product.id,
          qtyReceived: line.qtyReceived,
          receivingUnitLabel: product.orderingUnitLabel,
          qtyBase,
        });
      }
    }

    const normalizedLines = Array.from(aggregated.values()).sort((a, b) => {
      if (a.productId === b.productId) return a.qtyBase - b.qtyBase;
      return a.productId.localeCompare(b.productId);
    });

    const receiptKeyDate = receiptDate.toISOString().slice(0, 10);
    const keySeed = JSON.stringify({
      scope,
      receiptDate: receiptKeyDate,
      lines: normalizedLines.map((line) => ({ productId: line.productId, qtyBase: line.qtyBase })),
    });
    const batchHash = createHash('sha256').update(keySeed).digest('hex');

    const lineKeys = normalizedLines.map((line) => ({
      ...line,
      idempotencyKey: `receiving:${scope}:${batchHash}:${line.productId}`,
    }));

    const existingTransactions = await this.prisma.inventoryTransaction.findMany({
      where: { idempotencyKey: { in: lineKeys.map((line) => line.idempotencyKey) } },
      select: { idempotencyKey: true },
    });
    const existingSet = new Set(existingTransactions.map((tx) => tx.idempotencyKey));

    const linesToPost = lineKeys.filter((line) => !existingSet.has(line.idempotencyKey));
    const skippedCount = lineKeys.length - linesToPost.length;
    const idempotencySample = lineKeys.slice(0, 5).map((line) => line.idempotencyKey);

    if (!linesToPost.length) {
      return { postedCount: 0, skippedCount, idempotencyKeys: idempotencySample };
    }

    const actorId = actor?.userId ?? (await this.ensureSystemUser());
    const actorRole = actor?.role ?? 'ADMIN';
    const receipt = await this.prisma.incomingReceipt.create({
      data: {
        receiptDate,
        supplier: dto.supplier,
        status: 'posted',
        createdById: actorId,
        postedAt: new Date(),
        lines: {
          create: linesToPost.map((line) => ({
            productId: line.productId,
            qtyOrdered: line.qtyReceived,
            qtyReceived: line.qtyReceived,
            backorderedQty: 0,
            receivingUnitLabel: line.receivingUnitLabel,
          })),
        },
      },
      include: { lines: true },
    });

    for (const line of receipt.lines) {
      const source = linesToPost.find((item) => item.productId === line.productId);
      if (!source) continue;
      const product = productMap.get(line.productId);
      if (!product) continue;
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.inventoryBalance.upsert({
          where: { productId_scope: { productId: product.id, scope } },
          update: {},
          create: { productId: product.id, scope },
        });
        const before = balance.onHandBase ?? 0;
        const after = before + source.qtyBase;
        await tx.inventoryTransaction.create({
          data: {
            productId: product.id,
            scope,
            type: 'receiving_posted',
            quantityBase: source.qtyBase,
            beforeBase: before,
            afterBase: after,
            actorId,
            actorRole: actorRole as any,
            incomingLineId: line.id,
            idempotencyKey: source.idempotencyKey,
          },
        });
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { onHandBase: after },
        });
      });
    }

    return {
      receiptId: receipt.id,
      postedCount: linesToPost.length,
      skippedCount,
      idempotencyKeys: idempotencySample,
    };
  }

  list() {
    return this.prisma.incomingReceipt.findMany({
      include: { lines: true },
      orderBy: { receiptDate: 'desc' },
    });
  }

  async listReceipts(params?: { take?: number; skip?: number; scope?: string }) {
    const take = params?.take && params.take > 0 ? Math.min(params.take, 100) : 20;
    const skip = params?.skip && params.skip > 0 ? params.skip : 0;
    const scope = params?.scope?.trim();

    const where: Prisma.InventoryTransactionWhereInput = { type: 'receiving_posted' };
    if (scope) {
      where.scope = scope;
    }

    const fetchLimit = Math.min(500, (take + skip) * 6);
    const transactions = await this.prisma.inventoryTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
      select: {
        idempotencyKey: true,
        createdAt: true,
        scope: true,
        quantityBase: true,
      },
    });

    const grouped = new Map<
      string,
      { receiptId: string; postedAt: Date; destinationScope: string; lineCount: number; totalUnitsBase: number }
    >();

    for (const tx of transactions) {
      const receiptId = this.getReceiptKey(tx.idempotencyKey);
      if (!receiptId) continue;
      const existing = grouped.get(receiptId);
      if (existing) {
        existing.lineCount += 1;
        existing.totalUnitsBase += tx.quantityBase;
        if (tx.createdAt > existing.postedAt) {
          existing.postedAt = tx.createdAt;
        }
      } else {
        grouped.set(receiptId, {
          receiptId,
          postedAt: tx.createdAt,
          destinationScope: tx.scope,
          lineCount: 1,
          totalUnitsBase: tx.quantityBase,
        });
      }
    }

    const receipts = Array.from(grouped.values()).sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
    return receipts.slice(skip, skip + take);
  }

  async getReceiptDetail(receiptId: string, scope?: string) {
    const prefix = this.getReceiptPrefix(receiptId);
    const where: Prisma.InventoryTransactionWhereInput = {
      type: 'receiving_posted',
      idempotencyKey: { startsWith: prefix },
    };
    if (scope?.trim()) {
      where.scope = scope.trim();
    }

    const transactions = await this.prisma.inventoryTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    });

    if (!transactions.length) {
      throw new NotFoundException('Receipt not found');
    }

    const postedAt = transactions[0].createdAt;
    const destinationScope = transactions[0].scope;
    const lines = transactions.map((tx) => {
      const orderingToBase = tx.product.orderingToBase || 1;
      const orderingQty = Math.round((tx.quantityBase / orderingToBase) * 100) / 100;
      return {
        productId: tx.productId,
        productName: tx.product.name,
        quantityBase: tx.quantityBase,
        quantityOrdering: orderingQty,
        orderingUnitLabel: tx.product.orderingUnitLabel,
        orderingToBase,
        postedAt: tx.createdAt,
        destinationScope: tx.scope,
        idempotencyKey: tx.idempotencyKey,
      };
    });

    return {
      receiptId,
      postedAt,
      destinationScope,
      lineCount: lines.length,
      lines,
    };
  }

  async importReceivingCsv(
    buffer: Buffer,
    options?: { dryRun?: boolean },
    actor?: { userId?: string; role?: string },
  ) {
    if (!buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }

    const dryRun = options?.dryRun ?? false;
    const raw = buffer.toString('utf-8');
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const failures: Array<{ rowIndex: number; identifier: string; reason: string }> = [];
    const normalizeKey = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase();
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
    const parseNumber = (value?: string) => {
      const normalized = (value ?? '').trim();
      if (!normalized) return null;
      const cleaned = normalized.replace(/,/g, '');
      const parsed = Number(cleaned);
      if (!Number.isFinite(parsed)) return undefined;
      return parsed;
    };

    const aggregated = new Map<
      string,
      { productId: string; qtyReceived: number; qtyBase: number; trackingToBase: number; trackingUnitLabel: string }
    >();
    const notes = new Set<string>();
    let resolvedScope: string | null = null;
    let resolvedDate: string | null = null;

    for (const [index, row] of rows.entries()) {
      const rowIndex = index + 1;
      const productIdField = getField(row, ['productId', 'product_id', 'id']);
      const skuField = getField(row, ['sku']);
      const nameField = getField(row, ['name', 'product', 'product_name', 'product name']);
      const qtyField = getField(row, ['qtyReceived', 'qty', 'quantity', 'receivedQty']);
      const scopeField = getField(row, ['scope', 'destinationScope']);
      const dateField = getField(row, ['date', 'asOfDate', 'receivedDate']);
      const noteField = getField(row, ['note', 'notes']);

      const productId = (productIdField.value ?? '').trim();
      const sku = (skuField.value ?? '').trim();
      const name = (nameField.value ?? '').trim();
      const qtyParsed = parseNumber(qtyField.value);

      let identifier = '';
      let product: { id: string; name: string; trackingToBase: number; trackingUnitLabel: string } | null = null;

      if (productId) {
        product = await this.prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, name: true, trackingToBase: true, trackingUnitLabel: true },
        });
        identifier = `productId:${productId}`;
        if (!product) {
          failures.push({ rowIndex, identifier, reason: 'Product not found for productId' });
          continue;
        }
      } else if (sku) {
        const code = await this.prisma.productCode.findFirst({
          where: { payload: sku, codeType: 'sku' },
          select: { productId: true },
        });
        if (code) {
          product = await this.prisma.product.findUnique({
            where: { id: code.productId },
            select: { id: true, name: true, trackingToBase: true, trackingUnitLabel: true },
          });
        }
        identifier = `sku:${sku}`;
        if (!product) {
          failures.push({ rowIndex, identifier, reason: 'Product not found for sku' });
          continue;
        }
      } else if (name) {
        const matches = await this.prisma.product.findMany({
          where: { name: { equals: name.trim(), mode: 'insensitive' } },
          select: { id: true, name: true, trackingToBase: true, trackingUnitLabel: true },
        });
        if (matches.length === 1) {
          product = matches[0];
        } else if (matches.length > 1) {
          failures.push({ rowIndex, identifier: `name:${name}`, reason: 'Multiple products matched name' });
          continue;
        } else {
          failures.push({ rowIndex, identifier: `name:${name}`, reason: 'Product not found for name' });
          continue;
        }
        identifier = `name:${name}`;
      } else {
        failures.push({ rowIndex, identifier: 'unknown', reason: 'Missing identifier' });
        continue;
      }

      if (!qtyField.present || qtyParsed === null) {
        failures.push({ rowIndex, identifier, reason: 'Missing qtyReceived' });
        continue;
      }
      if (qtyParsed === undefined || qtyParsed <= 0) {
        failures.push({ rowIndex, identifier, reason: 'qtyReceived must be greater than 0' });
        continue;
      }

      const trackingToBase = product.trackingToBase;
      if (!trackingToBase || trackingToBase <= 0) {
        failures.push({ rowIndex, identifier, reason: `Missing trackingToBase for ${product.name}` });
        continue;
      }

      const baseQty = toBaseQuantity(qtyParsed, trackingToBase);
      if (baseQty <= 0) {
        failures.push({ rowIndex, identifier, reason: 'Converted base quantity must be greater than 0' });
        continue;
      }

      const scopeRaw = (scopeField.value ?? '').trim();
      const scopeNormalized = scopeRaw.toUpperCase();
      const scope =
        !scopeRaw || scopeNormalized === 'TRUE' || scopeNormalized === 'FALSE' ? 'WAREHOUSE' : scopeRaw;

      if (!resolvedScope) {
        resolvedScope = scope;
      } else if (resolvedScope !== scope) {
        failures.push({ rowIndex, identifier, reason: `Scope mismatch (expected ${resolvedScope})` });
        continue;
      }

      const dateRaw = (dateField.value ?? '').trim();
      const dateValue = dateRaw ? new Date(dateRaw) : new Date();
      if (Number.isNaN(dateValue.getTime())) {
        failures.push({ rowIndex, identifier, reason: 'Invalid date' });
        continue;
      }
      const normalizedDate = dateValue.toISOString().slice(0, 10);
      if (!resolvedDate) {
        resolvedDate = normalizedDate;
      } else if (resolvedDate !== normalizedDate) {
        failures.push({ rowIndex, identifier, reason: `Date mismatch (expected ${resolvedDate})` });
        continue;
      }

      if (noteField.present) {
        const noteValue = (noteField.value ?? '').trim();
        if (noteValue) notes.add(noteValue);
      }

      const existing = aggregated.get(product.id);
      if (existing) {
        existing.qtyReceived += qtyParsed;
        existing.qtyBase += baseQty;
      } else {
        aggregated.set(product.id, {
          productId: product.id,
          qtyReceived: qtyParsed,
          qtyBase: baseQty,
          trackingToBase,
          trackingUnitLabel: product.trackingUnitLabel,
        });
      }
    }

    const lines = Array.from(aggregated.values()).sort((a, b) => a.productId.localeCompare(b.productId));
    const resolvedCount = lines.length;
    const failedCount = failures.length;
    const rowsRead = rows.length;
    const scope = resolvedScope ?? 'WAREHOUSE';
    const dateKey = resolvedDate ?? new Date().toISOString().slice(0, 10);

    if (failedCount > 0) {
      return {
        rowsRead,
        resolvedCount,
        failedCount,
        scope,
        date: dateKey,
        receiptKey: null,
        dryRun,
        errors: failures,
      };
    }

    const notePart = Array.from(notes.values()).sort().join('|');
    const hashSeed = JSON.stringify({
      scope,
      date: dateKey,
      lines: lines.map((line) => ({ productId: line.productId, qtyBase: line.qtyBase })),
      note: notePart || undefined,
    });
    const hash = createHash('sha256').update(hashSeed).digest('hex');
    const receiptKey = `receiving_csv:${scope}:${dateKey}:${hash}`;

    const lineKeys = lines.map((line) => ({
      ...line,
      idempotencyKey: `${receiptKey}:${line.productId}`,
    }));

    const existingTransactions = await this.prisma.inventoryTransaction.findMany({
      where: { idempotencyKey: { in: lineKeys.map((line) => line.idempotencyKey) } },
      select: { idempotencyKey: true },
    });
    const existingSet = new Set(existingTransactions.map((tx) => tx.idempotencyKey));
    const linesToPost = lineKeys.filter((line) => !existingSet.has(line.idempotencyKey));
    const skippedCount = lineKeys.length - linesToPost.length;

    if (dryRun) {
      return {
        rowsRead,
        resolvedCount,
        failedCount: 0,
        scope,
        date: dateKey,
        receiptKey,
        dryRun: true,
        wouldPostCount: linesToPost.length,
        skippedCount,
        errors: failures,
      };
    }

    if (!linesToPost.length) {
      return {
        rowsRead,
        resolvedCount,
        failedCount: 0,
        scope,
        date: dateKey,
        receiptKey,
        postedCount: 0,
        skippedCount,
        errors: failures,
      };
    }

    const actorId = actor?.userId ?? (await this.ensureSystemUser());
    const actorRole = actor?.role ?? 'ADMIN';
    const receiptDate = new Date(dateKey);
    const reason = notePart ? `Receiving CSV import: ${notePart}` : 'Receiving CSV import';

    const receipt = await this.prisma.incomingReceipt.create({
      data: {
        receiptDate,
        supplier: notePart || undefined,
        status: 'posted',
        createdById: actorId,
        postedAt: new Date(),
        lines: {
          create: linesToPost.map((line) => ({
            productId: line.productId,
            qtyOrdered: Math.round(line.qtyReceived),
            qtyReceived: Math.round(line.qtyReceived),
            backorderedQty: 0,
            receivingUnitLabel: line.trackingUnitLabel,
          })),
        },
      },
      include: { lines: true },
    });

    for (const line of receipt.lines) {
      const source = linesToPost.find((item) => item.productId === line.productId);
      if (!source) continue;
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.inventoryBalance.upsert({
          where: { productId_scope: { productId: line.productId, scope } },
          update: {},
          create: { productId: line.productId, scope },
        });
        const before = balance.onHandBase ?? 0;
        const after = before + source.qtyBase;
        await tx.inventoryTransaction.create({
          data: {
            productId: line.productId,
            scope,
            type: 'receiving_posted',
            quantityBase: source.qtyBase,
            beforeBase: before,
            afterBase: after,
            actorId,
            actorRole: actorRole as any,
            incomingLineId: line.id,
            idempotencyKey: source.idempotencyKey,
            reason,
          },
        });
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { onHandBase: after },
        });
      });
    }

    return {
      rowsRead,
      resolvedCount,
      failedCount: 0,
      scope,
      date: dateKey,
      receiptKey,
      postedCount: linesToPost.length,
      skippedCount,
      errors: failures,
    };
  }

  private getReceiptKey(idempotencyKey: string): string | null {
    if (!idempotencyKey) return null;
    if (idempotencyKey.startsWith('incoming-')) {
      const parts = idempotencyKey.split('-');
      if (parts.length >= 3) {
        return `incoming-${parts[1]}`;
      }
    }
    if (idempotencyKey.startsWith('receiving:')) {
      const parts = idempotencyKey.split(':');
      if (parts.length >= 3) {
        return parts.slice(0, 3).join(':');
      }
    }
    return idempotencyKey;
  }

  private getReceiptPrefix(receiptId: string): string {
    if (receiptId.startsWith('incoming-')) {
      return `${receiptId}-`;
    }
    if (receiptId.startsWith('receiving:')) {
      return `${receiptId}:`;
    }
    return receiptId;
  }

  private async ensureSystemUser() {
    const sysEmail = 'system@pco.local';
    const user = await this.prisma.user.upsert({
      where: { email: sysEmail },
      update: {},
      create: {
        email: sysEmail,
        name: 'System',
        role: 'ADMIN',
        passwordHash: '$2b$10$KIX5J2QUp3NEEraPfYZ7qeFfm6.H/Ejz.gIhVQbK5EOi33ECszOe2',
        active: true,
      },
    });
    return user.id;
  }
}
