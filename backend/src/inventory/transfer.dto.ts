import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class TransferDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  unitLabel!: string;

  @IsString()
  @IsNotEmpty()
  toTechnicianId!: string;

  @IsOptional()
  @IsString()
  fromScope?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}
