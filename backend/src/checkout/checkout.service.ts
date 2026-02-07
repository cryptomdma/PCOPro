import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCheckoutDto } from './dto';

@Injectable()
export class CheckoutService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCheckoutDto, selfCheckoutEnabled = false) {
    const linkedUser = await this.prisma.user.findFirst({ where: { technicianId: dto.technicianId } });
    if (!linkedUser) {
      throw new BadRequestException('Technician must be linked to a user profile');
    }
    const status = selfCheckoutEnabled ? 'issued' : 'requested';
    const request = await this.prisma.checkoutRequest.create({
      data: {
        requestDate: new Date(dto.requestDate),
        status,
        technicianId: dto.technicianId,
        lines: {
          create: dto.lines.map((line) => ({
            productId: line.productId,
            qtyRequested: line.qtyRequested,
            checkoutUnitLabel: line.checkoutUnitLabel,
          })),
        },
      },
      include: { lines: true },
    });

    if (selfCheckoutEnabled) {
      await this.finalize(request.id, dto.technicianId);
    }

    return request;
  }

  list() {
    return this.prisma.checkoutRequest.findMany({
      include: { lines: true },
      orderBy: { requestDate: 'desc' },
    });
  }

  detail(id: string) {
    return this.prisma.checkoutRequest.findUnique({
      where: { id },
      include: {
        lines: true,
        technician: {
          select: { id: true, name: true, technicianId: true, technician: { select: { licenseNumber: true } } },
        },
      },
    });
  }

  async finalize(id: string, actorId?: string) {
    const request = await this.prisma.checkoutRequest.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!request) return null;
    const scope = `TRUCK:${request.technicianId}`;

    for (const line of request.lines) {
      const product = await this.prisma.product.findUnique({ where: { id: line.productId } });
      if (!product) continue;
      const baseQty = line.qtyRequested * product.checkoutToBase;
      const balance = await this.prisma.inventoryBalance.upsert({
        where: { productId_scope: { productId: product.id, scope } },
        update: {},
        create: { productId: product.id, scope },
      });
      const after = balance.onHandBase - baseQty;
      await this.prisma.inventoryTransaction.create({
        data: {
          productId: product.id,
          scope,
          type: 'checkout_finalized',
          quantityBase: -baseQty,
          beforeBase: balance.onHandBase,
          afterBase: after,
          actorId,
          actorRole: actorId ? undefined : 'TECH',
          checkoutLineId: line.id,
          idempotencyKey: `checkout-${request.id}-${line.id}`,
        },
      });
      await this.prisma.checkoutLine.update({
        where: { id: line.id },
        data: { qtyIssued: line.qtyRequested, totalBaseQuantity: baseQty },
      });
      await this.prisma.inventoryBalance.update({ where: { id: balance.id }, data: { onHandBase: after } });
    }

    await this.prisma.checkoutRequest.update({ where: { id }, data: { status: 'issued' } });
    return this.prisma.checkoutRequest.findUnique({ where: { id }, include: { lines: true } });
  }
}
