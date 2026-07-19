import { Body, Controller, Post, Get, Put, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SmsService } from '../sms/sms.service';
import { RegisterDto, LoginDto, ChangePasswordDto, UpdateProfileDto } from './dto';
import { SendSmsCodeDto } from '../sms/dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/api-response';
import { Request } from 'express';

@Controller('api/auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private sms: SmsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 60s 内最多 5 次注册，防滥用
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const result = await this.auth.register(dto, req.ip);
    return ApiResponse.success(result, '注册成功');
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 60s 内最多 5 次登录，防暴力破解
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.auth.login(dto, req.ip);
    return ApiResponse.success(result, '登录成功');
  }

  // 发送短信验证码（注册场景）
  // 限流：同一 IP 60s 内最多 3 次请求，防止恶意消耗短信配额
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('sms-code')
  async sendSmsCode(@Body() dto: SendSmsCodeDto, @Req() req: Request) {
    const result = await this.sms.sendVerifyCode(dto.phone, 'register', undefined);
    if (!result.success) {
      throw new BadRequestException(result.message);
    }
    return ApiResponse.success({ bizId: result.bizId }, result.message);
  }

  @Get('profile')
  async profile(@CurrentUser('sub') userId: number) {
    const user = await this.auth.getProfile(userId);
    return ApiResponse.success(user);
  }

  @Put('profile')
  async updateProfile(@CurrentUser('sub') userId: number, @Body() dto: UpdateProfileDto) {
    const user = await this.auth.updateProfile(userId, dto);
    return ApiResponse.success(user, '资料已更新');
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 改密码限速
  @Post('change-password')
  async changePassword(@CurrentUser('sub') userId: number, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(userId, dto);
    return ApiResponse.success(null, '密码修改成功');
  }
}
