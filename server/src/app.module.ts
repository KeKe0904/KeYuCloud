import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma.module';
import { RedisModule } from './common/redis.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { ProductModule } from './modules/product/product.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { UserProductModule } from './modules/user-product/user-product.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { FinanceModule } from './modules/finance/finance.module';
import { AdminModule } from './modules/admin/admin.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PublicModule } from './modules/public/public.module';
import { RainyunModule } from './modules/rainyun/rainyun.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // 全局速率限制（防止暴力破解 / 滥用）。默认每 60s 限制 60 次请求
    // 关键端点（登录 / 注册）通过 @Throttle 装饰器单独收紧
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          limit: 60,
          ttl: 60_000,
        },
      ],
      ignoreUserAgents: [/^node-superagent.*$/],
    }),
    PrismaModule,
    RedisModule,
    RainyunModule,
    AuthModule,
    ProductModule,
    OrderModule,
    PaymentModule,
    UserProductModule,
    TicketModule,
    FinanceModule,
    AdminModule,
    MailerModule,
    NotificationModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [
    // 全局 JWT 守卫（接口默认需登录，@Public() 标记的接口放行）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局速率限制守卫
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
