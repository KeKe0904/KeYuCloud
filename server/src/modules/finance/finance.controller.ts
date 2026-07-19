// 用户财务 Controller — 路由前缀 api/finance（全部需登录）
// 4 个端点：overview / recharge / recharges / consumptions
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FinanceService } from './finance.service';
import { ApiResponse } from '../../common/api-response';

@Controller('api/finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private finance: FinanceService) {}

  // 余额概览
  @Get('overview')
  async overview(@CurrentUser('sub') userId: number) {
    const data = await this.finance.getOverview(userId);
    return ApiResponse.success(data);
  }

  // 发起充值：返回易支付跳转 URL
  @Post('recharge')
  async recharge(
    @CurrentUser('sub') userId: number,
    @Body() dto: { amount: number; method?: string },
  ) {
    const data = await this.finance.createRecharge(
      userId,
      Number(dto.amount),
      dto.method || 'epay',
    );
    return ApiResponse.success(data, '充值订单已创建');
  }

  // 充值记录
  @Get('recharges')
  async recharges(
    @CurrentUser('sub') userId: number,
    @Query() query: any,
  ) {
    const data = await this.finance.listRecharges(userId, query);
    return ApiResponse.success(data);
  }

  // 消费记录
  @Get('consumptions')
  async consumptions(
    @CurrentUser('sub') userId: number,
    @Query() query: any,
  ) {
    const data = await this.finance.listConsumptions(userId, query);
    return ApiResponse.success(data);
  }
}
