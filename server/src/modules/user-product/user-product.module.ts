// 用户产品模块
import { Module } from '@nestjs/common';
import { UserProductController } from './user-product.controller';
import { UserProductService } from './user-product.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [UserProductController],
  providers: [UserProductService],
  exports: [UserProductService],
})
export class UserProductModule {}
