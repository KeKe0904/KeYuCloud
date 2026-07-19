// 用户财务模块 — 用户后台「财务中心」对应后端
import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [OrderModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
