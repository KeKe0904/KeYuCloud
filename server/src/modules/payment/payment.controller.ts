// 支付 Controller — 路由前缀 api/payment
// 3 个 @Public 端点（易支付回调无鉴权）
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';
import { Public } from '../../common/decorators/public.decorator';
import { ApiResponse } from '../../common/api-response';

@Controller('api/payment')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  // 易支付异步通知（POST，公网回调）
  // 返回纯字符串 'success' / 'fail'，不包装 ApiResponse
  // 验签由 PaymentService.verifyNotify 保证：未配置真实 EPAY_KEY 时不会处理任何伪造通知
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('epay/notify')
  async notify(@Body() body: any) {
    return this.paymentService.handleNotify(body);
  }

  // 易支付异步通知（GET 备用，部分网关用 GET 回调）
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('epay/notify')
  async notifyGet(@Query() query: any) {
    return this.paymentService.handleNotify(query);
  }

  // Mock 模式手动触发支付成功
  // 前端跳转到 generateEpayUrl 返回的 mock URL 后由此端点完成支付
  // 仅在易支付处于 MOCK 模式（开发期）时可调用；生产环境直接 403，避免外部任意标记订单已支付
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('epay/mock-pay')
  async mockPay(@Query('orderNo') orderNo: string) {
    if (!this.paymentService.isMockMode()) {
      throw new ForbiddenException('Mock 支付端点在生产环境已禁用');
    }
    const result = await this.paymentService.mockPay(orderNo);
    return ApiResponse.success(result, 'Mock 支付成功');
  }
}
