import { Module } from '@nestjs/common';
import { IncomingController } from './incoming.controller';
import { IncomingService } from './incoming.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [IncomingController],
  providers: [IncomingService, PrismaService],
})
export class IncomingModule {}
