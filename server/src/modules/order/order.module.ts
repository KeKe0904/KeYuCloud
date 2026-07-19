// 订单模块
// 引入 PaymentModule（forwardRef 解决 OrderService ↔ PaymentService 循环依赖）
import { Module, forwardRef } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [forwardRef(() => PaymentModule)],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
