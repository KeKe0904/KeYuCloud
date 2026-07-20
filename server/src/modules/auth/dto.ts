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

  // 登录用户名：仅允许英文+数字或纯数字，3-16 位，不能包含中文和特殊字符
  @IsString()
  @MinLength(3, { message: '用户名至少 3 位' })
  @MaxLength(16, { message: '用户名最多 16 位' })
  @Matches(/^[a-zA-Z0-9]+$/, { message: '用户名只能包含英文和数字' })
  username: string;

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
  // 登录账号：可以是手机号或用户名
  @IsString()
  @MinLength(3, { message: '请输入登录账号' })
  @MaxLength(32)
  account: string;

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
