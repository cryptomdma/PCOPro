import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { AuditUnitBasis } from '@prisma/client';

export class CreateAuditSessionDto {
  @IsOptional()
  @IsString()
  locationScope?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddAuditLineDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @Min(0)
  countedQty!: number;

  @IsEnum(AuditUnitBasis)
  unitBasis!: AuditUnitBasis;
}
