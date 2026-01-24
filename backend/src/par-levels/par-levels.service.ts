import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ParUnitBasis, UpsertParLevelsDto } from './dto';
import { toBaseQuantity } from '../utils/units';

@Injectable()
export class ParLevelsService {
  constructor(private prisma: PrismaService) {}

  async list(locationScope?: string) {
    const scope = locationScope?.trim() || 'WAREHOUSE';
    return this.prisma.parLevel.findMany({
      where: { locationScope: scope },
      select: { productId: true, locationScope: true, parBase: true },
      orderBy: { productId: 'asc' },
    });
  }

  async upsert(dto: UpsertParLevelsDto) {
    const scope = dto.locationScope?.trim() || 'WAREHOUSE';
    if (!dto.items?.length) {
      throw new BadRequestException('Items are required');
    }

    const results = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const item of dto.items) {
        const product = await this.resolveProduct(item.productId, item.sku);
        const multiplier = item.unitBasis === ParUnitBasis.CHECKOUT ? product.checkoutToBase : product.trackingToBase;
        const parBase = toBaseQuantity(item.parQty, multiplier);

        const record = await tx.parLevel.upsert({
          where: { productId_locationScope: { productId: product.id, locationScope: scope } },
          update: { parBase },
          create: { productId: product.id, locationScope: scope, parBase },
        });
        rows.push({ productId: record.productId, locationScope: record.locationScope, parBase: record.parBase });
      }
      return rows;
    });

    return results;
  }

  private async resolveProduct(productId?: string, sku?: string) {
    if (productId) {
      const product = await this.prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      return product;
    }

    if (sku) {
      const code = await this.prisma.productCode.findUnique({
        where: { payload: sku },
        include: { product: true },
      });
      if (!code?.product) {
        throw new NotFoundException('Product not found for sku');
      }
      return code.product;
    }

    throw new BadRequestException('productId or sku is required');
  }
}
