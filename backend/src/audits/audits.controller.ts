import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditsService } from './audits.service';
import { AddAuditLineDto, CreateAuditSessionDto } from './dto';

@Controller('audits')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AuditsController {
  constructor(private readonly service: AuditsService) {}

  @Post()
  @RequirePerm('audit.manage')
  create(@Body() dto: CreateAuditSessionDto, @CurrentUser() user: any) {
    return this.service.createSession(dto, { userId: user.userId, role: user.role });
  }

  @Post(':id/lines')
  @RequirePerm('audit.manage')
  addLine(@Param('id') id: string, @Body() dto: AddAuditLineDto) {
    return this.service.addLine(id, dto);
  }

  @Post(':id/finalize')
  @RequirePerm('audit.manage')
  finalize(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.finalize(id, { userId: user.userId, role: user.role });
  }
}

