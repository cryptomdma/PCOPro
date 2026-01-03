import { Module } from '@nestjs/common';
import { TransferRequestsController } from './transfer-requests.controller';
import { TransferRequestsService } from './transfer-requests.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [TransferRequestsController],
  providers: [TransferRequestsService, PrismaService],
})
export class TransferRequestsModule {}
