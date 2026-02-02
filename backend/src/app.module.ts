import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { ProductsModule } from './products/products.module';
import { IncomingModule } from './incoming/incoming.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AnalyticsController } from './analytics.controller';
import { InventoryModule } from './inventory/inventory.module';
import { TechniciansModule } from './technicians/technicians.module';
import { AuthModule } from './auth/auth.module';
import { TransferRequestsModule } from './transfer-requests/transfer-requests.module';
import { HealthController } from './health.controller';
import { ImportModule } from './import/import.module';
import { AuditsModule } from './audits/audits.module';
import { ParLevelsModule } from './par-levels/par-levels.module';
import { UsersModule } from './users/users.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ImportModule,
    AuditsModule,
    ParLevelsModule,
    ProductsModule,
    IncomingModule,
    CheckoutModule,
    InventoryModule,
    TechniciansModule,
    AuthModule,
    UsersModule,
    TransferRequestsModule,
  ],

  controllers: [AnalyticsController, HealthController],
  providers: [PrismaService],
})
export class AppModule {}
