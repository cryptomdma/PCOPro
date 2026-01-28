import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IncomingService } from './incoming.service';
import { CreateIncomingDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('incoming')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncomingController {
  constructor(private incoming: IncomingService) {}

  @Get()
  @RequirePerm('receiving.manage')
  list() {
    return this.incoming.list();
  }

  @Get('receipts')
  @RequirePerm('receiving.manage')
  listReceipts(
    @Query('take') takeRaw?: string,
    @Query('skip') skipRaw?: string,
    @Query('scope') scope?: string,
  ) {
    const take = Number(takeRaw);
    const skip = Number(skipRaw);
    return this.incoming.listReceipts({
      take: Number.isFinite(take) ? take : undefined,
      skip: Number.isFinite(skip) ? skip : undefined,
      scope,
    });
  }

  @Get('receipts/:receiptId')
  @RequirePerm('receiving.manage')
  receiptDetail(@Param('receiptId') receiptId: string, @Query('scope') scope?: string) {
    return this.incoming.getReceiptDetail(receiptId, scope);
  }

  @Post()
  @RequirePerm('receiving.manage')
  create(@Body() dto: CreateIncomingDto, @CurrentUser() user?: { userId?: string; role?: string }) {
    return this.incoming.create(dto, user);
  }
}
