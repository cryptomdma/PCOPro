import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { CreatePurchaseOrderDto, ReceiveAgainstPoDto, UpdatePurchaseOrderDto } from './dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get('low-stock')
  @RequirePerm('ordering.view')
  lowStock(@Query('scope') scope?: string) {
    return this.service.lowStock(scope);
  }

  @Get()
  @RequirePerm('ordering.view')
  list(
    @Query('statuses') statuses?: string,
    @Query('supplierId') supplierId?: string,
    @Query('take') takeRaw?: string,
    @Query('skip') skipRaw?: string,
  ) {
    const take = Number(takeRaw);
    const skip = Number(skipRaw);
    return this.service.list({
      statuses,
      supplierId,
      take: Number.isFinite(take) ? take : undefined,
      skip: Number.isFinite(skip) ? skip : undefined,
    });
  }

  @Get(':id')
  @RequirePerm('ordering.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Get(':id/export-form')
  @RequirePerm('ordering.view')
  exportForm(@Param('id') id: string, @Query('format') format?: string) {
    return this.service.exportForm(id, format);
  }

  @Post()
  @RequirePerm('ordering.manage')
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user?: { userId?: string }) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePerm('ordering.manage')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/cancel')
  @RequirePerm('ordering.manage')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Post(':id/receive')
  @RequirePerm('receiving.manage')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveAgainstPoDto,
    @CurrentUser() user?: { userId?: string; role?: string },
  ) {
    return this.service.receive(id, dto, user);
  }
}
