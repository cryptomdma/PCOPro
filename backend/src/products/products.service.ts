import { ConflictException, Injectable } from '@nestjs/common';
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

  async update(id: string, dto: UpdateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.sku !== undefined) {
        const normalized = dto.sku.trim();
        const skuValue = normalized === '' ? null : normalized;

        if (skuValue) {
          const existing = await tx.productCode.findUnique({ where: { payload: skuValue } });
          if (existing && existing.productId !== id) {
            throw new ConflictException('SKU already assigned to another product');
          }

          const existingSku = await tx.productCode.findFirst({
            where: { productId: id, codeType: 'sku' },
          });

          if (existingSku) {
            if (existingSku.payload !== skuValue) {
              await tx.productCode.update({
                where: { id: existingSku.id },
                data: { payload: skuValue },
              });
            }
          } else if (!existing) {
            await tx.productCode.create({
              data: { productId: id, payload: skuValue, codeType: 'sku' },
            });
          }
        } else {
          await tx.productCode.deleteMany({ where: { productId: id, codeType: 'sku' } });
        }
      }

      return tx.product.update({
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
