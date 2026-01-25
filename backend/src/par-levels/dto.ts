import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum ParUnitBasis {
  TRACKING = 'TRACKING',
  CHECKOUT = 'CHECKOUT',
}

export class ParLevelItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @Min(0)
  parQty!: number;

  @IsEnum(ParUnitBasis)
  unitBasis!: ParUnitBasis;
}

export class UpsertParLevelsDto {
  @IsString()
  locationScope!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParLevelItemDto)
  items!: ParLevelItemDto[];
}
