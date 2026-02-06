import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TransferRequestsService } from './transfer-requests.service';
import { AcknowledgeDto, CreateTransferRequestDto, DisputeDto, ListTransferRequestsQuery } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { CurrentUser } from '../auth/current-user.decorator';

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

  @Post(':id/finalize')
  @RequirePerm('transfer.finalize')
  finalize(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.finalize(id, { userId: user.userId, role: user.role, technicianId: user.technicianId });
  }

  @Post(':id/acknowledge')
  @RequirePerm('transfer.acknowledge')
  acknowledge(@Param('id') id: string, @Body() dto: AcknowledgeDto, @CurrentUser() user: any) {
    return this.service.acknowledge(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }

  @Post(':id/dispute')
  @RequirePerm('transfer.acknowledge')
  dispute(@Param('id') id: string, @Body() dto: DisputeDto, @CurrentUser() user: any) {
    return this.service.dispute(id, { userId: user.userId, role: user.role, technicianId: user.technicianId }, dto);
  }
}
