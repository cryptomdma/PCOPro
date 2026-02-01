import { Body, Controller, Get, Param, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('limit') limitRaw?: string,
    @CurrentUser() user?: { role?: string },
  ) {
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 200;
    const clamped = Math.min(Math.max(1, limit), 500);
    return this.products.list({ search, limit: clamped, role: user?.role as any });
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePerm('products.manage')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Post('epa-import')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePerm('products.manage')
  @UseInterceptors(FileInterceptor('file'))
  importEpa(@UploadedFile() file?: { buffer: Buffer }) {
    return this.products.importEpaCsv(file?.buffer ?? Buffer.from(''));
  }

  @Post('bulk-import')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePerm('products.manage')
  @UseInterceptors(FileInterceptor('file'))
  bulkImport(
    @UploadedFile() file?: { buffer: Buffer },
    @Query('mode') mode?: string,
    @Query('dryRun') dryRunRaw?: string,
    @Query('allowExistingInitialQty') allowExistingRaw?: string,
  ) {
    const dryRun = dryRunRaw === 'true' || dryRunRaw === '1' || dryRunRaw === 'yes';
    const allowExistingInitialQty = allowExistingRaw === 'true' || allowExistingRaw === '1' || allowExistingRaw === 'yes';
    const normalizedMode = mode === 'initial_load' ? 'initial_load' : 'upsert';
    return this.products.bulkImportCsv(file?.buffer ?? Buffer.from(''), {
      mode: normalizedMode,
      dryRun,
      allowExistingInitialQty,
    });
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user?: { role?: string }) {
    return this.products.detail(id, user?.role as any);
  }
}
