import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditCountDto, BalanceQueryDto } from './audit.dto';
import { computeDelta, isLargeDelta, resolveMultiplier, toCountedBase } from './audit-helpers';
import { Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async auditCount(dto: AuditCountDto, idempotencyKey?: string) {
    const key = idempotencyKey || `audit:${dto.productId}:${new Date().toISOString()}`;

    const existing = await this.prisma.inventoryTransaction.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      return this.buildAuditResponse(existing.productId, existing.beforeBase, existing.afterBase, existing.quantityBase, existing.id);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: dto.productId } });
        if (!product) {
          throw new NotFoundException('Product not found');
        }

        const multiplier = resolveMultiplier(product, dto.unit);
        const countedBase = toCountedBase(dto.countedQty, multiplier);
        const balance = await tx.inventoryBalance.upsert({
          where: { productId: product.id },
          update: {},
          create: { productId: product.id },
        });

        const currentBase = balance.onHandBase ?? 0;
        const { deltaBase, afterBase } = computeDelta(currentBase, countedBase);

        const transaction = await tx.inventoryTransaction.create({
          data: {
            productId: product.id,
            type: 'audit_count',
            quantityBase: deltaBase,
            beforeBase: currentBase,
            afterBase,
            reason: dto.reason,
            comment: dto.comment,
            device: dto.device,
            actorRole: 'INVENTORY_MANAGER',
            idempotencyKey: key,
          },
        });

        await tx.inventoryBalance.update({
          where: { productId: product.id },
          data: { onHandBase: afterBase },
        });

        const negativeAfter = afterBase < 0;
        const deltaLarge = isLargeDelta(currentBase, deltaBase);
        if (negativeAfter || deltaLarge) {
          await this.createNotifications(tx, {
            productName: product.name,
            afterBase,
            deltaBase,
            negativeAfter,
            deltaLarge,
          });
        }

        return {
          productId: product.id,
          beforeBase: currentBase,
          countedBase,
          deltaBase,
          afterBase,
          transactionId: transaction.id,
          negativeAfter,
          deltaLarge,
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const fallback = await this.prisma.inventoryTransaction.findUnique({ where: { idempotencyKey: key } });
        if (fallback) {
          return this.buildAuditResponse(
            fallback.productId,
            fallback.beforeBase,
            fallback.afterBase,
            fallback.quantityBase,
            fallback.id,
          );
        }
      }
      throw err;
    }
  }

  async listBalances(params: BalanceQueryDto) {
    const where: Prisma.ProductWhereInput = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { epaRegNo: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.stockedOnly) {
      where.isStocked = true;
    }
    if (!params.includeDiscontinued) {
      where.isDiscontinued = false;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: { balances: true },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => {
      const onHandBase = product.balances?.onHandBase ?? 0;
      const onHandTracking = onHandBase / product.trackingToBase;
      return {
        productId: product.id,
        name: product.name,
        baseType: product.baseType,
        trackingUnitLabel: product.trackingUnitLabel,
        checkoutUnitLabel: product.checkoutUnitLabel,
        trackingToBase: product.trackingToBase,
        checkoutToBase: product.checkoutToBase,
        onHandBase,
        onHandTracking,
        isStocked: product.isStocked,
        isDiscontinued: product.isDiscontinued,
      };
    });
  }

  private buildAuditResponse(
    productId: string,
    beforeBase: number,
    afterBase: number,
    deltaBase: number,
    transactionId: string,
  ) {
    return {
      productId,
      beforeBase,
      countedBase: afterBase,
      deltaBase,
      afterBase,
      transactionId,
      negativeAfter: afterBase < 0,
      deltaLarge: isLargeDelta(beforeBase, deltaBase),
    };
  }

  private async createNotifications(
    tx: Prisma.TransactionClient,
    params: { productName: string; afterBase: number; deltaBase: number; negativeAfter: boolean; deltaLarge: boolean },
  ) {
    const users = await tx.user.findMany({
      where: { role: { in: ['ADMIN', 'INVENTORY_MANAGER'] } },
      select: { id: true },
    });
    if (!users.length) return;
    const payloads: Prisma.NotificationCreateManyInput[] = [];
    if (params.negativeAfter) {
      const message = `Inventory for ${params.productName} went negative (on-hand base ${params.afterBase}).`;
      payloads.push(
        ...users.map((user) => ({ userId: user.id, message, type: 'inventory_negative' })),
      );
    }
    if (params.deltaLarge) {
      const message = `Large audit delta for ${params.productName}: Δ ${params.deltaBase} base units.`;
      payloads.push(
        ...users.map((user) => ({ userId: user.id, message, type: 'inventory_audit_large_delta' })),
      );
    }
    if (payloads.length) {
      await tx.notification.createMany({ data: payloads, skipDuplicates: true });
    }
  }
}
