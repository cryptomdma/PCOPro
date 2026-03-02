import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  AcknowledgeDto,
  ApproveTransferDto,
  CancelTransferRequestDto,
  CreateTransferRequestDto,
  DisputeDto,
  FinalizeTransferDto,
  ListTransferRequestsQuery,
  ResolveDisputeDto,
  SendBackDto,
  UpdateTransferRequestDto,
} from './dto';
import { DisputeReason, DisputeStatus, Prisma, Role, TransferDirection, TransferRequestStatus } from '@prisma/client';
import { getUnitFactor, toBaseQuantity } from '../utils/units';
import { mkdir, writeFile, stat } from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import * as path from 'path';

type CurrentUser = { userId: string; role: Role; technicianId?: string };
type RequestEditPayload = {
  direction: TransferDirection;
  reason?: string;
  pickupDate: string;
  lines: Array<{ productId: string; quantity: number; unitLabel: string }>;
};

const OPEN_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.OPEN,
  TransferRequestStatus.SUBMITTED,
  TransferRequestStatus.APPROVAL_PENDING,
  TransferRequestStatus.APPROVED,
  TransferRequestStatus.CHANGE_REQUESTED,
  TransferRequestStatus.ACK_PENDING,
  TransferRequestStatus.DISPUTED,
];
const TECH_DIRECT_EDIT_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.OPEN,
  TransferRequestStatus.SUBMITTED,
  TransferRequestStatus.APPROVAL_PENDING,
];
const NON_TECH_EDIT_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.OPEN,
  TransferRequestStatus.SUBMITTED,
  TransferRequestStatus.APPROVAL_PENDING,
  TransferRequestStatus.APPROVED,
  TransferRequestStatus.CHANGE_REQUESTED,
];
const CLOSED_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.FINALIZED,
  TransferRequestStatus.ACK_PENDING,
  TransferRequestStatus.ACKNOWLEDGED,
  TransferRequestStatus.REJECTED,
  TransferRequestStatus.CANCELED,
];
const DISPUTE_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'disputes');
const ALLOWED_DISPUTE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DISPUTE_PHOTO_BYTES = 5 * 1024 * 1024;

@Injectable()
export class TransferRequestsService {
  constructor(private prisma: PrismaService) {}

  private assertRequestReadableByUser(
    request: { technicianId: string },
    user: CurrentUser,
  ) {
    if (user.role === Role.TECH && request.technicianId !== user.technicianId) {
      throw new ForbiddenException('Not allowed');
    }
  }

  private async saveDisputePhoto(
    requestId: string,
    file?: { originalname?: string; mimetype?: string; size?: number; buffer: Buffer },
  ): Promise<string | null> {
    if (!file) return null;
    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded photo is empty');
    }
    if (!file.mimetype || !ALLOWED_DISPUTE_MIME.has(file.mimetype)) {
      throw new BadRequestException('Dispute photo must be JPG, PNG, or WEBP');
    }
    if ((file.size ?? file.buffer.length) > MAX_DISPUTE_PHOTO_BYTES) {
      throw new BadRequestException('Dispute photo must be 5MB or smaller');
    }
    await mkdir(DISPUTE_UPLOAD_DIR, { recursive: true });
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const digest = createHash('sha1').update(file.buffer).digest('hex').slice(0, 10);
    const filename = `${requestId}-${Date.now()}-${randomUUID().slice(0, 8)}-${digest}.${ext}`;
    const absolutePath = path.join(DISPUTE_UPLOAD_DIR, filename);
    await writeFile(absolutePath, file.buffer);
    return path.join('uploads', 'disputes', filename).replace(/\\/g, '/');
  }

  private scopesFor(direction: TransferDirection, technicianId: string) {
    if (direction === 'ISSUE') {
      return { fromScope: 'WAREHOUSE', toScope: `TRUCK:${technicianId}` };
    }
    return { fromScope: `TRUCK:${technicianId}`, toScope: 'WAREHOUSE' };
  }

  private parsePickupDate(value?: Date) {
    const pickupDate = value ? new Date(value) : new Date();
    if (Number.isNaN(pickupDate.getTime())) {
      throw new BadRequestException('Invalid pickupDate');
    }
    return pickupDate;
  }

  private isFutureDate(date: Date) {
    return date.getTime() > Date.now();
  }

  private buildEditPayload(dto: UpdateTransferRequestDto, fallback: { direction: TransferDirection; reason?: string | null; pickupDate: Date }) {
    if (!dto.lines?.length) {
      throw new BadRequestException('At least one line is required');
    }
    const pickupDate = dto.pickupDate ? this.parsePickupDate(dto.pickupDate) : fallback.pickupDate;
    return {
      direction: dto.direction ?? fallback.direction,
      reason: dto.reason ?? fallback.reason ?? undefined,
      pickupDate,
      lines: dto.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitLabel: line.unitLabel,
      })),
    };
  }

  private parseChangePayload(raw: Prisma.JsonValue | null): RequestEditPayload {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('No pending change payload');
    }
    const payload = raw as any;
    if (!payload.direction || !Array.isArray(payload.lines) || !payload.pickupDate) {
      throw new BadRequestException('Invalid pending change payload');
    }
    return payload as RequestEditPayload;
  }

  private async applyEdits(
    tx: Prisma.TransactionClient,
    requestId: string,
    technicianId: string,
    payload: { direction: TransferDirection; reason?: string; pickupDate: Date; lines: Array<{ productId: string; quantity: number; unitLabel: string }> },
    extraData?: Prisma.TransferRequestUpdateInput,
  ) {
    const { fromScope, toScope } = this.scopesFor(payload.direction, technicianId);
    await tx.transferRequestLine.deleteMany({ where: { transferRequestId: requestId } });
    await tx.transferRequest.update({
      where: { id: requestId },
      data: {
        direction: payload.direction,
        fromScope,
        toScope,
        pickupDate: payload.pickupDate,
        reason: payload.reason,
        lines: {
          create: payload.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitLabel: line.unitLabel,
          })),
        },
        ...extraData,
      },
    });
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
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one line is required');
    }
    const pickupDate = this.parsePickupDate(dto.pickupDate);

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
    const status = this.isFutureDate(pickupDate) ? TransferRequestStatus.APPROVAL_PENDING : TransferRequestStatus.SUBMITTED;

    return this.prisma.transferRequest.create({
      data: {
        direction: dto.direction,
        technicianId,
        createdByUserId: user.userId,
        fromScope,
        toScope,
        reason: dto.reason,
        pickupDate,
        status,
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
    if (query.disputesOnly) {
      where.disputeStatus = { in: [DisputeStatus.OPEN, DisputeStatus.MANAGER_RESPONDED, DisputeStatus.RESOLVED] };
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
        approvedByUser: true,
        finalizedByUser: true,
        acknowledgedByUser: true,
      },
    });
    if (!request) throw new NotFoundException('Request not found');
    this.assertRequestReadableByUser(request, user);
    return request;
  }

  async update(id: string, dto: UpdateTransferRequestDto, user: CurrentUser) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (CLOSED_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request can no longer be edited');
    }

    if (user.role === 'TECH') {
      if (!user.technicianId || request.technicianId !== user.technicianId) {
        throw new ForbiddenException('Technician can only edit their own requests');
      }
      const payload = this.buildEditPayload(dto, request);
      if (request.status === TransferRequestStatus.APPROVED || request.status === TransferRequestStatus.CHANGE_REQUESTED) {
        await this.prisma.transferRequest.update({
          where: { id: request.id },
          data: {
            status: TransferRequestStatus.CHANGE_REQUESTED,
            changeRequestedAt: new Date(),
            changeRequestNote: dto.reason ?? request.changeRequestNote,
            changeRequestPayload: {
              direction: payload.direction,
              reason: payload.reason,
              pickupDate: payload.pickupDate.toISOString(),
              lines: payload.lines,
            },
          },
        });
        return this.detail(id, user);
      }

      if (!TECH_DIRECT_EDIT_STATUSES.includes(request.status)) {
        throw new BadRequestException('Request is not editable at this stage');
      }

      await this.prisma.$transaction(async (tx) => {
        await this.applyEdits(tx, request.id, request.technicianId, payload, {
          status: this.isFutureDate(payload.pickupDate) ? TransferRequestStatus.APPROVAL_PENDING : TransferRequestStatus.SUBMITTED,
          approvedAt: null,
          approvedByUser: { disconnect: true },
          changeRequestedAt: null,
          changeRequestNote: null,
          changeRequestPayload: Prisma.DbNull,
        });
      });
      return this.detail(id, user);
    }

    if (!NON_TECH_EDIT_STATUSES.includes(request.status)) {
      throw new BadRequestException('Only open/in-progress requests can be edited');
    }
    const payload = this.buildEditPayload(dto, request);
    await this.prisma.$transaction(async (tx) => {
      await this.applyEdits(tx, request.id, request.technicianId, payload, {
        status: this.isFutureDate(payload.pickupDate) ? TransferRequestStatus.APPROVAL_PENDING : TransferRequestStatus.SUBMITTED,
        changeRequestedAt: null,
        changeRequestNote: null,
        changeRequestPayload: Prisma.DbNull,
      });
    });
    return this.detail(id, user);
  }

  async approve(id: string, user: CurrentUser, dto: ApproveTransferDto) {
    if (!['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Only warehouse/manager/admin can approve');
    }
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== TransferRequestStatus.APPROVAL_PENDING) {
      throw new BadRequestException('Request is not awaiting approval');
    }
    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: TransferRequestStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUser: { connect: { id: user.userId } },
        changeRequestNote: dto.note?.trim() || request.changeRequestNote,
        fulfillmentNote: dto.fulfillmentNote?.trim() || request.fulfillmentNote,
      },
    });
    return this.detail(id, user);
  }

  async deny(id: string, user: CurrentUser, dto: ApproveTransferDto) {
    if (!['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Only warehouse/manager/admin can deny');
    }
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== TransferRequestStatus.APPROVAL_PENDING) {
      throw new BadRequestException('Request is not awaiting approval');
    }
    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: TransferRequestStatus.REJECTED,
        changeRequestNote: dto.note?.trim() || request.changeRequestNote,
      },
    });
    return this.detail(id, user);
  }

  async approveChanges(id: string, user: CurrentUser, dto: ApproveTransferDto) {
    if (!['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Only warehouse/manager/admin can approve changes');
    }
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== TransferRequestStatus.CHANGE_REQUESTED) {
      throw new BadRequestException('Request has no pending change request');
    }
    const payload = this.parseChangePayload(request.changeRequestPayload);
    const pickupDate = this.parsePickupDate(new Date(payload.pickupDate));
    await this.prisma.$transaction(async (tx) => {
      await this.applyEdits(
        tx,
        request.id,
        request.technicianId,
        {
          direction: payload.direction,
          reason: payload.reason,
          pickupDate,
          lines: payload.lines,
        },
        {
          status: TransferRequestStatus.APPROVED,
          approvedAt: new Date(),
          approvedByUser: { connect: { id: user.userId } },
          changeRequestedAt: null,
          changeRequestNote: dto.note?.trim() || request.changeRequestNote,
          changeRequestPayload: Prisma.DbNull,
          fulfillmentNote: dto.fulfillmentNote?.trim() || request.fulfillmentNote,
        },
      );
    });
    return this.detail(id, user);
  }

  async denyChanges(id: string, user: CurrentUser, dto: ApproveTransferDto) {
    if (!['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Only warehouse/manager/admin can deny changes');
    }
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== TransferRequestStatus.CHANGE_REQUESTED) {
      throw new BadRequestException('Request has no pending change request');
    }
    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: TransferRequestStatus.APPROVED,
        changeRequestedAt: null,
        changeRequestNote: dto.note?.trim() || request.changeRequestNote,
        changeRequestPayload: Prisma.DbNull,
      },
    });
    return this.detail(id, user);
  }

  async finalize(id: string, user: CurrentUser, dto: FinalizeTransferDto) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: { lines: true, technician: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status === TransferRequestStatus.FINALIZED || request.status === TransferRequestStatus.ACK_PENDING || request.status === TransferRequestStatus.ACKNOWLEDGED) {
      return request;
    }
    if (request.status === TransferRequestStatus.APPROVAL_PENDING || request.status === TransferRequestStatus.CHANGE_REQUESTED) {
      throw new BadRequestException('Request requires approval before finalize');
    }
    if (this.isFutureDate(request.pickupDate) && request.status !== TransferRequestStatus.APPROVED) {
      throw new BadRequestException('Future pickup requests must be approved before finalize');
    }
    if (
      request.status !== TransferRequestStatus.SUBMITTED &&
      request.status !== TransferRequestStatus.OPEN &&
      request.status !== TransferRequestStatus.DISPUTED &&
      request.status !== TransferRequestStatus.APPROVED
    ) {
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
          fulfillmentNote: dto.fulfillmentNote?.trim() || request.fulfillmentNote,
          status: request.direction === TransferDirection.ISSUE ? TransferRequestStatus.ACK_PENDING : TransferRequestStatus.FINALIZED,
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
    if (request.status !== TransferRequestStatus.ACK_PENDING) {
      throw new BadRequestException('Nothing to acknowledge');
    }
    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: TransferRequestStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedByUserId: user.userId,
      },
    });
    return this.detail(id, user);
  }

  async dispute(
    id: string,
    user: CurrentUser,
    dto: DisputeDto,
    file?: { originalname?: string; mimetype?: string; size?: number; buffer: Buffer },
  ) {
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (user.role !== Role.TECH || user.technicianId !== request.technicianId) {
      throw new ForbiddenException('Technician can only dispute their own request');
    }
    if (request.status !== TransferRequestStatus.ACK_PENDING && request.status !== TransferRequestStatus.FINALIZED) {
      throw new BadRequestException('Cannot dispute at this stage');
    }
    if (request.disputeStatus === DisputeStatus.OPEN || request.disputeStatus === DisputeStatus.MANAGER_RESPONDED) {
      throw new BadRequestException('An active dispute already exists for this request');
    }
    if (dto.reason === DisputeReason.OTHER && !dto.note?.trim()) {
      throw new BadRequestException('Dispute note is required when reason is OTHER');
    }
    const disputePhotoPath = await this.saveDisputePhoto(id, file);
    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        disputeStatus: DisputeStatus.OPEN,
        disputeReason: dto.reason,
        disputeNote: dto.note?.trim() || null,
        disputePhotoPath,
        disputeOpenedAt: new Date(),
        disputeOpenedByUserId: user.userId,
        disputeResolutionNote: null,
        disputeResolvedAt: null,
        disputeResolvedByUserId: null,
      },
    });
    return this.detail(id, user);
  }

  async disputeDetail(id: string, user: CurrentUser) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: {
        technician: true,
        disputeOpenedByUser: { select: { id: true, name: true, email: true, role: true } },
        disputeResolvedByUser: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!request) throw new NotFoundException('Request not found');
    this.assertRequestReadableByUser(request, user);
    return {
      requestId: request.id,
      status: request.status,
      disputeStatus: request.disputeStatus,
      disputeReason: request.disputeReason,
      disputeNote: request.disputeNote,
      disputePhotoUrl: request.disputePhotoPath ? `/api/v1/transfer-requests/${request.id}/dispute-photo` : null,
      disputeOpenedAt: request.disputeOpenedAt,
      disputeOpenedByUser: request.disputeOpenedByUser,
      disputeResolutionNote: request.disputeResolutionNote,
      disputeResolvedAt: request.disputeResolvedAt,
      disputeResolvedByUser: request.disputeResolvedByUser,
    };
  }

  async resolveDispute(id: string, user: CurrentUser, dto: ResolveDisputeDto) {
    if (user.role === Role.TECH) {
      throw new ForbiddenException('Only non-tech roles can resolve disputes');
    }
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.disputeStatus !== DisputeStatus.OPEN && request.disputeStatus !== DisputeStatus.MANAGER_RESPONDED) {
      throw new BadRequestException('No open dispute to resolve');
    }
    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        disputeStatus: DisputeStatus.RESOLVED,
        disputeResolutionNote: dto.resolutionNote.trim(),
        disputeResolvedAt: new Date(),
        disputeResolvedByUserId: user.userId,
      },
    });
    return this.disputeDetail(id, user);
  }

  async getDisputePhoto(id: string, user: CurrentUser) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      select: { id: true, technicianId: true, disputePhotoPath: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    this.assertRequestReadableByUser(request, user);
    if (!request.disputePhotoPath) {
      throw new NotFoundException('No dispute photo found');
    }
    const absolutePath = path.resolve(process.cwd(), request.disputePhotoPath);
    const expectedRoot = path.resolve(process.cwd(), 'uploads', 'disputes');
    if (!absolutePath.startsWith(expectedRoot)) {
      throw new ForbiddenException('Invalid dispute photo path');
    }
    try {
      await stat(absolutePath);
    } catch {
      throw new NotFoundException('Dispute photo file is missing');
    }
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { absolutePath, mimeType };
  }

  async sendBack(id: string, user: CurrentUser, dto: SendBackDto) {
    if (!['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Only warehouse/manager/admin can send back requests');
    }
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (CLOSED_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request is already closed');
    }

    await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: TransferRequestStatus.OPEN,
        changeRequestNote: dto.note?.trim() || request.changeRequestNote,
        changeRequestedAt: null,
        changeRequestPayload: Prisma.DbNull,
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
    if (!NON_TECH_EDIT_STATUSES.includes(request.status) && request.status !== TransferRequestStatus.OPEN) {
      throw new BadRequestException('Only open requests can be canceled or refused');
    }

    const isWarehouseRole = ['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user.role);
    const isTechOwner = user.role === Role.TECH && Boolean(user.technicianId && user.technicianId === request.technicianId);

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
        changeRequestNote: dto.note?.trim() || request.changeRequestNote,
      },
    });
    return this.detail(id, user);
  }
}
