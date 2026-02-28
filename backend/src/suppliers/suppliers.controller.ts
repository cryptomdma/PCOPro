import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePerm('ordering.view')
  list() {
    return this.suppliers.list();
  }

  @Get(':id')
  @RequirePerm('ordering.view')
  get(@Param('id') id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  @RequirePerm('suppliers.manage')
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Patch(':id')
  @RequirePerm('suppliers.manage')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  @Delete(':id')
  @RequirePerm('suppliers.manage')
  remove(@Param('id') id: string) {
    return this.suppliers.remove(id);
  }
}
