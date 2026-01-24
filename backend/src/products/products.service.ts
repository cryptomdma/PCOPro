import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  list(params: { search?: string; reorderOnly?: boolean; limit?: number }) {
    const where: Prisma.ProductWhereInput = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { epaRegNo: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 500) : 200;
    return this.prisma.product
      .findMany({
        where,
        include: { balances: { where: { scope: 'WAREHOUSE' } } },
        orderBy: { name: 'asc' },
        take: limit,
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

  update(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        epaRegNo: dto.epaRegNo,
        description: dto.description,
        category: dto.category,
        trackingMode: dto.trackingMode,
        productType: dto.productType,
        baseType: dto.baseType,
        trackingUnitLabel: dto.trackingUnitLabel,
        checkoutUnitLabel: dto.checkoutUnitLabel,
        orderingUnitLabel: dto.orderingUnitLabel,
        trackingToBase: dto.trackingToBase,
        checkoutToBase: dto.checkoutToBase,
        orderingToBase: dto.orderingToBase,
        reorderLevelBase: dto.reorderLevelBase,
        leadTimeDays: dto.leadTimeDays,
        behavior: dto.behavior,
      },
    });
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
