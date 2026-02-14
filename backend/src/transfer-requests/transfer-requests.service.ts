import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  AcknowledgeDto,
  CancelTransferRequestDto,
  CreateTransferRequestDto,
  DisputeDto,
  ListTransferRequestsQuery,
  SendBackDto,
  UpdateTransferRequestDto,
} from './dto';
import { TransferDirection, TransferRequestStatus, Role } from '@prisma/client';
import { getUnitFactor, toBaseQuantity } from '../utils/units';

type CurrentUser = { userId: string; role: Role; technicianId?: string };

const OPEN_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.OPEN,
  TransferRequestStatus.SUBMITTED,
  TransferRequestStatus.ACK_PENDING,
  TransferRequestStatus.DISPUTED,
];
const EDITABLE_STATUSES: TransferRequestStatus[] = [TransferRequestStatus.OPEN, TransferRequestStatus.SUBMITTED];
const CLOSED_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.FINALIZED,
  TransferRequestStatus.ACKNOWLEDGED,
  TransferRequestStatus.REJECTED,
  TransferRequestStatus.CANCELED,
];

@Injectable()
export class TransferRequestsService {
  constructor(private prisma: PrismaService) {}

  private scopesFor(direction: TransferDirection, technicianId: string) {
    if (direction === 'ISSUE') {
      return { fromScope: 'WAREHOUSE', toScope: `TRUCK:${technicianId}` };
    }
    return { fromScope: `TRUCK:${technicianId}`, toScope: 'WAREHOUSE' };
  }

  async listRecipients() {
    return this.prisma.user.findMany({
      where: { technicianId: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        technicianId: true,
        technician: { select: { id: true, name: true, licenseNumber: true } },
      },
      orderBy: { name: 'asc' },
    });
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

    const linkedUser = await this.prisma.user.findFirst({ where: { technicianId } });
    if (!linkedUser) {
      throw new BadRequestException('Technician must be linked to a user profile');
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

  async update(id: string, dto: UpdateTransferRequestDto, user: CurrentUser) {
    if (!dto.lines?.length) {
      throw new BadRequestException('At least one line is required');
    }
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (!EDITABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Only open requests can be edited');
    }

    if (user.role === 'TECH') {
      if (!user.technicianId || request.technicianId !== user.technicianId) {
        throw new ForbiddenException('Technician can only edit their own open requests');
      }
    }

    const direction = dto.direction ?? request.direction;
    const { fromScope, toScope } = this.scopesFor(direction, request.technicianId);

    await this.prisma.$transaction(async (tx) => {
      await tx.transferRequestLine.deleteMany({ where: { transferRequestId: request.id } });
      await tx.transferRequest.update({
        where: { id: request.id },
        data: {
          direction,
          fromScope,
          toScope,
          reason: dto.reason ?? request.reason,
          lines: {
            create: dto.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitLabel: line.unitLabel,
            })),
          },
        },
      });
    });

    return this.detail(id, user);
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
    if (!user.technicianId || user.technicianId !== request.technicianId) {
      throw new ForbiddenException('Only the assigned recipient can acknowledge this request');
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

  async sendBack(id: string, user: CurrentUser, dto: SendBackDto) {
    if (!['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Only warehouse/manager/admin can send back requests');
    }
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (!EDITABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Only open requests can be sent back');
    }

    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: TransferRequestStatus.OPEN,
        disputeNote: dto.note?.trim() || request.disputeNote,
      },
    });
    return this.detail(id, user);
  }

  async cancel(id: string, user: CurrentUser, dto: CancelTransferRequestDto) {
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (CLOSED_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request is already closed');
    }
    if (!EDITABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Only open requests can be canceled or refused');
    }

    const isWarehouseRole = ['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user.role);
    const isTechOwner = user.role === 'TECH' && Boolean(user.technicianId && user.technicianId === request.technicianId);

    if (!isWarehouseRole && !isTechOwner) {
      throw new ForbiddenException('Not allowed to cancel or refuse this request');
    }

    const action = dto.action ?? (isWarehouseRole ? 'REFUSE' : 'CANCEL');
    if (action === 'REFUSE' && !isWarehouseRole) {
      throw new ForbiddenException('Only warehouse/manager/admin can refuse requests');
    }

    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: action === 'REFUSE' ? TransferRequestStatus.REJECTED : TransferRequestStatus.CANCELED,
        disputeNote: dto.note?.trim() || request.disputeNote,
      },
    });
    return this.detail(id, user);
  }
}
