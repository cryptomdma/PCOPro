import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditCountDto, BalanceQueryDto } from './audit.dto';
import { computeDelta, isLargeDelta, resolveMultiplier, toCountedBase } from './audit-helpers';
import { TransferDto } from './transfer.dto';
import { Prisma } from '@prisma/client';
import { getUnitFactor, toBaseQuantity } from '../utils/units';
import { randomUUID } from 'crypto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async auditCount(dto: AuditCountDto, idempotencyKey?: string) {
    const scope = dto.scope || 'WAREHOUSE';
    const key = idempotencyKey || `audit:${dto.productId}:${scope}:${new Date().toISOString()}`;

    const existing = await this.prisma.inventoryTransaction.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      return this.buildAuditResponse(
        existing.productId,
        existing.beforeBase,
        existing.afterBase,
        existing.quantityBase,
        existing.id,
      );
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
          where: { productId_scope: { productId: product.id, scope } },
          update: {},
          create: { productId: product.id, scope },
        });

        const currentBase = balance.onHandBase ?? 0;
        const { deltaBase, afterBase } = computeDelta(currentBase, countedBase);

        const transaction = await tx.inventoryTransaction.create({
          data: {
            productId: product.id,
            scope,
            type: 'audit_count',
            quantityBase: deltaBase,
            beforeBase: currentBase,
            afterBase,
            reason: dto.reason,
            comment: dto.comment,
            device: dto.device,
            actorRole: 'MANAGER',
            idempotencyKey: key,
          },
        });

        await tx.inventoryBalance.update({
          where: { id: balance.id },
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
    const scope = params.scope || 'WAREHOUSE';
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
      include: { balances: { where: { scope } } },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => {
      const balance = product.balances[0];
      const onHandBase = balance?.onHandBase ?? 0;
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
        scope,
      };
    });
  }

  async transfer(dto: TransferDto) {
    const scopeFrom = dto.fromScope || 'WAREHOUSE';
    const scopeTo = `TRUCK:${dto.toTechnicianId}`;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryTransaction.findFirst({
        where: { transferIdempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return this.transferResult(existing.transferGroupId || existing.id, dto.productId, scopeFrom, scopeTo, tx);
      }

      const product = await tx.product.findUnique({ where: { id: dto.productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const factor = getUnitFactor(product, dto.unitLabel, 'tracking');
      const qtyBase = toBaseQuantity(dto.quantity, factor);
      const groupId = randomUUID();
      const fromBalance = await tx.inventoryBalance.upsert({
        where: { productId_scope: { productId: product.id, scope: scopeFrom } },
        update: {},
        create: { productId: product.id, scope: scopeFrom },
      });
      const toBalance = await tx.inventoryBalance.upsert({
        where: { productId_scope: { productId: product.id, scope: scopeTo } },
        update: {},
        create: { productId: product.id, scope: scopeTo },
      });

      const fromAfter = fromBalance.onHandBase - qtyBase;
      const toAfter = (toBalance.onHandBase ?? 0) + qtyBase;

      await tx.inventoryTransaction.create({
        data: {
          productId: product.id,
          scope: scopeFrom,
          type: 'transfer',
          quantityBase: -qtyBase,
          beforeBase: fromBalance.onHandBase,
          afterBase: fromAfter,
          reason: dto.reason,
          actorRole: 'MANAGER',
          transferGroupId: groupId,
          transferIdempotencyKey: dto.idempotencyKey,
          idempotencyKey: `${dto.idempotencyKey}:OUT`,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          productId: product.id,
          scope: scopeTo,
          type: 'transfer',
          quantityBase: qtyBase,
          beforeBase: toBalance.onHandBase,
          afterBase: toAfter,
          reason: dto.reason,
          actorRole: 'MANAGER',
          transferGroupId: groupId,
          transferIdempotencyKey: dto.idempotencyKey,
          idempotencyKey: `${dto.idempotencyKey}:IN`,
        },
      });

      await tx.inventoryBalance.update({ where: { id: fromBalance.id }, data: { onHandBase: fromAfter } });
      await tx.inventoryBalance.update({ where: { id: toBalance.id }, data: { onHandBase: toAfter } });

      return this.transferResult(groupId, product.id, scopeFrom, scopeTo, tx);
    });
  }

  private async transferResult(groupId: string, productId: string, fromScope: string, toScope: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const [fromBalance, toBalance] = await Promise.all([
      client.inventoryBalance.findUnique({ where: { productId_scope: { productId, scope: fromScope } } }),
      client.inventoryBalance.findUnique({ where: { productId_scope: { productId, scope: toScope } } }),
    ]);
    return {
      transferGroupId: groupId,
      from: { scope: fromScope, onHandBase: fromBalance?.onHandBase ?? 0 },
      to: { scope: toScope, onHandBase: toBalance?.onHandBase ?? 0 },
    };
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
      where: { role: { in: ['ADMIN', 'MANAGER', 'WAREHOUSE'] } },
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
      const message = `Large audit delta for ${params.productName}: delta ${params.deltaBase} base units.`;
      payloads.push(
        ...users.map((user) => ({ userId: user.id, message, type: 'inventory_audit_large_delta' })),
      );
    }
    if (payloads.length) {
      await tx.notification.createMany({ data: payloads, skipDuplicates: true });
    }
  }
}


