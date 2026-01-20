import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { InventoryTransaction, ProductCategory, TransferDirection } from '@prisma/client';
import { UsageAnalyticsQueryDto } from './analytics.dto';
import { PrismaService } from './prisma.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private prisma: PrismaService) {}

  @Get('usage')
  async usage(@Query() query: UsageAnalyticsQueryDto) {
    const now = new Date();
    const end = query.end ?? now;
    const start = query.start ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const groupBy = query.groupBy ?? 'product';
    const direction = query.direction ?? TransferDirection.ISSUE;

    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
      throw new BadRequestException('Invalid start or end date');
    }
    if (start >= end) {
      throw new BadRequestException('Start date must be before end date');
    }
    if (direction !== TransferDirection.ISSUE) {
      return this.emptyUsageResponse(start, end, groupBy, query);
    }

    const productIds = query.productId ?? [];
    const queryTechnicianIds = query.technicianId ?? [];

    const productFilter = productIds.length ? { productId: { in: productIds } } : {};
    const categoryFilter = query.category ? { product: { category: query.category as ProductCategory } } : {};
    const locationFilter = query.locationId ? { scope: query.locationId } : {};

    const checkoutTransactions = await this.prisma.inventoryTransaction.findMany({
      where: {
        type: 'checkout_finalized',
        createdAt: { gte: start, lt: end },
        ...productFilter,
        ...categoryFilter,
        ...locationFilter,
        ...(queryTechnicianIds.length
          ? { sourceCheckoutLine: { request: { technician: { technicianId: { in: queryTechnicianIds } } } } }
          : {}),
      },
      include: {
        product: { select: { id: true, name: true, category: true, trackingUnitLabel: true, checkoutUnitLabel: true, trackingToBase: true } },
        sourceCheckoutLine: {
          select: {
            requestId: true,
            request: { select: { id: true, technician: { select: { id: true, name: true, technicianId: true } } } },
          },
        },
      },
    });

    const transferScopeFilter = queryTechnicianIds.length
      ? { scope: { in: queryTechnicianIds.map((id) => `TRUCK:${id}`) } }
      : query.locationId
        ? { scope: query.locationId }
        : { scope: { startsWith: 'TRUCK:' } };

    const transferTransactions = await this.prisma.inventoryTransaction.findMany({
      where: {
        type: 'transfer',
        createdAt: { gte: start, lt: end },
        quantityBase: { gt: 0 },
        ...transferScopeFilter,
        ...productFilter,
        ...categoryFilter,
      },
      include: {
        product: { select: { id: true, name: true, category: true, trackingUnitLabel: true, checkoutUnitLabel: true, trackingToBase: true } },
      },
    });

    const technicianIdSet = new Set<string>();
    for (const tx of transferTransactions) {
      const scopeId = this.extractTechnicianIdFromScope(tx.scope);
      if (scopeId) technicianIdSet.add(scopeId);
    }
    for (const tx of checkoutTransactions) {
      const userTechId = tx.sourceCheckoutLine?.request?.technician?.technicianId;
      if (userTechId) technicianIdSet.add(userTechId);
    }
    const technicians = technicianIdSet.size
      ? await this.prisma.technician.findMany({ where: { id: { in: Array.from(technicianIdSet) } } })
      : [];
    const technicianNameById = new Map(technicians.map((tech) => [tech.id, tech.name]));

    const includeProduct = groupBy === 'product' || groupBy === 'product_technician';
    const includeTechnician = groupBy === 'technician' || groupBy === 'product_technician';
    type UsageRowState = {
      productId: string | null;
      productName: string | null;
      category: ProductCategory | null;
      technicianId: string | null;
      technicianName: string | null;
      quantityBase: number;
      quantityTracking: number;
      trackingUnitLabel: string | null;
      checkoutUnitLabel: string | null;
      transactionIds: Set<string>;
    };

    const rows = new Map<string, UsageRowState>();

    const totalTransactions = new Set<string>();
    const normalizeRow = (key: string, seed: Partial<UsageRowState> = {}) => {
      if (!rows.has(key)) {
        rows.set(key, {
          productId: null,
          productName: null,
          category: null,
          technicianId: null,
          technicianName: null,
          quantityBase: 0,
          quantityTracking: 0,
          trackingUnitLabel: null,
          checkoutUnitLabel: null,
          transactionIds: new Set<string>(),
          ...seed,
        });
      }
      return rows.get(key)!;
    };

    const accumulate = (tx: InventoryTransaction & { product: any; sourceCheckoutLine?: any }) => {
      const product = tx.product;
      if (!product) return;
      const baseQty = Math.abs(tx.quantityBase);
      const trackingQty = product.trackingToBase ? baseQty / product.trackingToBase : 0;

      let technicianId: string | null = null;
      let technicianName: string | null = null;
      let transactionKey = `tx:${tx.id}`;

      if (tx.type === 'checkout_finalized') {
        const user = tx.sourceCheckoutLine?.request?.technician;
        const mappedTechId = user?.technicianId ?? null;
        technicianId = mappedTechId ?? user?.id ?? null;
        technicianName = mappedTechId ? technicianNameById.get(mappedTechId) ?? user?.name ?? null : user?.name ?? null;
        if (tx.sourceCheckoutLine?.requestId) {
          transactionKey = `checkout:${tx.sourceCheckoutLine.requestId}`;
        }
      } else if (tx.type === 'transfer') {
        const scopeId = this.extractTechnicianIdFromScope(tx.scope);
        technicianId = scopeId;
        technicianName = scopeId ? technicianNameById.get(scopeId) ?? null : null;
        if (tx.transferGroupId) {
          transactionKey = `transfer:${tx.transferGroupId}`;
        }
      }

      if (includeTechnician && !technicianId) {
        technicianId = 'unknown';
        technicianName = technicianName ?? 'Unknown technician';
      }

      if (includeTechnician && queryTechnicianIds.length && (!technicianId || !queryTechnicianIds.includes(technicianId))) {
        return;
      }

      const keyParts = [];
      if (includeProduct) keyParts.push(product.id);
      if (includeTechnician) keyParts.push(technicianId ?? 'unknown');
      const key = keyParts.join('::') || product.id;

      const row = normalizeRow(key, {
        productId: includeProduct ? product.id : null,
        productName: includeProduct ? product.name : null,
        category: includeProduct ? product.category : null,
        trackingUnitLabel: includeProduct ? product.trackingUnitLabel : null,
        checkoutUnitLabel: includeProduct ? product.checkoutUnitLabel : null,
        technicianId: includeTechnician ? technicianId : null,
        technicianName: includeTechnician ? technicianName : null,
      });

      row.quantityBase += baseQty;
      row.quantityTracking += trackingQty;
      row.transactionIds.add(transactionKey);
      totalTransactions.add(transactionKey);
    };

    for (const tx of checkoutTransactions) {
      accumulate(tx as any);
    }
    for (const tx of transferTransactions) {
      accumulate(tx as any);
    }

    const rowsArray = Array.from(rows.values()).map((row) => ({
      productId: row.productId,
      productName: row.productName,
      category: row.category,
      technicianId: row.technicianId,
      technicianName: row.technicianName,
      quantityBase: row.quantityBase,
      quantityTracking: Math.round(row.quantityTracking * 100) / 100,
      trackingUnitLabel: row.trackingUnitLabel,
      checkoutUnitLabel: row.checkoutUnitLabel,
      transactions: row.transactionIds.size,
      sourcesPreview: Array.from(row.transactionIds).sort().slice(0, 25),
      sourcesTotal: row.transactionIds.size,
    }));

    rowsArray.sort((a, b) => b.quantityTracking - a.quantityTracking || b.quantityBase - a.quantityBase);

    const totalsBase = rowsArray.reduce((sum, row) => sum + row.quantityBase, 0);
    const totalsTracking = rowsArray.reduce((sum, row) => sum + row.quantityTracking, 0);

    return {
      meta: {
        start: start.toISOString(),
        end: end.toISOString(),
        groupBy,
        filters: {
          locationId: query.locationId ?? null,
          technicianId: queryTechnicianIds.length ? queryTechnicianIds : null,
          productId: productIds.length ? productIds : null,
          category: query.category ?? null,
          direction,
        },
      },
      rows: rowsArray,
      totals: {
        quantityBase: totalsBase,
        quantityTracking: Math.round(totalsTracking * 100) / 100,
        transactions: totalTransactions.size,
      },
    };
  }

  private extractTechnicianIdFromScope(scope?: string | null) {
    if (!scope) return null;
    if (!scope.startsWith('TRUCK:')) return null;
    return scope.slice('TRUCK:'.length) || null;
  }

  private emptyUsageResponse(start: Date, end: Date, groupBy: string, query: UsageAnalyticsQueryDto) {
    const productIds = query.productId ?? [];
    const technicianIds = query.technicianId ?? [];
    return {
      meta: {
        start: start.toISOString(),
        end: end.toISOString(),
        groupBy,
        filters: {
          locationId: query.locationId ?? null,
          technicianId: technicianIds.length ? technicianIds : null,
          productId: productIds.length ? productIds : null,
          category: query.category ?? null,
          direction: query.direction ?? TransferDirection.ISSUE,
        },
      },
      rows: [],
      totals: {
        quantityBase: 0,
        quantityTracking: 0,
        transactions: 0,
      },
    };
  }
}
