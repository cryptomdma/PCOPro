import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AuditCountDto, BalanceQueryDto } from './audit.dto';
import { TransferDto } from './transfer.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Post('audit')
  audit(@Body() dto: AuditCountDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.inventory.auditCount(dto, idempotencyKey);
  }

  @Get('balances')
  balances(@Query() query: BalanceQueryDto) {
    return this.inventory.listBalances(query);
  }

  @Post('transfer')
  transfer(@Body() dto: TransferDto) {
    return this.inventory.transfer(dto);
  }
}
