import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private checkout: CheckoutService) {}

  @Get()
  list() {
    return this.checkout.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.checkout.detail(id);
  }

  @Post('requests')
  create(@Body() dto: CreateCheckoutDto) {
    return this.checkout.create(dto, false);
  }

  @Post(':id/finalize')
  finalize(@Param('id') id: string) {
    return this.checkout.finalize(id);
  }
}
