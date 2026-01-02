import { Controller, Get, Query } from '@nestjs/common';
import { TechniciansService } from './technicians.service';

@Controller('technicians')
export class TechniciansController {
  constructor(private readonly technicians: TechniciansService) {}

  @Get()
  list(@Query('query') query?: string, @Query('active') activeRaw?: string, @Query('limit') limitRaw?: string) {
    const active =
      activeRaw === undefined
        ? undefined
        : ['true', '1', 'yes', 'y'].includes(String(activeRaw).trim().toLowerCase());
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    const clampedLimit = Math.min(Math.max(1, limit), 200);
    return this.technicians.list({ query, active, limit: clampedLimit });
  }
}
