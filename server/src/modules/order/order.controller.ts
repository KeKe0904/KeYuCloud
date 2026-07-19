// 订单 Controller — 路由前缀 api/orders（全部需登录）
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/api-response';

@Controller('api/orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private orderService: OrderService) {}

  // 创建订单
  @Post()
  async create(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateOrderDto,
  ) {
    const result = await this.orderService.createOrder(userId, dto);
    return ApiResponse.success(result, '订单创建成功');
  }

  // 用户订单列表
  @Get()
  async list(
    @CurrentUser('sub') userId: number,
    @Query() query: any,
  ) {
    const result = await this.orderService.listUserOrders(userId, query);
    return ApiResponse.success(result);
  }

  // 订单详情（校验归属）
  @Get(':id')
  async detail(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
  ) {
    const result = await this.orderService.getOrder(parseInt(id, 10), userId);
    return ApiResponse.success(result);
  }

  // 余额支付
  @Post(':id/pay/balance')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 防止并发支付刷余额
  async payWithBalance(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
  ) {
    const result = await this.orderService.payWithBalance(
      userId,
      parseInt(id, 10),
    );
    return ApiResponse.success(result, '余额支付成功');
  }

  // 易支付：获取跳转 URL
  @Post(':id/pay/epay')
  async payWithEpay(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
  ) {
    const result = await this.orderService.payOrderWithEpay(
      userId,
      parseInt(id, 10),
    );
    return ApiResponse.success(result);
  }

  // 取消未支付订单
  @Post(':id/cancel')
  async cancel(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
  ) {
    const result = await this.orderService.cancelOrder(
      userId,
      parseInt(id, 10),
    );
    return ApiResponse.success(result, '订单已取消');
  }
}
