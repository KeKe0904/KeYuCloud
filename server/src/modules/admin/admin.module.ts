// 管理员后台模块 — 企业级综合管理后台
// 依赖：PrismaService（全局）/ RainyunModule（全局）/ ProductModule / OrderModule / UserProductModule / TicketModule / MailerModule
// JWT：用户 JWT 由 AuthModule 的全局 JwtModule 提供；管理员 JWT 使用 ADMIN_JWT_SECRET，在 AdminService 内部用 JwtService 显式指定 secret
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { UserProductModule } from '../user-product/user-product.module';
import { TicketModule } from '../ticket/ticket.module';
import { MailerModule } from '../mailer/mailer.module';
import { SmsModule } from '../sms/sms.module';
import { RainyunModule } from '../rainyun/rainyun.module';

@Module({
  imports: [
    // 业务依赖模块
    ProductModule,
    OrderModule,
    UserProductModule,
    TicketModule,
    MailerModule,
    SmsModule,
    RainyunModule,
    ConfigModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthGuard],
  exports: [AdminService],
})
export class AdminModule {}
