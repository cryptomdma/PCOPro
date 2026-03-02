import { Body, Controller, Get, Param, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { TransferRequestsService } from './transfer-requests.service';
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { CurrentUser } from '../auth/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('transfer-requests')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TransferRequestsController {
  constructor(private readonly service: TransferRequestsService) {}

  @Post()
  @RequirePerm('transfer.create')
  create(@Body() dto: CreateTransferRequestDto, @CurrentUser() user: any) {
    return this.service.create(dto, { userId: user.userId, role: user.role, technicianId: user.technicianId });
  }

  @Get('recipients')
  @RequirePerm('transfer.create')
  recipients() {
    return this.service.listRecipients();
  }

  @Get()
  @RequirePerm('transfer.view')
  list(@Query() query: ListTransferRequestsQuery, @CurrentUser() user: any) {
    return this.service.list(query, { userId: user.userId, role: user.role, technicianId: user.technicianId });
  }

  @Get(':id')
  @RequirePerm('transfer.view')
  detail(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.detail(id, { userId: user.userId, role: user.role, technicianId: user.technicianId });
  }

  @Put(':id')
  @RequirePerm('transfer.create')
  update(@Param('id') id: string, @Body() dto: UpdateTransferRequestDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, { userId: user.userId, role: user.role, technicianId: user.technicianId });
  }

  @Post(':id/finalize')
  @RequirePerm('transfer.finalize')
  finalize(@Param('id') id: string, @Body() dto: FinalizeTransferDto, @CurrentUser() user: any) {
    return this.service.finalize(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Post(':id/acknowledge')
  @RequirePerm('transfer.acknowledge')
  acknowledge(@Param('id') id: string, @Body() dto: AcknowledgeDto, @CurrentUser() user: any) {
    return this.service.acknowledge(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Post(':id/dispute')
  @RequirePerm('transfer.acknowledge')
  @UseInterceptors(FileInterceptor('photo'))
  dispute(
    @Param('id') id: string,
    @Body() dto: DisputeDto,
    @CurrentUser() user: any,
    @UploadedFile() file?: { originalname?: string; mimetype?: string; size?: number; buffer: Buffer },
  ) {
    return this.service.dispute(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto, file);
  }

  @Get(':id/dispute')
  @RequirePerm('transfer.view')
  disputeDetail(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.disputeDetail(id, { userId: user.userId, role: user.role, technicianId: user.technicianId });
  }

  @Post(':id/dispute/resolve')
  @RequirePerm('transfer.finalize')
  resolveDispute(@Param('id') id: string, @Body() dto: ResolveDisputeDto, @CurrentUser() user: any) {
    return this.service.resolveDispute(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Get(':id/dispute-photo')
  @RequirePerm('transfer.view')
  async disputePhoto(@Param('id') id: string, @CurrentUser() user: any, @Res() res: any) {
    const file = await this.service.getDisputePhoto(id, { userId: user.userId, role: user.role, technicianId: user.technicianId });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.sendFile(file.absolutePath);
  }

  @Post(':id/send-back')
  @RequirePerm('transfer.finalize')
  sendBack(@Param('id') id: string, @Body() dto: SendBackDto, @CurrentUser() user: any) {
    return this.service.sendBack(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Post(':id/cancel')
  @RequirePerm('transfer.create')
  cancel(@Param('id') id: string, @Body() dto: CancelTransferRequestDto, @CurrentUser() user: any) {
    return this.service.cancel(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Post(':id/approve')
  @RequirePerm('transfer.finalize')
  approve(@Param('id') id: string, @Body() dto: ApproveTransferDto, @CurrentUser() user: any) {
    return this.service.approve(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Post(':id/deny')
  @RequirePerm('transfer.finalize')
  deny(@Param('id') id: string, @Body() dto: ApproveTransferDto, @CurrentUser() user: any) {
    return this.service.deny(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Post(':id/approve-changes')
  @RequirePerm('transfer.finalize')
  approveChanges(@Param('id') id: string, @Body() dto: ApproveTransferDto, @CurrentUser() user: any) {
    return this.service.approveChanges(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Post(':id/deny-changes')
  @RequirePerm('transfer.finalize')
  denyChanges(@Param('id') id: string, @Body() dto: ApproveTransferDto, @CurrentUser() user: any) {
    return this.service.denyChanges(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }
}
