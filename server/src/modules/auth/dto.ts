import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsEmail,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式错误' })
  phone: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(32)
  // 密码复杂度：必须同时包含字母和数字（防纯数字/纯字母弱口令）
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/, {
    message: '密码必须同时包含字母和数字',
  })
  password: string;

  @IsString()
  @MinLength(4, { message: '短信验证码至少 4 位' })
  @MaxLength(8)
  smsCode: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  inviteCode?: string;
}

export class LoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式错误' })
  phone: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  oldPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  // 新密码同样要求字母+数字组合
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/, {
    message: '新密码必须同时包含字母和数字',
  })
  newPassword: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  // 头像 URL，前端会拼接到 <img src>，须限制长度
  avatar?: string;
}
