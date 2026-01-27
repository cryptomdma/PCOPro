import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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

  @Post()
  @RequirePerm('receiving.manage')
  create(@Body() dto: CreateIncomingDto, @CurrentUser() user?: { userId?: string; role?: string }) {
    return this.incoming.create(dto, user);
  }
}
