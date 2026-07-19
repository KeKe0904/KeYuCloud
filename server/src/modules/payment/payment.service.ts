// 支付服务 — 易支付对接 + Mock 模式
// 方法：generateEpayUrl / verifyNotify / handleNotify / mockPay
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { OrderService } from '../order/order.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger('Payment');
  private readonly epayPid: string;
  private readonly epayKey: string;
  private readonly epayApiUrl: string;
  private readonly epayNotifyUrl: string;
  private readonly epayReturnUrl: string;
  // Mock 模式：无 Key、Key 含 'mock'、或网关指向 localhost/example.com
  private readonly isMock: boolean;

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => OrderService))
    private order: OrderService,
    private config: ConfigService,
  ) {
    this.epayPid = this.config.get<string>('EPAY_PID') || '1001';
    this.epayKey = this.config.get<string>('EPAY_KEY') || '';
    this.epayApiUrl = this.config.get<string>('EPAY_API_URL') || '';
    this.epayNotifyUrl = this.config.get<string>('EPAY_NOTIFY_URL') || '';
    this.epayReturnUrl = this.config.get<string>('EPAY_RETURN_URL') || '';

    const isMockGateway =
      !this.epayApiUrl ||
      this.epayApiUrl.includes('example.com') ||
      this.epayApiUrl.includes('localhost');
    this.isMock =
      !this.epayKey ||
      this.epayKey.toLowerCase().includes('mock') ||
      isMockGateway;

    if (this.isMock) {
      this.logger.warn('⚠ 易支付处于 MOCK 模式（直接返回支付成功）');
    }
  }

  // ===== 1. 生成易支付跳转 URL =====
  generateEpayUrl(orderNo: string, amount: number, subject: string): string {
    // Mock 模式：返回 mock-pay 端点 URL，前端跳转后手动触发支付成功
    // 从 EPAY_NOTIFY_URL 推导：.../epay/notify → .../epay/mock-pay
    if (this.isMock) {
      const base = this.epayNotifyUrl.replace(/\/notify\/?$/, '');
      return `${base}/mock-pay?orderNo=${encodeURIComponent(orderNo)}`;
    }

    // 真实易支付：构造带签名的跳转 URL
    const params: Record<string, string> = {
      pid: this.epayPid,
      type: 'alipay',
      out_trade_no: orderNo,
      notify_url: this.epayNotifyUrl,
      return_url: this.epayReturnUrl,
      name: subject,
      money: amount.toFixed(2),
    };
    params.sign = this.signParams(params);
    params.sign_type = 'MD5';
    const query = new URLSearchParams(params).toString();
    return `${this.epayApiUrl}?${query}`;
  }

  // ===== 2. 验证易支付回调签名 =====
  // 算法：过滤空值 + sign + sign_type → 按 key 升序拼接 → 追加 KEY → MD5 小写
  verifyNotify(params: any): boolean {
    const sign = params?.sign;
    if (!sign) return false;

    const sorted = Object.keys(params)
      .filter(
        (k) =>
          params[k] !== '' &&
          params[k] !== undefined &&
          params[k] !== null &&
          k !== 'sign' &&
          k !== 'sign_type',
      )
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');

    const expected = crypto
      .createHash('md5')
      .update(`${sorted}${this.epayKey}`)
      .digest('hex');
    return expected.toLowerCase() === String(sign).toLowerCase();
  }

  // ===== 3. 处理易支付异步通知 =====
  // 返回 'success'（易支付要求的小写字符串）或 'fail'
  async handleNotify(params: any): Promise<string> {
    this.logger.log(
      `收到易支付通知: out_trade_no=${params?.out_trade_no} trade_no=${params?.trade_no}`,
    );

    // Mock 模式直接返回成功
    if (this.isMock) {
      return 'success';
    }

    // 验签
    if (!this.verifyNotify(params)) {
      this.logger.warn('易支付验签失败');
      return 'fail';
    }

    // 校验交易状态
    if (params.trade_status !== 'TRADE_SUCCESS') {
      this.logger.warn(
        `易支付通知 trade_status=${params.trade_status}，非成功状态`,
      );
      return 'fail';
    }

    // 查订单
    const order = await this.prisma.order.findUnique({
      where: { orderNo: params.out_trade_no },
    });
    if (!order) {
      this.logger.warn(`易支付通知：订单 ${params.out_trade_no} 不存在`);
      return 'fail';
    }

    // 幂等：已处理过的订单直接返回 success
    if (order.status !== 'PENDING') {
      this.logger.warn(
        `订单 ${order.orderNo} 状态 ${order.status}，已处理过，跳过`,
      );
      return 'success';
    }

    // 标记已支付并触发开通
    await this.order.markPaid(order.id, params.trade_no);
    this.logger.log(`订单 ${order.orderNo} 易支付回调处理完成`);
    return 'success';
  }

  // ===== 4. Mock 模式手动触发支付成功 =====
  // 前端跳转到 mock-pay URL 后，由此方法直接标记订单已支付
  async mockPay(orderNo: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNo },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `订单状态 ${order.status}，不可支付`,
      );
    }

    const tradeNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
    // 标记已支付并触发开通
    await this.order.markPaid(order.id, tradeNo);
    this.logger.log(`Mock 支付成功: 订单 ${orderNo} tradeNo=${tradeNo}`);

    return {
      success: true,
      orderNo,
      tradeNo,
      message: 'Mock 支付成功，订单已触发开通',
    };
  }

  // ===== 易支付签名（私有，供 generateEpayUrl 使用） =====
  private signParams(params: Record<string, string>): string {
    const sorted = Object.keys(params)
      .filter((k) => params[k] !== '' && k !== 'sign' && k !== 'sign_type')
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return crypto
      .createHash('md5')
      .update(`${sorted}${this.epayKey}`)
      .digest('hex');
  }

  // 仅供 PaymentController 用于判断 mock-pay 端点是否可用
  isMockMode(): boolean {
    return this.isMock;
  }
}
