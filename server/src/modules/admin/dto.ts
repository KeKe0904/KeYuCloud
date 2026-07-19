// 管理员后台 DTO — 含认证 / 用户 / 商品 / 订单 / 工单 / 财务 / 优惠券 / 公告 / 配置 / 管理员 / 上游
import {
  IsString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsEmail,
  IsIn,
  IsArray,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsDateString,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============ 1. 管理员认证 ============

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  oldPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  // 管理员新密码要求字母+数字组合，且至少 8 位
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/, {
    message: '新密码必须同时包含字母和数字，且至少 8 位',
  })
  newPassword: string;
}

// 管理员更新自己的个人资料（昵称/邮箱/QQ/头像，不能改角色/状态/用户名）
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(128)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  qq?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;
}

// ============ 2. 用户管理 ============

export class UserStatusDto {
  @IsString()
  @IsIn(['ACTIVE', 'BANNED'])
  status: string;
}

export class BalanceAdjustDto {
  @Type(() => Number)
  @IsNumber()
  amount: number; // 正加负减

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  remark: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/, {
    message: '新密码必须同时包含字母和数字，且至少 8 位',
  })
  newPassword: string;
}

// ============ 3. 商品管理（admin 单独定义，与 product/dto 解耦） ============

export class CreateProductDto {
  @Type(() => Number)
  @IsInt()
  upstreamPlanId: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-0.95)
  @Max(5)
  markupRate?: number; // -0.95=接近全免 / 0=原价 / 0.15=加价15%

  @IsOptional()
  @IsString()
  @MaxLength(50)
  group?: string;

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
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
}

// ============ 4. 订单管理 ============

export class RefundDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

// ============ 5. 用户产品操作 ============

export class OperateDto {
  @IsString()
  @IsIn(['start', 'stop', 'restart'])
  action: string;
}

// ============ 6. 工单管理 ============

export class AssignTicketDto {
  @Type(() => Number)
  @IsInt()
  adminId: number;
}

export class ReplyTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  content: string;
}

// ============ 7. 优惠券管理 ============

export class CreateCouponDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @IsString()
  @IsIn(['discount', 'fixed_amount'])
  type: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  totalQty?: number; // -1 表示无限

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  applicableCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string; // 不传则自动生成
}

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  totalQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  applicableCategory?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: string;
}

// ============ 8. 公告管理 ============

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(50000)
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['portal', 'dashboard', 'admin'])
  position?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  content?: string;

  @IsOptional()
  @IsString()
  @IsIn(['portal', 'dashboard', 'admin'])
  position?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: string;
}

// ============ 9. 系统配置 ============

export class ConfigItemDto {
  @IsString()
  @MaxLength(100)
  key: string;

  @IsString()
  @MaxLength(5000)
  value: string;
}

export class UpdateConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigItemDto)
  configs: ConfigItemDto[];
}

// ============ 9.1 雨云 API Key 配置 ============

export class UpdateRainyunApiKeyDto {
  @IsString()
  @MaxLength(256)
  @IsOptional()
  apiKey?: string; // 留空表示不修改（保留原值）

  @IsString()
  @MaxLength(256)
  @IsOptional()
  apiBase?: string; // 雨云 API 基础地址，留空表示不修改

  @IsBoolean()
  @IsOptional()
  mockMode?: boolean; // 是否强制 MOCK 模式（调试用）
}

// ============ 10. 管理员管理 ============

export class CreateAdminDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/, {
    message: '密码必须同时包含字母和数字，且至少 8 位',
  })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @IsOptional()
  @IsString()
  @IsIn(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT', 'TECH'])
  role?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  qq?: string;
}

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @IsOptional()
  @IsString()
  @IsIn(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT', 'TECH'])
  role?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  qq?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/, {
    message: '新密码必须同时包含字母和数字，且至少 8 位',
  })
  password?: string; // 重置密码
}

// ============ 11. 上游白标面板配置 ============

export class UpdatePanelConfigDto {
  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  panel_name?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  bg_url?: string;

  @IsOptional()
  @IsString()
  web_url?: string;

  @IsOptional()
  @IsString()
  css?: string;

  @IsOptional()
  @IsString()
  broadcast?: string;
}
