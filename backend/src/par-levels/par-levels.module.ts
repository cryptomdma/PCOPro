import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ParLevelsController } from './par-levels.controller';
import { ParLevelsService } from './par-levels.service';

@Module({
  controllers: [ParLevelsController],
  providers: [ParLevelsService, PrismaService],
})
export class ParLevelsModule {}
