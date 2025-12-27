import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { ProductsModule } from './products/products.module';
import { IncomingModule } from './incoming/incoming.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ProductsModule, IncomingModule, CheckoutModule],
  controllers: [AnalyticsController],
  providers: [PrismaService],
})
export class AppModule {}
