import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateIncomingDto } from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class IncomingService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateIncomingDto, actorId?: string) {
    const receipt = await this.prisma.incomingReceipt.create({
      data: {
        receiptDate: new Date(dto.receiptDate),
        supplier: dto.supplier,
        status: 'posted',
        createdById: actorId ?? (await this.ensureSystemUser()),
        postedAt: new Date(),
        lines: {
          create: dto.lines.map((line) => ({
            productId: line.productId,
            qtyOrdered: line.qtyOrdered,
            qtyReceived: line.qtyReceived,
            backorderedQty: line.backorderedQty,
            receivingUnitLabel: line.receivingUnitLabel,
          })),
        },
      },
      include: { lines: true },
    });

    // Post ledger entries per line
    for (const line of receipt.lines) {
      const product = await this.prisma.product.findUnique({ where: { id: line.productId } });
      if (!product) continue;
      const baseDelta = line.qtyReceived * product.orderingToBase;
      const balance = await this.prisma.inventoryBalance.upsert({
        where: { productId_scope: { productId: product.id, scope: 'WAREHOUSE' } },
        update: {},
        create: { productId: product.id, scope: 'WAREHOUSE' },
      });
      const after = balance.onHandBase + baseDelta;
      await this.prisma.inventoryTransaction.create({
        data: {
          productId: product.id,
          scope: 'WAREHOUSE',
          type: 'receiving_posted',
          quantityBase: baseDelta,
          beforeBase: balance.onHandBase,
          afterBase: after,
          actorId,
          actorRole: actorId ? undefined : 'ADMIN',
          incomingLineId: line.id,
          idempotencyKey: `incoming-${receipt.id}-${line.id}`,
        },
      });
      await this.prisma.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHandBase: after },
      });
    }

    return receipt;
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
