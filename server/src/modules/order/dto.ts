// 订单相关 DTO
import {
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

// 预装软件项（对应雨云 API app_vars 数组中的元素）
export class AppVarDto {
  @Type(() => Number)
  @IsInt()
  app_id: number;

  @IsOptional()
  vars?: Record<string, string>;
}

// 创建订单
export class CreateOrderDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([1, 3, 6, 12])
  duration: number; // 1/3/6/12 月

  @Type(() => Number)
  @IsInt()
  osId: number; // 操作系统模板 ID

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100) // 单笔订单数量上限，防止单次产生超额订单
  quantity?: number; // 默认 1

  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string; // 优惠码（可选）

  // ===== IP 选项（机器价不含 IP，IP 单独计费） =====
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ipType?: string; // IP 类型：""=默认IPv4, "ipv6"=IPv6, "hk_ddosip"=香港高防 ...

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  ipCount?: number; // IP 数量，默认 1

  // ===== 系统盘扩容（额外硬盘，单位 GB，0=不扩容） =====
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  addDiskSize?: number; // 额外硬盘容量 GB（在套餐自带磁盘基础上增加）

  // ===== 系统盘类型（雨云 disk_selling 数组中的一个值） =====
  // 取值：cloud-hdd / cloud-ssd / ssd / hdd
  // 雨云 API 不接受 disk_type 字段（盘型由 plan_id + region 决定），
  // 但本站需记录用户选择用于订单展示 + 计算扩容费用（不同盘型每 GB 月价不同）
  @IsOptional()
  @IsString()
  @MaxLength(32)
  diskType?: string;

  // ===== 网络区域（雨云 zone 字段，可选） =====
  // 取值参考：cn-wz1-1（温州网络1区）等，由前端基于商品 zone 提供可选项
  // 不传时由雨云自动分配
  @IsOptional()
  @IsString()
  @MaxLength(32)
  netZone?: string;

  // ===== 预装软件（对应雨云 app_vars，空数组=不预装） =====
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppVarDto)
  appVars?: AppVarDto[];
}

// 余额支付（无额外字段）
export class PayWithBalanceDto {}
