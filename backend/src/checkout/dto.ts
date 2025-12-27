import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsString, Min, ValidateNested } from 'class-validator';

class CheckoutLineDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qtyRequested!: number;

  @IsString()
  checkoutUnitLabel!: string;
}

export class CreateCheckoutDto {
  @IsDateString()
  requestDate!: string;

  @IsString()
  technicianId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];
}
