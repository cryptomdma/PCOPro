import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';

@Module({
  controllers: [AuditsController],
  providers: [AuditsService, PrismaService],
})
export class AuditsModule {}
