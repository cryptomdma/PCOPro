import { Body, Controller, Get, Patch, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, RequirePerm } from '../auth/permissions';
import { UsersService } from './users.service';
import { Role } from '@prisma/client';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePerm('admin.users')
  list() {
    return this.users.list();
  }

  @Post()
  @RequirePerm('admin.users')
  create(@Body() body: any) {
    return this.users.create({
      name: body?.name,
      email: body?.email,
      role: body?.role as Role,
      password: body?.password,
      active: body?.active,
      technicianId: body?.technicianId ?? null,
      createTechnician: body?.createTechnician !== false,
      licenseNumber: body?.licenseNumber,
    });
  }

  @Patch(':id')
  @RequirePerm('admin.users')
  update(@Param('id') id: string, @Body() body: any) {
    return this.users.update(id, {
      name: body?.name,
      email: body?.email,
      active: body?.active,
      role: body?.role as Role | undefined,
      technicianId: body?.technicianId,
      createTechnician: body?.createTechnician === true,
      licenseNumber: body?.licenseNumber,
    });
  }
}
