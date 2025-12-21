import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { UnitBaseType } from '@prisma/client';

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
  @IsString()
  category?: string;

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
}
