import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateIncomingDto } from './dto';
import { getUnitFactor, toBaseQuantity } from '../utils/units';

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
      const factor = getUnitFactor(product, line.receivingUnitLabel, 'ordering');
      const baseDelta = toBaseQuantity(line.qtyReceived, factor);
      const balance = await this.prisma.inventoryBalance.upsert({
        where: { productId: product.id },
        update: {},
        create: { productId: product.id },
      });
      const after = balance.onHandBase + baseDelta;
      await this.prisma.inventoryTransaction.create({
        data: {
          productId: product.id,
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
        where: { productId: product.id },
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

  private async ensureSystemUser() {
    const sysEmail = 'system@pco.local';
    const user = await this.prisma.user.upsert({
      where: { email: sysEmail },
      update: {},
      create: { email: sysEmail, name: 'System', role: 'ADMIN' },
    });
    return user.id;
  }
}
