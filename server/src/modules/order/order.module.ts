// 订单模块
// 引入 PaymentModule（forwardRef 解决 OrderService ↔ PaymentService 循环依赖）
// 引入 ProductModule（forwardRef 解决 OrderService ↔ ProductService 循环依赖，下单时实时校验库存）
import { Module, forwardRef } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { PaymentModule } from '../payment/payment.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [forwardRef(() => PaymentModule), forwardRef(() => ProductModule)],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
