import { IsArray, IsEnum, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TransferDirection, TransferRequestStatus } from '@prisma/client';

export class TransferRequestLineDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  unitLabel!: string;
}

export class CreateTransferRequestDto {
  @IsEnum(TransferDirection)
  direction!: TransferDirection;

  @IsString()
  technicianId!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @Type(() => Date)
  pickupDate?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferRequestLineDto)
  lines!: TransferRequestLineDto[];
}

export class ListTransferRequestsQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  technicianId?: string;

  @IsOptional()
  @IsEnum(TransferDirection)
  direction?: TransferDirection;

  @IsOptional()
  @Type(() => Boolean)
  includeClosed?: boolean;

  @IsOptional()
  @Type(() => Date)
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AcknowledgeDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class DisputeDto {
  @IsString()
  note!: string;
}

export class UpdateTransferRequestDto {
  @IsOptional()
  @IsEnum(TransferDirection)
  direction?: TransferDirection;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Date)
  pickupDate?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferRequestLineDto)
  lines!: TransferRequestLineDto[];
}

export class SendBackDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class CancelTransferRequestDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsIn(['CANCEL', 'REFUSE'])
  action?: 'CANCEL' | 'REFUSE';
}

export class ApproveTransferDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  fulfillmentNote?: string;
}

export class FinalizeTransferDto {
  @IsOptional()
  @IsString()
  fulfillmentNote?: string;
}
