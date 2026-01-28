import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateIncomingDto } from './dto';
import { getUnitFactor, toBaseQuantity } from '../utils/units';
import { createHash } from 'crypto';

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
