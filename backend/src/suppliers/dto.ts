import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ein?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ein?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
