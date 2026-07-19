import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  Matches,
} from 'class-validator';

// 验证码类型枚举（与阿里云 SendSmsVerifyCode.CodeType 一致）
export enum SmsCodeType {
  NUM = 1, // 纯数字
  UPPER = 2, // 纯大写字母
  LOWER = 3, // 纯小写字母
  MIXED_LETTER = 4, // 大小字母混合
  NUM_UPPER = 5, // 数字+大写字母混合
  NUM_LOWER = 6, // 数字+小写字母混合
  NUM_MIXED = 7, // 数字+大小写字母混合
}

export enum SmsDuplicatePolicy {
  OVERWRITE = 1, // 覆盖（旧验证码失效）
  KEEP = 2, // 保留（多个验证码都有效）
}

// 管理员更新短信配置 DTO
export class UpdateSmsConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  accessKeyId?: string;

  @IsOptional()
  @IsString()
  accessKeySecret?: string; // 不传则保留原 Secret

  @IsOptional()
  @IsString()
  signName?: string;

  @IsOptional()
  @IsString()
  templateCode?: string;

  @IsOptional()
  @IsString()
  schemeName?: string;

  @IsOptional()
  @IsNumber()
  @Min(4)
  @Max(8)
  codeLength?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(7)
  codeType?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(3600)
  validTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(86400)
  interval?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(2)
  duplicatePolicy?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyLimit?: number;
}

// 测试发送 DTO
export class TestSmsDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式错误' })
  phone: string;
}

// 用户发送验证码 DTO（公开接口）
export class SendSmsCodeDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式错误' })
  phone: string;

  // 防机器人：图形验证码（可选，由前端提供）
  @IsOptional()
  @IsString()
  captchaId?: string;

  @IsOptional()
  @IsString()
  captcha?: string;
}
