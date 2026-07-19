import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationModule } from '../notification/notification.module';
import { SmsModule } from '../sms/sms.module';
import { MailerModule } from '../mailer/mailer.module';

// 安全检查：JWT_SECRET 必须由环境变量提供，不允许使用硬编码 fallback
function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || secret.length < 16) {
    throw new Error(
      'JWT_SECRET 未配置或长度不足 16 位，请在 .env 中设置强随机密钥（不少于 32 字节推荐）',
    );
  }
  return secret;
}

@Module({
  imports: [
    ConfigModule,
    NotificationModule,
    SmsModule,
    MailerModule,
    // 全局 JwtModule（用户 JWT）— 全局注册使 JwtAuthGuard 在任何模块都能注入
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
