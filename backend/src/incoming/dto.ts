import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class IncomingLineDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(0)
  qtyOrdered!: number;

  @IsInt()
  @Min(0)
  qtyReceived!: number;

  @IsInt()
  @Min(0)
  backorderedQty!: number;

  @IsString()
  receivingUnitLabel!: string;
}

export class CreateIncomingDto {
  @IsDateString()
  receiptDate!: string;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IncomingLineDto)
  lines!: IncomingLineDto[];
}
