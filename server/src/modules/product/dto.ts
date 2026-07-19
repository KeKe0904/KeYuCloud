// 商品相关 DTO
import {
  IsString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// 管理后台手动创建商品
export class CreateProductDto {
  @Type(() => Number)
  @IsInt()
  upstreamPlanId: number;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  markupRate?: number; // 默认 0.15

  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;
}

// 管理后台更新商品
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-0.95)
  @Max(5)
  markupRate?: number; // -0.95=接近全免 / 0=原价 / 0.15=加价15%

  @IsOptional()
  @IsBoolean()
  isOnSale?: boolean;

  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortWeight?: number;

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  perUserLimit?: number;

  @IsOptional()
  @IsString()
  defaultIpType?: string; // 默认选中的 IP 类型（""=默认IPv4, "ipv6"=IPv6, ...）
}
