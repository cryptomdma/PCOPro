import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AcknowledgeDto, CreateTransferRequestDto, DisputeDto, ListTransferRequestsQuery } from './dto';
import { TransferDirection, TransferRequestStatus, Role } from '@prisma/client';
import { getUnitFactor, toBaseQuantity } from '../utils/units';
import { randomUUID } from 'crypto';

type CurrentUser = { userId: string; role: Role; technicianId?: string };

const OPEN_STATUSES = [TransferRequestStatus.SUBMITTED, TransferRequestStatus.ACK_PENDING, TransferRequestStatus.DISPUTED];

@Injectable()
export class TransferRequestsService {
  constructor(private prisma: PrismaService) {}

  private scopesFor(direction: TransferDirection, technicianId: string) {
    if (direction === 'ISSUE') {
      return { fromScope: 'WAREHOUSE', toScope: `TRUCK:${technicianId}` };
    }
    return { fromScope: `TRUCK:${technicianId}`, toScope: 'WAREHOUSE' };
  }

  async create(dto: CreateTransferRequestDto, user: CurrentUser) {
    const { technicianId } = dto;
    if (user.role === 'TECH' && user.technicianId !== technicianId) {
      throw new ForbiddenException('Tech may only create for self');
    }
    if (user.role === 'TECH') {
      if (dto.direction === 'ISSUE' && this.scopesFor(dto.direction, technicianId).fromScope !== 'WAREHOUSE') {
        throw new ForbiddenException('Invalid scope');
      }
      if (dto.direction === 'RETURN' && this.scopesFor(dto.direction, technicianId).toScope !== 'WAREHOUSE') {
        throw new ForbiddenException('Invalid scope');
      }
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one line is required');
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.transferRequest.findUnique({
        where: { requestIdempotencyKey: dto.idempotencyKey },
        include: { lines: true },
      });
      if (existing) return existing;
    }

    const tech = await this.prisma.technician.findUnique({ where: { id: technicianId } });
    if (!tech || !tech.active) throw new BadRequestException('Technician not found or inactive');

    const { fromScope, toScope } = this.scopesFor(dto.direction, technicianId);

    return this.prisma.transferRequest.create({
      data: {
        direction: dto.direction,
        technicianId,
        createdByUserId: user.userId,
        fromScope,
        toScope,
        reason: dto.reason,
        requestIdempotencyKey: dto.idempotencyKey,
        lines: {
          create: dto.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitLabel: line.unitLabel,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async list(query: ListTransferRequestsQuery, user: CurrentUser) {
    const where: any = {};
    if (user.role === 'TECH') {
      if (!user.technicianId) throw new ForbiddenException('Tech profile missing technicianId');
      where.technicianId = user.technicianId;
    } else if (query.technicianId) {
      where.technicianId = query.technicianId;
    }
    if (query.direction) {
      where.direction = query.direction;
    }
    if (query.status) {
      const statuses = query.status.split(',').map((s) => s.trim().toUpperCase()) as TransferRequestStatus[];
      where.status = { in: statuses };
    } else if (!query.includeClosed) {
      where.status = { in: OPEN_STATUSES };
    }
    if (query.from) {
      where.createdAt = { ...(where.createdAt ?? {}), gte: query.from };
    }
    if (query.to) {
      where.createdAt = { ...(where.createdAt ?? {}), lte: query.to };
    }

    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 50;

    return this.prisma.transferRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } }, technician: true, createdByUser: true },
      take: limit,
    });
  }

  async detail(id: string, user: CurrentUser) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: {
        lines: { include: { product: { select: { name: true, category: true } } } },
        technician: true,
        createdByUser: true,
        finalizedByUser: true,
        acknowledgedByUser: true,
      },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (user.role === 'TECH' && request.technicianId !== user.technicianId) {
      throw new ForbiddenException('Not allowed');
    }
    return request;
  }

  async finalize(id: string, user: CurrentUser) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: { lines: true, technician: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status === 'FINALIZED' || request.status === 'ACK_PENDING' || request.status === 'ACKNOWLEDGED') {
      return request;
    }
    if (request.status !== 'SUBMITTED' && request.status !== 'OPEN' && request.status !== 'DISPUTED') {
      throw new BadRequestException('Request not ready for finalize');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of request.lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product) continue;
        const factor = getUnitFactor(product, line.unitLabel, 'tracking');
        const qtyBase = toBaseQuantity(line.quantity, factor);
        const transferGroupId = request.id;
        const { fromScope, toScope } = this.scopesFor(request.direction, request.technicianId);

        const fromBalance = await tx.inventoryBalance.upsert({
          where: { productId_scope: { productId: product.id, scope: fromScope } },
          update: {},
          create: { productId: product.id, scope: fromScope },
        });
        const toBalance = await tx.inventoryBalance.upsert({
          where: { productId_scope: { productId: product.id, scope: toScope } },
          update: {},
          create: { productId: product.id, scope: toScope },
        });

        const fromAfter = fromBalance.onHandBase - qtyBase;
        const toAfter = (toBalance.onHandBase ?? 0) + qtyBase;

        await tx.inventoryTransaction.create({
          data: {
            productId: product.id,
            scope: fromScope,
            type: 'transfer',
            quantityBase: -qtyBase,
            beforeBase: fromBalance.onHandBase,
            afterBase: fromAfter,
            reason: request.reason,
            actorId: user.userId,
            actorRole: user.role,
            transferGroupId,
            transferIdempotencyKey: request.id,
            idempotencyKey: `${request.id}:${line.id}:OUT`,
          },
        });
        await tx.inventoryTransaction.create({
          data: {
            productId: product.id,
            scope: toScope,
            type: 'transfer',
            quantityBase: qtyBase,
            beforeBase: toBalance.onHandBase,
            afterBase: toAfter,
            reason: request.reason,
            actorId: user.userId,
            actorRole: user.role,
            transferGroupId,
            transferIdempotencyKey: request.id,
            idempotencyKey: `${request.id}:${line.id}:IN`,
          },
        });

        await tx.inventoryBalance.update({ where: { id: fromBalance.id }, data: { onHandBase: fromAfter } });
        await tx.inventoryBalance.update({ where: { id: toBalance.id }, data: { onHandBase: toAfter } });
      }

      await tx.transferRequest.update({
        where: { id },
        data: {
          finalizedAt: new Date(),
          finalizedByUserId: user.userId,
          status: request.direction === 'ISSUE' ? 'ACK_PENDING' : 'FINALIZED',
        },
      });
    });

    return this.detail(id, user);
  }

  async acknowledge(id: string, user: CurrentUser, dto: AcknowledgeDto) {
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (user.role !== 'TECH' || user.technicianId !== request.technicianId) {
      throw new ForbiddenException('Technician can only acknowledge their own request');
    }
    if (request.status !== 'ACK_PENDING') {
      throw new BadRequestException('Nothing to acknowledge');
    }
    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedByUserId: user.userId,
        disputeNote: dto.note ?? request.disputeNote,
      },
    });
    return this.detail(id, user);
  }

  async dispute(id: string, user: CurrentUser, dto: DisputeDto) {
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (user.role !== 'TECH' || user.technicianId !== request.technicianId) {
      throw new ForbiddenException('Technician can only dispute their own request');
    }
    if (request.status !== 'ACK_PENDING') {
      throw new BadRequestException('Cannot dispute at this stage');
    }
    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: 'DISPUTED',
        disputeNote: dto.note,
      },
    });
    return this.detail(id, user);
  }
}
