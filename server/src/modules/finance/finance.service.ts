// 用户财务服务 — 余额概览 / 充值（创建充值订单 + 易支付 URL）/ 流水查询
// 流水来源：BalanceTransaction 表（充值 type=recharge / 消费 type=consume / 退款 type=refund / 调整 type=adjust|admin_adjust）
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { OrderService } from '../order/order.service';
import { parsePaging } from '../../common/api-response';

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private order: OrderService,
  ) {}

  // ===== 1. 余额概览 =====
  async getOverview(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user) throw new BadRequestException('用户不存在');

    // 累计充值 / 累计消费从流水聚合
    const [rechargeAgg, consumeAgg] = await Promise.all([
      this.prisma.balanceTransaction.aggregate({
        where: { userId, type: 'recharge' },
        _sum: { amount: true },
      }),
      this.prisma.balanceTransaction.aggregate({
        where: { userId, type: 'consume' },
        _sum: { amount: true },
      }),
    ]);

    const totalRecharge = Number(rechargeAgg._sum.amount ?? 0);
    // consume 流水中 amount 为负数，取绝对值
    const totalSpent = Math.abs(Number(consumeAgg._sum.amount ?? 0));

    return {
      balance: Number(user.balance),
      frozen: 0, // 暂无冻结概念
      totalRecharge,
      totalSpent,
    };
  }

  // ===== 2. 发起充值 =====
  // 创建一笔 RECHARGE 类型订单（金额 = 充值金额），返回易支付跳转 URL
  async createRecharge(
    userId: number,
    amount: number,
    method: string,
  ): Promise<{ url: string; orderNo: string }> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('充值金额必须大于 0');
    }
    if (amount < 1) {
      throw new BadRequestException('充值金额不能小于 1 元');
    }
    if (amount > 50000) {
      throw new BadRequestException('单次充值金额不能超过 50000 元');
    }

    // 复用 OrderService：创建一笔 type=RECHARGE 的订单
    // OrderService.createOrder 已对接易支付，可生成跳转 URL
    const order = await this.order.createRechargeOrder(userId, amount);
    const url = this.order.getRechargePayUrl(order);
    return { url, orderNo: order.orderNo };
  }

  // ===== 3. 充值记录（type=recharge） =====
  async listRecharges(userId: number, query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where = { userId, type: 'recharge' };
    const [list, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.balanceTransaction.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ===== 4. 消费记录（type=consume / refund） =====
  async listConsumptions(userId: number, query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where = {
      userId,
      type: { in: ['consume', 'refund'] },
    };
    const [list, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { order: { select: { orderNo: true, productName: true } } },
      }),
      this.prisma.balanceTransaction.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }
}
