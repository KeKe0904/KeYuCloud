// 订单服务 — 创建 / 查询 / 支付 / 开通 / 取消 / 退款 / 重试
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RainyunService } from '../rainyun/rainyun.service';
import { PaymentService } from '../payment/payment.service';
import { ProductService } from '../product/product.service';
import { CreateOrderDto } from './dto';
import { ApiResponse, parsePaging } from '../../common/api-response';

@Injectable()
export class OrderService {
  private readonly logger = new Logger('Order');

  constructor(
    private prisma: PrismaService,
    private rainyun: RainyunService,
    @Inject(forwardRef(() => PaymentService))
    private payment: PaymentService,
    @Inject(forwardRef(() => ProductService))
    private productService: ProductService,
  ) {}

  // 生成订单号：R + 时间戳 + 4 位随机数
  private genOrderNo(): string {
    const random4 = Math.floor(1000 + Math.random() * 9000);
    return `R${Date.now()}${random4}`;
  }

  // 发送通知（直接写 DB，避免模块间依赖）
  private async sendNotification(
    userId: number,
    type: string,
    title: string,
    content: string,
    link?: string,
  ) {
    try {
      await this.prisma.notification.create({
        data: { userId, type, title, content, link },
      });
    } catch (e: any) {
      this.logger.warn(`发送通知失败: ${e.message}`);
    }
  }

  // ===== 1. 创建订单 =====
  async createOrder(userId: number, dto: CreateOrderDto) {
    // 查商品，校验上架
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('商品不存在');
    if (!product.isOnSale) throw new BadRequestException('商品已下架');

    // 校验时长
    if (![1, 3, 6, 12].includes(dto.duration)) {
      throw new BadRequestException('时长仅支持 1/3/6/12 月');
    }

    const quantity = dto.quantity ?? 1;
    if (quantity < 1) throw new BadRequestException('数量必须大于 0');

    // ===== 库存校验说明 =====
    // 雨云 plans API 的 available_stock 字段并不代表实际可开台数，
    // 真实可开性由 plan_id + zone + machine + line + os_id 组合决定，
    // 所以下单时不基于 available_stock 做硬性拒绝，最终由雨云上游在
    // POST /product/rcs/ 时做权威校验（错误码 70001=区域/机型组合缺货）。
    //
    // 本地 availableStock 仅作为前端展示用途，下单时只做以下处理：
    //   1. 商品已下架（isOnSale=false）→ 直接拒绝（上面已校验）
    //   2. 异步刷新本地快照（不阻断下单）
    const localStock = Number(product.availableStock ?? 0);
    if (localStock > 0 && localStock <= 10) {
      // 本地快照显示库存紧张时，异步刷新本地快照（不阻断下单）
      // 注：雨云 plans API 的 available_stock 不能用于判断能否下单，
      //     所以这里不再做硬性拒绝，只更新本地快照供前端展示
      try {
        const realtime: any = await this.productService.getRealtimeStock(product.id);
        if (realtime?.upstreamAvailable === false) {
          throw new BadRequestException('商品已下架（上游套餐不存在）');
        }
        const upstreamStock = Number(realtime?.availableStock ?? 0);
        if (upstreamStock !== localStock) {
          await this.prisma.product.update({
            where: { id: product.id },
            data: { availableStock: upstreamStock },
          }).catch(() => {});
        }
      } catch (e: any) {
        // 实时校验失败时：若错误是业务异常（下架），直接抛出
        if (e instanceof BadRequestException) throw e;
        // 网络/上游异常 → 仅记录日志，不阻断下单（让雨云最终校验）
        this.logger.warn(`下单前刷新本地库存快照失败（不阻断下单）: ${e.message}`);
      }
    }

    // ===== 价格计算（机器价 + IP 价） =====
    // product.prices: { "1": "95.22", "3": "271.53", ... } 已含优惠率+周期折扣
    // product.ipPrices: { "": "4.50", "ipv6": "0", "hk_ddosip": "27.00", ... } 是 IP 月价（已含优惠率，不含周期折扣）
    const prices = product.prices ? JSON.parse(product.prices) : {};
    const machineMonthlyStr = prices['1'];
    if (machineMonthlyStr === undefined) {
      throw new BadRequestException('商品未配置 1 月价格');
    }
    const machineMonthly = Number(machineMonthlyStr); // 机器月价（已优惠）
    // unitPrice 字段保留为机器月价（不含 IP）
    const unitPrice = machineMonthly;

    // IP 类型与数量
    // 'none' = 用户主动选择不购买独立 IP（NAT 商品默认）
    // undefined/null = 用商品 defaultIpType 兜底
    // '' = 默认 IPv4，'ipv6'/'hk_ddosip'/... = 其他 IP 类型
    const userNoIp = dto.ipType === 'none';
    const ipType = userNoIp ? '' : (dto.ipType ?? product.defaultIpType ?? '');
    const ipCount = Math.max(1, dto.ipCount ?? 1);

    // 取 IP 月价（已优惠率）—— 用户选择不购买 IP 时月价为 0
    const ipPrices = product.ipPrices ? JSON.parse(product.ipPrices) : {};
    const ipMonthly = userNoIp ? 0 : Number(ipPrices[ipType] ?? 0);

    // 校验所选 IP 类型在售（用户选择不购买 IP 时跳过校验）
    if (!userNoIp && ipType) {
      const selling: string[] = product.upstreamIpSelling
        ? JSON.parse(product.upstreamIpSelling)
        : [];
      // NAT 套餐 ip_selling=null 但 ip_prices 非空，用 ip_prices 的 keys 兜底
      const ipPricesKeys = Object.keys(ipPrices);
      const finalSelling = Array.isArray(selling) && selling.length ? selling : ipPricesKeys;
      if (finalSelling.length && !finalSelling.includes(ipType)) {
        throw new BadRequestException(`IP 类型 ${ipType} 不在售卖列表中`);
      }
    }

    // 周期折扣（实测雨云上游）：1月=1.0, 3月=0.9, 6月=0.8, 12月=0.7
    const discountMap: Record<number, number> = { 1: 1.0, 3: 0.9, 6: 0.8, 12: 0.7 };
    const durationDiscount = discountMap[dto.duration] ?? 1.0;

    // ===== 系统盘扩容费用计算 =====
    // 雨云 disk_price: {"cloud-hdd":0.1,"cloud-ssd":0.4,"ssd":0.4,"hdd":0.1} 元/GB/月
    // 用户选择的盘型 diskType 必须在 disk_selling 数组中；
    // 扩容月价 = 扩容GB × 盘型单价 × (1 + markupRate)
    let diskMonthly = 0;
    let diskSubtotal = 0;
    const addDiskSize = dto.addDiskSize ?? 0;
    const diskType = dto.diskType || '';
    if (addDiskSize > 0) {
      // 解析上游磁盘价格
      const upstreamDiskPrices: Record<string, number> = product.upstreamDiskPrices
        ? JSON.parse(product.upstreamDiskPrices)
        : {};
      // 解析在售盘型
      const diskSelling: string[] = product.upstreamDiskSelling
        ? JSON.parse(product.upstreamDiskSelling)
        : [];
      // 校验盘型合法（若上游有 disk_selling 但用户盘型不在列表中 → 拒绝）
      if (diskType && diskSelling.length && !diskSelling.includes(diskType)) {
        throw new BadRequestException(`盘型 ${diskType} 不在售卖列表中`);
      }
      // 取盘型单价：优先用户选择 → 默认 cloud-ssd → 上游价格表第一个
      const finalDiskType =
        diskType ||
        (diskSelling.includes('cloud-ssd') ? 'cloud-ssd' : diskSelling[0] || 'cloud-ssd');
      const upstreamDiskMonthly = Number(upstreamDiskPrices[finalDiskType] ?? 0);
      // 按当前商品优惠率计算售价
      const markupRate = Number(product.markupRate ?? 0);
      diskMonthly = Math.round(upstreamDiskMonthly * (1 + markupRate) * 100) / 100;
      diskSubtotal = Math.round(
        diskMonthly * addDiskSize * dto.duration * durationDiscount * quantity * 100,
      ) / 100;
    }

    // 机器小计 = 月价 × 时长 × 周期折扣 × 数量
    const machineSubtotal = Math.round(
      machineMonthly * dto.duration * durationDiscount * quantity * 100,
    ) / 100;
    // IP 小计 = 月价 × IP 数 × 时长 × 周期折扣 × 数量
    const ipSubtotal = Math.round(
      ipMonthly * ipCount * dto.duration * durationDiscount * quantity * 100,
    ) / 100;
    let totalAmount = Math.round((machineSubtotal + ipSubtotal + diskSubtotal) * 100) / 100;

    // 上游成本快照（机器 + IP）
    const upstreamPrices = product.upstreamPrices
      ? JSON.parse(product.upstreamPrices)
      : {};
    const upstreamMachineMonthly = Number(upstreamPrices['1'] ?? 0);
    const upstreamIpPrices = product.upstreamIpPrices
      ? JSON.parse(product.upstreamIpPrices)
      : {};
    // 用户选择不购买 IP 时，上游 IP 成本为 0
    const upstreamIpMonthly = userNoIp ? 0 : Number(upstreamIpPrices[ipType] ?? 0);
    const upstreamCost = Math.round(
      (upstreamMachineMonthly * dto.duration * durationDiscount +
        upstreamIpMonthly * ipCount * dto.duration * durationDiscount) *
        quantity *
        100,
    ) / 100;

    // 优惠券处理
    let couponId: number | null = null;
    let couponDiscount = 0;
    let userCouponId: number | null = null;
    if (dto.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { code: dto.couponCode },
      });
      if (!coupon) throw new BadRequestException('优惠券不存在');
      if (coupon.status !== 'ACTIVE') throw new BadRequestException('优惠券已失效');
      const now = new Date();
      if (now < coupon.validFrom) throw new BadRequestException('优惠券尚未生效');
      if (coupon.validTo && now > coupon.validTo) {
        throw new BadRequestException('优惠券已过期');
      }
      if (coupon.totalQty !== -1 && coupon.usedQty >= coupon.totalQty) {
        throw new BadRequestException('优惠券已用完');
      }
      // 最小金额校验
      if (totalAmount < Number(coupon.minAmount)) {
        throw new BadRequestException(
          `订单金额未满 ${coupon.minAmount} 元，不可使用该优惠券`,
        );
      }
      // 校验用户是否领取
      const userCoupon = await this.prisma.userCoupon.findUnique({
        where: { userId_couponId: { userId, couponId: coupon.id } },
      });
      if (!userCoupon) throw new BadRequestException('您未领取该优惠券');
      if (userCoupon.status !== 'UNUSED') {
        throw new BadRequestException('优惠券已使用或已过期');
      }

      // 计算折扣
      if (coupon.type === 'discount') {
        // value = 0.9 表示 9 折
        couponDiscount = totalAmount * (1 - Number(coupon.value));
      } else if (coupon.type === 'fixed_amount') {
        couponDiscount = Math.min(Number(coupon.value), totalAmount);
      } else {
        throw new BadRequestException('优惠券类型异常');
      }
      couponDiscount = Math.round(couponDiscount * 100) / 100;
      totalAmount = Math.max(0, totalAmount - couponDiscount);
      couponId = coupon.id;
      userCouponId = userCoupon.id;
    }

    const orderNo = this.genOrderNo();

    // 写入订单（osId / addDiskSize / diskType / netZone / appVars 存入 remark JSON，Order 表无对应字段）
    const remarkMeta: any = { osId: dto.osId };
    if (dto.addDiskSize && dto.addDiskSize > 0) {
      remarkMeta.addDiskSize = dto.addDiskSize;
      if (dto.diskType) remarkMeta.diskType = dto.diskType;
    }
    if (dto.netZone) {
      remarkMeta.netZone = dto.netZone;
    }
    if (Array.isArray(dto.appVars) && dto.appVars.length) {
      // 仅保留 app_id + vars，丢弃 retry 等业务字段
      remarkMeta.appVars = dto.appVars.map((a) => ({
        app_id: a.app_id,
        vars: a.vars || {},
      }));
    }

    const order = await this.prisma.order.create({
      data: {
        orderNo,
        userId,
        productId: product.id,
        productName: product.name,
        duration: dto.duration,
        unitPrice, // 机器月价（不含 IP，已优惠）
        quantity,
        totalAmount,
        upstreamCost,
        // IP 选项快照：'none'=用户选择不购买独立 IP / ''=默认 IPv4 / 其他=对应类型
        ipType: userNoIp ? 'none' : ipType,
        ipCount,
        ipUnitPrice: ipMonthly || null,
        machineUnitPrice: machineMonthly,
        couponId,
        couponDiscount,
        status: 'PENDING',
        remark: JSON.stringify(remarkMeta),
      },
    });

    // 标记优惠券已使用
    if (userCouponId) {
      await this.prisma.userCoupon.update({
        where: { id: userCouponId },
        data: { status: 'USED', orderId: order.id, usedAt: new Date() },
      });
      await this.prisma.coupon.update({
        where: { id: couponId! },
        data: { usedQty: { increment: 1 } },
      });
    }

    this.logger.log(
      `用户 ${userId} 创建订单 ${orderNo} 金额=${totalAmount} 商品=${product.name}`,
    );

    return {
      id: order.id,
      orderId: order.id, // 保留向后兼容
      orderNo: order.orderNo,
      totalAmount: Number(order.totalAmount),
      payOptions: ['BALANCE', 'EPAY'],
    };
  }

  // ===== 2. 订单详情（userId 校验归属） =====
  async getOrder(id: number, userId?: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { product: true, userProduct: true },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (userId !== undefined && order.userId !== userId) {
      throw new ForbiddenException('无权访问该订单');
    }
    return order;
  }

  // ===== 3. 用户订单列表 =====
  async listUserOrders(userId: number, query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = { userId };
    if (query.status) where.status = query.status;
    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: pageSize,
        include: { product: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ===== 4. 管理后台订单列表 =====
  async listAllOrders(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = Number(query.userId);
    if (query.keyword) {
      where.OR = [
        { orderNo: { contains: query.keyword } },
        { payTradeNo: { contains: query.keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: pageSize,
        include: {
          product: true,
          user: {
            select: { id: true, nickname: true, phone: true, email: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ===== 5. 余额支付 =====
  async payWithBalance(userId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) {
      throw new ForbiddenException('无权操作该订单');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException('订单状态不可支付');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const balance = Number(user.balance);
    const amount = Number(order.totalAmount);
    if (balance < amount) {
      throw new BadRequestException(
        `余额不足，需 ${amount} 元，当前余额 ${balance} 元`,
      );
    }

    // 事务：扣余额 → 写流水 → 更新订单
    const tradeNo = `BAL${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await this.prisma.$transaction(async (tx) => {
      const newBalance = balance - amount;
      await tx.user.update({
        where: { id: userId },
        data: { balance: newBalance },
      });
      await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'consume',
          amount: -amount,
          balanceAfter: newBalance,
          orderId: order.id,
          remark: `余额支付订单 ${order.orderNo}`,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          payMethod: 'BALANCE',
          payTradeNo: tradeNo,
          payTime: new Date(),
          status: 'PAID',
        },
      });
    });

    this.logger.log(`订单 ${order.orderNo} 余额支付成功，开始开通`);
    // 开通产品
    await this.openProduct(orderId);
    return { orderId: order.id, orderNo: order.orderNo, paid: true };
  }

  // ===== 6. 易支付：生成跳转 URL（调用 PaymentService） =====
  async payOrderWithEpay(userId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) {
      throw new ForbiddenException('无权操作该订单');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException('订单状态不可支付');
    }

    const payUrl = this.payment.generateEpayUrl(
      order.orderNo,
      Number(order.totalAmount),
      `订单 ${order.orderNo}`,
    );
    return { payUrl };
  }

  // ===== 7. 开通产品（核心） =====
  async openProduct(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true, user: true },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'PAID' && order.status !== 'OPENING') {
      throw new BadRequestException(`订单状态 ${order.status}，不可开通`);
    }

    // 标记 OPENING
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'OPENING' },
    });

    try {
      let upstreamRcsId = order.upstreamRcsId;
      let upstreamTaskId = order.upstreamTaskId;

      // 如果尚未创建 RCS，则创建
      if (!upstreamRcsId) {
        // 解析 remark JSON（含 osId / addDiskSize / diskType / netZone / appVars）
        let osId = 3;
        let addDiskSize: number | undefined;
        let netZone: string | undefined;
        let appVars: Array<{ app_id: number; vars: Record<string, string> }> | undefined;
        try {
          const meta = JSON.parse(order.remark || '{}');
          if (meta.osId) osId = meta.osId;
          if (meta.addDiskSize && Number(meta.addDiskSize) > 0) {
            addDiskSize = Number(meta.addDiskSize);
          }
          if (meta.netZone) {
            netZone = String(meta.netZone);
          }
          if (Array.isArray(meta.appVars) && meta.appVars.length) {
            appVars = meta.appVars.map((a: any) => ({
              app_id: Number(a.app_id),
              vars: a.vars || {},
            }));
          }
        } catch {
          // remark 非 JSON，使用默认 osId
        }

        // 雨云 IP 数量：
        //   - 订单 ipType 为 'none' 或空 → 不传 with_eip_num（不购买独立 IP）
        //   - 订单 ipType 非空 → 传 ipCount
        const orderIpType = order.ipType || '';
        const withEipNum =
          orderIpType && orderIpType !== 'none'
            ? Math.max(1, order.ipCount || 1)
            : undefined;

        // 网络区域：优先用订单中用户选择的 netZone，否则用商品 zone 兜底
        // 雨云 createRcs 的 zone 参数表示「内网可用区」，由用户在前端选择
        const rcsZone = netZone || order.product.zone || undefined;

        const rcs: any = await this.rainyun.createRcs(
          {
            plan_id: order.product.upstreamPlanId,
            os_id: osId,
            duration: order.duration,
            zone: rcsZone,
            add_disk_size: addDiskSize,
            app_vars: appVars,
            with_eip_num: withEipNum,
          },
          `user:${order.userId}`,
        );

        upstreamRcsId = Number(rcs.id);
        upstreamTaskId = rcs.task_id ? Number(rcs.task_id) : null;

        // 立即保存 upstreamRcsId，防止后续失败导致重复创建
        await this.prisma.order.update({
          where: { id: orderId },
          data: { upstreamRcsId, upstreamTaskId },
        });
      }

      // 获取 RCS 详情（含 os_name / ipv4 / ipv6 等）
      let rcsDetail: any = null;
      try {
        rcsDetail = await this.rainyun.getRcs(upstreamRcsId, `user:${order.userId}`);
      } catch (e: any) {
        this.logger.warn(`获取 RCS ${upstreamRcsId} 详情失败: ${e.message}`);
      }

      // 分配给 panel_user
      if (order.user.panelUserName) {
        try {
          await this.rainyun.assignProductToPanelUser(
            order.user.panelUserName,
            upstreamRcsId,
            'rcs',
            'add',
            `user:${order.userId}`,
          );
          this.logger.log(
            `订单 ${order.orderNo} 分配 panel_user ${order.user.panelUserName} 成功`,
          );
        } catch (e: any) {
          this.logger.warn(
            `订单 ${order.orderNo} 分配 panel_user 失败: ${e.message}（继续创建本地记录）`,
          );
        }
      }

      // 计算 expireAt
      const expireAt = rcsDetail?.expire_at
        ? new Date(rcsDetail.expire_at)
        : new Date(Date.now() + order.duration * 30 * 86400 * 1000);

      // 创建 UserProduct 记录（若不存在）
      let userProduct = await this.prisma.userProduct.findUnique({
        where: { orderId },
      });
      if (!userProduct) {
        userProduct = await this.prisma.userProduct.create({
          data: {
            userId: order.userId,
            productId: order.productId,
            orderId: order.id,
            upstreamRcsId,
            upstreamRcsName: rcsDetail?.host_name || rcsDetail?.name || `rcs-${upstreamRcsId}`,
            panelUserName: order.user.panelUserName,
            state: 'RUNNING',
            stateSyncedAt: new Date(),
            expireAt,
            zone: rcsDetail?.zone || order.product.zone,
            zoneName: rcsDetail?.zone_name || order.product.zoneName,
            osId: rcsDetail?.os_id ?? null,
            osName: rcsDetail?.os_name || rcsDetail?.os_chinese_name || null,
            cpu: rcsDetail?.cpu || order.product.cpu,
            memory: rcsDetail?.memory || order.product.memory,
            disk: rcsDetail?.disk || order.product.disk,
            bandwidth: rcsDetail?.bandwidth || order.product.bandwidth,
            ipv4: rcsDetail?.ipv4 || null,
            ipv6: rcsDetail?.ipv6 || null,
          },
        });
      }

      // 更新订单 status=OPENED
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'OPENED',
          userProductId: userProduct.id,
          openTime: new Date(),
          openResult: '开通成功',
        },
      });

      // 更新商品 salesCount + 扣减本地库存快照
      // availableStock: 0=无限库存（不扣减）/ >0=剩余可开数量（扣减 order.quantity）
      // 注：本地扣减是乐观估计，最终以雨云上游 available_stock 为准（定时同步任务会校正）
      const currentProduct = await this.prisma.product.findUnique({
        where: { id: order.productId },
        select: { availableStock: true },
      });
      const currentStock = Number(currentProduct?.availableStock ?? 0);
      const updateData: any = { salesCount: { increment: order.quantity } };
      if (currentStock > 0) {
        // 库存有限时扣减，最低扣到 0（不出现负数）
        updateData.availableStock = Math.max(0, currentStock - order.quantity);
      }
      await this.prisma.product.update({
        where: { id: order.productId },
        data: updateData,
      });

      // 发通知
      await this.sendNotification(
        order.userId,
        'order',
        '订单开通成功',
        `您的订单 ${order.orderNo} 已成功开通，产品 ${order.product.name} 已就绪。`,
        `/user/products/${userProduct.id}`,
      );

      this.logger.log(`订单 ${order.orderNo} 开通成功 UserProduct id=${userProduct.id}`);
      return { success: true, userProductId: userProduct.id };
    } catch (e: any) {
      // 提取雨云原始错误信息（可能是 BadRequestException 已包装过）
      const rawErr = String(e?.message || '');
      this.logger.error(`订单 ${order.orderNo} 开通失败: ${rawErr}`);

      // 错误分类，给出更友好的中文提示
      // 注：雨云错误码 70001 = 区域/机型库存不足（并非"套餐被抢光"）
      //   plans API 的 available_stock 字段不等于实际可开台数，
      //   真实可开性由 plan_id + zone + machine + line + os_id 组合决定，
      //   所以下单时雨云上游会做最终校验。
      let userFriendlyMsg = rawErr;
      if (/余额不足|余额|balance|insufficient|Money/i.test(rawErr)) {
        userFriendlyMsg = '雨云账户余额不足，请联系管理员充值';
      } else if (/区域.*机型.*库存|区域\/机型库存不足|70001/i.test(rawErr)) {
        // 雨云错误码 70001：当前所选区域/机型组合缺货
        userFriendlyMsg = '当前所选区域/机型组合暂时缺货，请尝试其他区域、机型或稍后再试';
      } else if (/套餐不存在|plan.*not.*found|套餐已下架/i.test(rawErr)) {
        userFriendlyMsg = '套餐已下架，请选择其他套餐';
      } else if (/参数错误|invalid.*param|参数不/i.test(rawErr)) {
        userFriendlyMsg = `参数错误：${rawErr}`;
      } else if (/zone.*not.*found|区域不存在|区域不支持/i.test(rawErr)) {
        userFriendlyMsg = '所选区域不可用，请选择其他区域';
      } else if (/os.*not.*found|系统不存在|os_id/i.test(rawErr)) {
        userFriendlyMsg = '所选操作系统不可用，请重新选择';
      } else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|网络|连接/i.test(rawErr)) {
        userFriendlyMsg = '网络异常，暂时无法连接上游服务器，请稍后重试';
      }

      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          openResult: `开通失败: ${rawErr}`,
        },
      });
      await this.sendNotification(
        order.userId,
        'order',
        '订单开通失败',
        `您的订单 ${order.orderNo} 开通失败：${userFriendlyMsg}。可点击「重试开通」重新尝试，或联系客服处理。`,
        `/user/orders/${orderId}`,
      );
      throw new BadRequestException(`开通失败：${userFriendlyMsg}`);
    }
  }

  // ===== 8. 取消未支付订单 =====
  async cancelOrder(userId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) {
      throw new ForbiddenException('无权操作该订单');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException('仅未支付订单可取消');
    }

    // 退还优惠券
    if (order.couponId) {
      const uc = await this.prisma.userCoupon.findFirst({
        where: { userId, couponId: order.couponId, orderId: order.id },
      });
      if (uc) {
        await this.prisma.userCoupon.update({
          where: { id: uc.id },
          data: { status: 'UNUSED', orderId: null, usedAt: null },
        });
        await this.prisma.coupon.update({
          where: { id: order.couponId },
          data: { usedQty: { decrement: 1 } },
        });
      }
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CLOSED' },
    });
  }

  // ===== 9. 退款 =====
  async refundOrder(orderId: number, reason: string, adminId?: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (!['PAID', 'OPENED', 'FAILED'].includes(order.status)) {
      throw new BadRequestException(`订单状态 ${order.status} 不可退款`);
    }

    // 若已开通（有 upstreamRcsId），先调雨云 free 释放
    if (order.upstreamRcsId) {
      try {
        await this.rainyun.rcsAction(
          order.upstreamRcsId,
          'free',
          undefined,
          `admin:${adminId || 'system'}`,
        );
        this.logger.log(`已释放上游 RCS ${order.upstreamRcsId}`);
      } catch (e: any) {
        this.logger.warn(
          `释放上游 RCS ${order.upstreamRcsId} 失败: ${e.message}（继续退款流程）`,
        );
      }
    }

    // 更新 UserProduct 状态
    if (order.userProductId) {
      await this.prisma.userProduct
        .update({
          where: { id: order.userProductId },
          data: { state: 'EXPIRED' },
        })
        .catch(() => {});
    }

    const amount = Number(order.totalAmount);

    // 余额退还（事务：加余额 → 写流水 → 更新订单）
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: order.userId } });
      const newBalance = Number(user!.balance) + amount;
      await tx.user.update({
        where: { id: order.userId },
        data: { balance: newBalance },
      });
      await tx.balanceTransaction.create({
        data: {
          userId: order.userId,
          type: 'refund',
          amount: amount,
          balanceAfter: newBalance,
          orderId: order.id,
          adminId: adminId || null,
          remark: reason,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'REFUNDED', openResult: `退款: ${reason}` },
      });
    });

    await this.sendNotification(
      order.userId,
      'order',
      '订单已退款',
      `您的订单 ${order.orderNo} 已退款 ${amount} 元，余额已返还。原因：${reason}`,
      `/user/orders/${orderId}`,
    );

    this.logger.log(`订单 ${order.orderNo} 已退款 ${amount} 元`);
    return { success: true };
  }

  // ===== 10. 重试开通失败订单 =====
  async retryOpen(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'FAILED') {
      throw new BadRequestException('仅失败订单可重试');
    }

    // 检查是否已有 UserProduct（部分成功的情况）
    const existing = await this.prisma.userProduct.findUnique({
      where: { orderId },
    });
    if (existing) {
      // RCS 已创建且 UserProduct 已存在，只需补全订单状态
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'OPENED',
          userProductId: existing.id,
          openTime: new Date(),
          openResult: '重试开通成功（已存在产品记录）',
        },
      });
      return { success: true, userProductId: existing.id };
    }

    // 重置为 PAID 状态，重新走开通流程
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'PAID' },
    });
    return this.openProduct(orderId);
  }

  // ===== 11. 易支付回调标记已支付，然后调 openProduct =====
  async markPaid(orderId: number, payTradeNo: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'PENDING') {
      this.logger.warn(
        `订单 ${order.orderNo} 状态非 PENDING（${order.status}），跳过支付回调`,
      );
      return;
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        payMethod: 'EPAY',
        payTradeNo,
        payTime: new Date(),
      },
    });
    this.logger.log(`订单 ${order.orderNo} 易支付成功 tradeNo=${payTradeNo}`);

    // 充值订单：直接加余额 + 写流水，不触发开通
    if (order.type === 'RECHARGE') {
      await this.applyRecharge(order);
      return;
    }
    // 商品订单：开通产品
    await this.openProduct(orderId);
  }

  // ===== 充值订单：加余额 + 写 BalanceTransaction =====
  private async applyRecharge(order: {
    id: number;
    userId: number;
    orderNo: string;
    totalAmount: any;
  }) {
    const amount = Number(order.totalAmount);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: order.userId },
        select: { balance: true },
      });
      const newBalance = Number(user?.balance ?? 0) + amount;
      await tx.user.update({
        where: { id: order.userId },
        data: { balance: newBalance },
      });
      await tx.balanceTransaction.create({
        data: {
          userId: order.userId,
          type: 'recharge',
          amount,
          balanceAfter: newBalance,
          orderId: order.id,
          remark: `充值订单 ${order.orderNo}`,
        },
      });
    });
    this.logger.log(`充值完成: 订单 ${order.orderNo} +¥${amount}`);
  }

  // ===== 创建充值订单 =====
  // 用于用户后台「财务中心」发起充值：返回订单 + 易支付跳转 URL
  async createRechargeOrder(userId: number, amount: number) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('充值金额必须大于 0');
    }
    if (amount < 1) {
      throw new BadRequestException('充值金额不能小于 1 元');
    }
    if (amount > 50000) {
      throw new BadRequestException('单次充值金额不能超过 50000 元');
    }
    const orderNo = `RC${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const order = await this.prisma.order.create({
      data: {
        orderNo,
        userId,
        type: 'RECHARGE',
        productId: null,
        productName: '账户充值',
        duration: 0,
        unitPrice: 0,
        totalAmount: amount,
        upstreamCost: 0,
        status: 'PENDING',
      },
    });
    return order;
  }

  // ===== 获取充值订单的易支付跳转 URL =====
  getRechargePayUrl(order: { orderNo: string; totalAmount: any }): string {
    return this.payment.generateEpayUrl(
      order.orderNo,
      Number(order.totalAmount),
      '账户充值',
    );
  }
}
