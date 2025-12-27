import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto';

@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('stockedOnly') stockedOnly?: string,
    @Query('includeDiscontinued') includeDiscontinued?: string,
  ) {
    return this.products.list({
      search,
      stockedOnly: stockedOnly !== 'false',
      includeDiscontinued: includeDiscontinued === 'true',
    });
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
