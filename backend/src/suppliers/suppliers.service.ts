import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return supplier;
  }

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
        licenseNumber: dto.licenseNumber?.trim() || null,
        ein: dto.ein?.trim() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.get(id);
    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        email: dto.email === undefined ? undefined : dto.email.trim() || null,
        licenseNumber: dto.licenseNumber === undefined ? undefined : dto.licenseNumber.trim() || null,
        ein: dto.ein === undefined ? undefined : dto.ein.trim() || null,
        phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
        address: dto.address === undefined ? undefined : dto.address.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    const inUse = await this.prisma.purchaseOrder.count({ where: { supplierId: id } });
    if (inUse > 0) {
      throw new BadRequestException('Cannot delete supplier with existing purchase orders.');
    }
    await this.prisma.supplier.delete({ where: { id } });
    return { ok: true };
  }
}
