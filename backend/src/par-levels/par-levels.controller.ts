import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { ParLevelsService } from './par-levels.service';
import { UpsertParLevelsDto } from './dto';

@Controller('par-levels')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ParLevelsController {
  constructor(private readonly service: ParLevelsService) {}

  @Get()
  @RequirePerm('par.view')
  list(@Query('locationScope') locationScope?: string) {
    return this.service.list(locationScope);
  }

  @Put()
  @RequirePerm('par.manage')
  upsert(@Body() dto: UpsertParLevelsDto) {
    return this.service.upsert(dto);
  }
}
