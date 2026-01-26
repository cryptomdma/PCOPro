import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductBehavior, ProductCategory, ProductTrackingMode, ProductType, UnitBaseType } from '@prisma/client';

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

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

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

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value === '' || value === null ? null : Number(value)))
  @Min(0)
  defaultCostPerBase?: number | null;

  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsEnum(UnitBaseType)
  baseType?: UnitBaseType;

  @IsOptional()
  @IsString()
  trackingUnitLabel?: string;

  @IsOptional()
  @IsString()
  checkoutUnitLabel?: string;

  @IsOptional()
  @IsString()
  orderingUnitLabel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  trackingToBase?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  checkoutToBase?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  orderingToBase?: number;

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
