import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditStatus, AuditUnitBasis, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AddAuditLineDto, CreateAuditSessionDto } from './dto';
import { toCountedBase } from '../inventory/audit-helpers';

type CurrentUser = { userId: string; role: Role };

type AuditFinalizeSummary = {
  linesTotal: number;
  linesAdjusted: number;
  linesZeroDeltaSkipped: number;
  idempotencyKeys: string[];
};

@Injectable()
export class AuditsService {
  constructor(private prisma: PrismaService) {}

  async createSession(dto: CreateAuditSessionDto, user: CurrentUser) {
    const locationScope = dto.locationScope?.trim() || 'WAREHOUSE';
    return this.prisma.auditSession.create({
      data: {
        locationScope,
        notes: dto.notes?.trim() || undefined,
        createdById: user.userId,
      },
    });
  }

  async addLine(auditSessionId: string, dto: AddAuditLineDto) {
    const auditSession = await this.prisma.auditSession.findUnique({ where: { id: auditSessionId } });
    if (!auditSession) {
      throw new NotFoundException('Audit session not found');
    }
    if (auditSession.status !== AuditStatus.DRAFT) {
      throw new BadRequestException('Audit session is not editable');
    }

    const product = await this.resolveProduct(dto);
    const multiplier = dto.unitBasis === AuditUnitBasis.CHECKOUT ? product.checkoutToBase : product.trackingToBase;
    const desiredBase = toCountedBase(dto.countedQty, multiplier);

    const balance = await this.prisma.inventoryBalance.upsert({
      where: { productId_scope: { productId: product.id, scope: auditSession.locationScope } },
      update: {},
      create: { productId: product.id, scope: auditSession.locationScope },
    });

    const currentBase = balance.onHandBase ?? 0;
    const deltaBase = desiredBase - currentBase;

    const line = await this.prisma.auditLine.upsert({
      where: { auditSessionId_productId: { auditSessionId, productId: product.id } },
      update: {
        countedQty: new Prisma.Decimal(dto.countedQty),
        unitBasis: dto.unitBasis,
        desiredBase: new Prisma.Decimal(desiredBase),
        deltaBase: new Prisma.Decimal(deltaBase),
      },
      create: {
        auditSessionId,
        productId: product.id,
        countedQty: new Prisma.Decimal(dto.countedQty),
        unitBasis: dto.unitBasis,
        desiredBase: new Prisma.Decimal(desiredBase),
        deltaBase: new Prisma.Decimal(deltaBase),
      },
    });

    return {
      id: line.id,
      auditSessionId: line.auditSessionId,
      productId: product.id,
      productName: product.name,
      countedQty: Number(line.countedQty),
      unitBasis: line.unitBasis,
      desiredBase: Number(line.desiredBase),
      deltaBase: Number(line.deltaBase),
      currentOnHandBase: currentBase,
      locationScope: auditSession.locationScope,
    };
  }

  async finalize(auditSessionId: string, user: CurrentUser): Promise<AuditFinalizeSummary> {
    const auditSession = await this.prisma.auditSession.findUnique({
      where: { id: auditSessionId },
      include: { lines: true },
    });
    if (!auditSession) {
      throw new NotFoundException('Audit session not found');
    }

    const idempotencyKeys: string[] = [];
    const idempotencySampleLimit = 10;
    let linesAdjusted = 0;
    let linesZeroDeltaSkipped = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const line of auditSession.lines) {
        const deltaBase = Number(line.deltaBase);
        if (!deltaBase) {
          linesZeroDeltaSkipped += 1;
          continue;
        }

        const idempotencyKey = `audit:${auditSession.id}:${auditSession.locationScope}:${line.productId}`;
        if (idempotencyKeys.length < idempotencySampleLimit) {
          idempotencyKeys.push(idempotencyKey);
        }

        const existing = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey } });
        if (existing) {
          continue;
        }

        const balance = await tx.inventoryBalance.upsert({
          where: { productId_scope: { productId: line.productId, scope: auditSession.locationScope } },
          update: {},
          create: { productId: line.productId, scope: auditSession.locationScope },
        });

        const beforeBase = balance.onHandBase ?? 0;
        const afterBase = beforeBase + deltaBase;

        await tx.inventoryTransaction.create({
          data: {
            productId: line.productId,
            scope: auditSession.locationScope,
            type: 'adjustment',
            quantityBase: deltaBase,
            beforeBase,
            afterBase,
            actorId: user.userId,
            actorRole: user.role,
            reason: 'Audit finalized',
            idempotencyKey,
          },
        });

        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { onHandBase: afterBase },
        });

        linesAdjusted += 1;
      }

      if (auditSession.status === AuditStatus.DRAFT) {
        await tx.auditSession.update({
          where: { id: auditSession.id },
          data: {
            status: AuditStatus.FINALIZED,
            finalizedAt: new Date(),
          },
        });
      }
    });

    return {
      linesTotal: auditSession.lines.length,
      linesAdjusted,
      linesZeroDeltaSkipped,
      idempotencyKeys,
    };
  }

  private async resolveProduct(dto: AddAuditLineDto) {
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      return product;
    }

    if (dto.sku) {
      const code = await this.prisma.productCode.findUnique({
        where: { payload: dto.sku },
        include: { product: true },
      });
      if (!code?.product) {
        throw new NotFoundException('Product not found for sku');
      }
      return code.product;
    }

    throw new BadRequestException('productId or sku is required');
  }
}

