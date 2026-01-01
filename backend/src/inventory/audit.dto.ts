import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { AuditUnit } from './audit-helpers';

export class AuditCountDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  countedQty!: number;

  @IsIn(['tracking', 'checkout'])
  unit!: AuditUnit;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  device?: string;
}

export class BalanceQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  stockedOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeDiscontinued?: boolean;
}
