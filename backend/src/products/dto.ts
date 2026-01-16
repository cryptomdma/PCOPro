import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ProductBehavior, ProductCategory, ProductTrackingMode, UnitBaseType } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  epaRegNo?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsEnum(ProductTrackingMode)
  trackingMode?: ProductTrackingMode;

  @IsEnum(UnitBaseType)
  baseType!: UnitBaseType;

  @IsString()
  trackingUnitLabel!: string;

  @IsString()
  checkoutUnitLabel!: string;

  @IsString()
  orderingUnitLabel!: string;

  @IsInt()
  @Min(1)
  trackingToBase!: number;

  @IsInt()
  @Min(1)
  checkoutToBase!: number;

  @IsInt()
  @Min(1)
  orderingToBase!: number;

  @IsOptional()
  @IsInt()
  reorderLevelBase?: number;

  @IsOptional()
  @IsInt()
  leadTimeDays?: number;

  @IsOptional()
  @IsEnum(ProductBehavior)
  behavior?: ProductBehavior;
}
