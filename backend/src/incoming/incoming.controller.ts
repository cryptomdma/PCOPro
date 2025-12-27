import { Body, Controller, Get, Post } from '@nestjs/common';
import { IncomingService } from './incoming.service';
import { CreateIncomingDto } from './dto';

@Controller('incoming')
export class IncomingController {
  constructor(private incoming: IncomingService) {}

  @Get()
  list() {
    return this.incoming.list();
  }

  @Post()
  create(@Body() dto: CreateIncomingDto) {
    return this.incoming.create(dto);
  }
}
