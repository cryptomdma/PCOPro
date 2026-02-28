import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus, PurchaseOrderType } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { toBaseQuantity } from '../utils/units';
import { CreatePurchaseOrderDto, ReceiveAgainstPoDto, UpdatePurchaseOrderDto } from './dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async lowStock(scopeRaw?: string) {
    const scope = scopeRaw?.trim() || 'WAREHOUSE';
    const parLevels = await this.prisma.parLevel.findMany({
      where: { locationScope: scope },
      include: { product: { include: { balances: true } } },
      orderBy: { product: { name: 'asc' } },
    });

    return parLevels
      .map((par) => {
        const balance = par.product.balances.find((b) => b.scope === scope);
        const onHandBase = balance?.onHandBase ?? 0;
        if (onHandBase >= par.parBase) {
          return null;
        }
        const shortageBase = par.parBase - onHandBase;
        const orderingToBase = par.product.orderingToBase || 1;
        const suggestedOrderQty = Math.ceil(shortageBase / orderingToBase);
        return {
          productId: par.productId,
          productName: par.product.name,
          scope,
          onHandBase,
          parBase: par.parBase,
          shortageBase,
          orderingUnitLabel: par.product.orderingUnitLabel,
          suggestedOrderQty,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async list(params?: { statuses?: string; supplierId?: string; take?: number; skip?: number }) {
    const take = params?.take && params.take > 0 ? Math.min(params.take, 200) : 100;
    const skip = params?.skip && params.skip > 0 ? params.skip : 0;
    const statuses = this.parseStatuses(params?.statuses);
    const where: Prisma.PurchaseOrderWhereInput = {};
    if (statuses.length) {
      where.status = { in: statuses };
    }
    if (params?.supplierId?.trim()) {
      where.supplierId = params.supplierId.trim();
    }

    return this.prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        supplier: true,
        createdBy: { select: { id: true, email: true, name: true, role: true } },
        lines: {
          include: { product: { select: { id: true, name: true, orderingUnitLabel: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async get(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        createdBy: { select: { id: true, email: true, name: true, role: true } },
        lines: {
          include: {
            product: {
              select: { id: true, name: true, orderingUnitLabel: true, orderingToBase: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    return po;
  }

  async create(dto: CreatePurchaseOrderDto, actor?: { userId?: string }) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) {
      throw new BadRequestException('Supplier not found');
    }
    if (dto.orderType === 'EMAIL' && !supplier.email) {
      throw new BadRequestException('Supplier email is required for EMAIL order type.');
    }

    const actorId = actor?.userId ?? (await this.ensureSystemUser());
    const preparedLines = await this.prepareLines(dto.lines);
    const status = dto.status ?? PurchaseOrderStatus.DRAFT;
    const placedAt = status === PurchaseOrderStatus.PLACED ? new Date() : null;

    return this.prisma.purchaseOrder.create({
      data: {
        supplierId: dto.supplierId,
        shipToScope: dto.shipToScope?.trim() || 'WAREHOUSE',
        status,
        orderType: dto.orderType ?? PurchaseOrderType.EMAIL,
        externalOrderRef: dto.externalOrderRef?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdById: actorId,
        placedAt,
        lines: {
          create: preparedLines.map((line) => ({
            productId: line.productId,
            qtyOrdered: line.qtyOrdered,
            qtyOrderedBase: line.qtyOrderedBase,
          })),
        },
      },
      include: {
        supplier: true,
        createdBy: { select: { id: true, email: true, name: true, role: true } },
        lines: { include: { product: true }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const existing = await this.get(id);
    if (existing.status === PurchaseOrderStatus.RECEIVED || existing.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('Closed purchase orders cannot be edited.');
    }

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) {
        throw new BadRequestException('Supplier not found');
      }
      if ((dto.orderType ?? existing.orderType) === 'EMAIL' && !supplier.email) {
        throw new BadRequestException('Supplier email is required for EMAIL order type.');
      }
    }

    if (!dto.supplierId && dto.orderType === 'EMAIL') {
      if (!existing.supplier.email) {
        throw new BadRequestException('Supplier email is required for EMAIL order type.');
      }
    }

    const replacingLines = Array.isArray(dto.lines);
    const hasReceivedQty = existing.lines.some((line) => line.qtyReceivedBase > 0);
    if (replacingLines && hasReceivedQty) {
      throw new BadRequestException('Cannot replace PO lines after receiving has started.');
    }

    const preparedLines = replacingLines ? await this.prepareLines(dto.lines ?? []) : [];
    const nextStatus = dto.status ?? existing.status;
    const placedAt = nextStatus === PurchaseOrderStatus.PLACED && !existing.placedAt ? new Date() : existing.placedAt;

    return this.prisma.$transaction(async (tx) => {
      if (replacingLines) {
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      }

      const po = await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: dto.supplierId,
          shipToScope: dto.shipToScope?.trim(),
          status: nextStatus,
          orderType: dto.orderType,
          externalOrderRef: dto.externalOrderRef === undefined ? undefined : dto.externalOrderRef.trim() || null,
          notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
          placedAt,
        },
      });

      if (replacingLines) {
        await tx.purchaseOrderLine.createMany({
          data: preparedLines.map((line) => ({
            purchaseOrderId: id,
            productId: line.productId,
            qtyOrdered: line.qtyOrdered,
            qtyOrderedBase: line.qtyOrderedBase,
            qtyReceived: 0,
            qtyReceivedBase: 0,
          })),
        });
      }

      return po;
    });
  }

  async cancel(id: string) {
    await this.get(id);
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
    });
  }

  async receive(id: string, dto: ReceiveAgainstPoDto, actor?: { userId?: string; role?: string }) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: { include: { product: true } }, supplier: true },
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    if (po.status === PurchaseOrderStatus.CANCELLED || po.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException('This purchase order cannot receive additional quantities.');
    }

    const receiptDate = new Date(dto.receiptDate);
    if (Number.isNaN(receiptDate.getTime())) {
      throw new BadRequestException('Invalid receipt date.');
    }
    const scope = dto.scope?.trim() || po.shipToScope;

    const receiveByLineId = new Map<string, number>();
    for (const line of dto.lines ?? []) {
      if (receiveByLineId.has(line.lineId)) {
        throw new BadRequestException(`Duplicate lineId in payload: ${line.lineId}`);
      }
      receiveByLineId.set(line.lineId, line.qtyReceived);
    }

    const selectedLines = po.lines
      .filter((line) => receiveByLineId.has(line.id))
      .map((line) => {
        const qtyReceived = receiveByLineId.get(line.id) ?? 0;
        const remaining = Math.max(0, line.qtyOrdered - line.qtyReceived);
        if (qtyReceived <= 0) {
          throw new BadRequestException('qtyReceived must be greater than 0.');
        }
        if (qtyReceived > remaining) {
          throw new BadRequestException(`Received quantity exceeds remaining for ${line.product.name}.`);
        }
        const qtyBase = toBaseQuantity(qtyReceived, line.product.orderingToBase);
        return {
          lineId: line.id,
          productId: line.productId,
          productName: line.product.name,
          orderingUnitLabel: line.product.orderingUnitLabel,
          qtyReceived,
          qtyBase,
        };
      });

    if (!selectedLines.length) {
      throw new BadRequestException('At least one PO line must be received.');
    }

    const receiptKeyDate = receiptDate.toISOString().slice(0, 10);
    const hashSeed = JSON.stringify({
      purchaseOrderId: po.id,
      scope,
      receiptDate: receiptKeyDate,
      lines: selectedLines
        .map((line) => ({ lineId: line.lineId, qtyBase: line.qtyBase }))
        .sort((a, b) => a.lineId.localeCompare(b.lineId)),
    });
    const batchHash = createHash('sha256').update(hashSeed).digest('hex');
    const lineKeys = selectedLines.map((line) => ({
      ...line,
      idempotencyKey: `po_receiving:${po.id}:${batchHash}:${line.productId}`,
    }));

    const existingTransactions = await this.prisma.inventoryTransaction.findMany({
      where: { idempotencyKey: { in: lineKeys.map((line) => line.idempotencyKey) } },
      select: { idempotencyKey: true },
    });
    const existingSet = new Set(existingTransactions.map((tx) => tx.idempotencyKey));
    const linesToPost = lineKeys.filter((line) => !existingSet.has(line.idempotencyKey));
    const skippedCount = lineKeys.length - linesToPost.length;

    if (!linesToPost.length) {
      return {
        purchaseOrderId: po.id,
        postedCount: 0,
        skippedCount,
        receiptKey: `po_receiving:${po.id}:${batchHash}`,
      };
    }

    const actorId = actor?.userId ?? (await this.ensureSystemUser());
    const actorRole = actor?.role ?? 'ADMIN';
    const receiptKey = `po_receiving:${po.id}:${batchHash}`;

    await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.incomingReceipt.create({
        data: {
          receiptDate,
          supplier: po.supplier.name,
          status: 'posted',
          createdById: actorId,
          postedAt: new Date(),
          purchaseOrderId: po.id,
          lines: {
            create: linesToPost.map((line) => ({
              productId: line.productId,
              qtyOrdered: line.qtyReceived,
              qtyReceived: line.qtyReceived,
              backorderedQty: 0,
              receivingUnitLabel: line.orderingUnitLabel,
            })),
          },
        },
        include: { lines: true },
      });

      for (const line of receipt.lines) {
        const source = linesToPost.find((item) => item.productId === line.productId);
        if (!source) continue;

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
            reason: `PO receive: ${po.id}`,
          },
        });
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { onHandBase: after },
        });

        await tx.purchaseOrderLine.update({
          where: { id: source.lineId },
          data: {
            qtyReceived: { increment: source.qtyReceived },
            qtyReceivedBase: { increment: source.qtyBase },
          },
        });
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: po.id },
        select: { qtyOrderedBase: true, qtyReceivedBase: true },
      });
      const allReceived = updatedLines.every((line) => line.qtyReceivedBase >= line.qtyOrderedBase);
      const anyReceived = updatedLines.some((line) => line.qtyReceivedBase > 0);
      let nextStatus = po.status;
      if (allReceived && updatedLines.length > 0) {
        nextStatus = PurchaseOrderStatus.RECEIVED;
      } else if (anyReceived) {
        nextStatus = PurchaseOrderStatus.PARTIALLY_RECEIVED;
      }

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: nextStatus,
          placedAt: po.placedAt ?? new Date(),
          receivedAt: nextStatus === PurchaseOrderStatus.RECEIVED ? new Date() : null,
        },
      });
    });

    return {
      purchaseOrderId: po.id,
      postedCount: linesToPost.length,
      skippedCount,
      receiptKey,
    };
  }

  async exportForm(id: string) {
    const po = await this.get(id);
    const header = [
      `PO ID,${this.escapeCsv(po.id)}`,
      `Supplier,${this.escapeCsv(po.supplier.name)}`,
      `Supplier Email,${this.escapeCsv(po.supplier.email ?? '')}`,
      `Order Type,${this.escapeCsv(po.orderType)}`,
      `Status,${this.escapeCsv(po.status)}`,
      `Ship To Scope,${this.escapeCsv(po.shipToScope)}`,
      `Created At,${this.escapeCsv(po.createdAt.toISOString())}`,
      `External Ref,${this.escapeCsv(po.externalOrderRef ?? '')}`,
      `Notes,${this.escapeCsv(po.notes ?? '')}`,
      '',
      'Product ID,Product Name,Qty Ordered,Qty Received,Ordering Unit',
    ];
    const lines = po.lines.map((line) =>
      [
        this.escapeCsv(line.productId),
        this.escapeCsv(line.product.name),
        this.escapeCsv(String(line.qtyOrdered)),
        this.escapeCsv(String(line.qtyReceived)),
        this.escapeCsv(line.product.orderingUnitLabel),
      ].join(','),
    );
    const csv = [...header, ...lines].join('\n');
    return {
      filename: `purchase-order-${po.id}.csv`,
      csv,
    };
  }

  private parseStatuses(raw?: string) {
    if (!raw?.trim()) return [];
    const statuses = raw
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    const valid = new Set(Object.values(PurchaseOrderStatus));
    return statuses.filter((status): status is PurchaseOrderStatus => valid.has(status as PurchaseOrderStatus));
  }

  private async prepareLines(lines: Array<{ productId: string; qtyOrdered: number }>) {
    const productIds = Array.from(new Set(lines.map((line) => line.productId)));
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map((product) => [product.id, product]));

    return lines.map((line) => {
      const product = productById.get(line.productId);
      if (!product) {
        throw new BadRequestException(`Product not found: ${line.productId}`);
      }
      if (!Number.isInteger(line.qtyOrdered) || line.qtyOrdered <= 0) {
        throw new BadRequestException(`qtyOrdered must be a whole number > 0 for ${product.name}`);
      }
      const qtyOrderedBase = toBaseQuantity(line.qtyOrdered, product.orderingToBase);
      if (qtyOrderedBase <= 0) {
        throw new BadRequestException(`Invalid ordering conversion for ${product.name}`);
      }
      return {
        productId: line.productId,
        qtyOrdered: line.qtyOrdered,
        qtyOrderedBase,
      };
    });
  }

  private escapeCsv(value: string) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
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
