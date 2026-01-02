import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateProductDto } from './dto';
import { Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  list(params: { search?: string; reorderOnly?: boolean }) {
    const where: Prisma.ProductWhereInput = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { epaRegNo: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.product
      .findMany({
        where,
        include: { balances: { where: { scope: 'WAREHOUSE' } } },
        orderBy: { name: 'asc' },
      })
      .then((products) =>
        products.map((p) => ({
          ...p,
          balances: p.balances[0] ?? null,
        })),
      );
  }

  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  async detail(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        packs: true,
        codes: true,
        balances: { where: { scope: 'WAREHOUSE' } },
        reorderPolicy: true,
      },
    });
    if (!product) return null;
    const qrPayload = `MGPC:prod:${product.id}`;
    const qrSvg = await QRCode.toString(qrPayload, { type: 'svg' });
    return { ...product, balances: product.balances[0] ?? null, qrPayload, qrSvg };
  }
}
