import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  list(@Query('search') search?: string, @Query('limit') limitRaw?: string) {
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 200;
    const clamped = Math.min(Math.max(1, limit), 500);
    return this.products.list({ search, limit: clamped });
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.products.detail(id);
  }
}
