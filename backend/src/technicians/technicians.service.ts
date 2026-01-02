import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TechniciansService {
  constructor(private prisma: PrismaService) {}

  list(params: { query?: string; active?: boolean; limit: number }) {
    const { query, active, limit } = params;
    return this.prisma.technician.findMany({
      where: {
        ...(active !== undefined ? { active } : {}),
        ...(query
          ? {
              name: {
                contains: query,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: { id: true, name: true, active: true },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }
}
