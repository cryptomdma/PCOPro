import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProductCategory, TransferDirection } from '@prisma/client';

const normalizeIdList = (value: unknown): string[] | undefined => {
  if (value === null || value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const parts = raw
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) return undefined;
  return Array.from(new Set(parts));
};

export class UsageAnalyticsQueryDto {
  @IsOptional()
  @IsIn(['product', 'technician', 'product_technician'])
  groupBy?: 'product' | 'technician' | 'product_technician';

  @IsOptional()
  @Type(() => Date)
  start?: Date;

  @IsOptional()
  @Type(() => Date)
  end?: Date;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString({ each: true })
  @Transform(({ value }) => normalizeIdList(value))
  technicianId?: string[];

  @IsOptional()
  @IsString({ each: true })
  @Transform(({ value }) => normalizeIdList(value))
  productId?: string[];

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsEnum(TransferDirection)
  direction?: TransferDirection;
}
