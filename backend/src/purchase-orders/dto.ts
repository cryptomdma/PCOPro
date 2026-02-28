import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderStatus, PurchaseOrderType } from '@prisma/client';

export class PurchaseOrderLineInputDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qtyOrdered!: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId!: string;

  @IsString()
  shipToScope!: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsEnum(PurchaseOrderType)
  orderType?: PurchaseOrderType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalOrderRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineInputDto)
  lines!: PurchaseOrderLineInputDto[];
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  shipToScope?: string;

  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsEnum(PurchaseOrderType)
  orderType?: PurchaseOrderType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalOrderRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineInputDto)
  lines?: PurchaseOrderLineInputDto[];
}

export class ReceiveAgainstPoLineDto {
  @IsString()
  lineId!: string;

  @IsInt()
  @Min(1)
  qtyReceived!: number;
}

export class ReceiveAgainstPoDto {
  @IsDateString()
  receiptDate!: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveAgainstPoLineDto)
  lines!: ReceiveAgainstPoLineDto[];
}
