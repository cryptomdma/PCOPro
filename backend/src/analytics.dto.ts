import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductCategory, TransferDirection } from '@prisma/client';

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
  @IsString()
  technicianId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsEnum(TransferDirection)
  direction?: TransferDirection;
}
