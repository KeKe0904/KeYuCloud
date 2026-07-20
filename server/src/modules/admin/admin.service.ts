// 管理员后台服务 — 企业级综合服务（认证 / 仪表盘 / 用户 / 商品 / 订单 / 产品 / 工单 / 财务 / 上游 / SMTP / 优惠券 / 公告 / 配置 / 管理员 / 审计）
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { PrismaService } from '../../common/prisma.service';
import { parsePaging } from '../../common/api-response';
import { sanitizeText } from '../../common/sanitize.util';
import { CryptoUtil } from '../../common/crypto.util';
import { RainyunService } from '../rainyun/rainyun.service';
import { ProductService } from '../product/product.service';
import { OrderService } from '../order/order.service';
import { UserProductService } from '../user-product/user-product.service';
import { TicketService } from '../ticket/ticket.service';
import { MailerService } from '../mailer/mailer.service';
import { SmsService } from '../sms/sms.service';
import {
  LoginDto,
  ChangePasswordDto,
  UserStatusDto,
  BalanceAdjustDto,
  ResetPasswordDto,
  CreateProductDto,
  UpdateProductDto,
  RefundDto,
  OperateDto,
  AssignTicketDto,
  ReplyTicketDto,
  CreateCouponDto,
  UpdateCouponDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  UpdateConfigDto,
  CreateAdminDto,
  UpdateAdminDto,
  UpdateProfileDto,
  UpdatePanelConfigDto,
  UpdateRainyunApiKeyDto,
} from './dto';

// 销售额统计口径：已支付 / 开通中 / 已开通 三种状态计入销售额
const SALES_STATUS = ['PAID', 'OPENING', 'OPENED'];

// 审计日志上下文（由 controller 注入 ip 与 userAgent）
export interface AuditContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger('Admin');

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private rainyun: RainyunService,
    private product: ProductService,
    private order: OrderService,
    private userProduct: UserProductService,
    private ticket: TicketService,
    private mailer: MailerService,
    private sms: SmsService,
  ) {}

  // ============ 1. 管理员认证 ============

  /** 管理员登录 */
  async login(dto: LoginDto, ctx: AuditContext = {}) {
    const admin = await this.prisma.admin.findUnique({
      where: { username: dto.username },
    });
    if (!admin) throw new UnauthorizedException('用户名或密码错误');
    if (admin.status !== 'ACTIVE') {
      throw new ForbiddenException('管理员账号已被禁用');
    }
    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('用户名或密码错误');

    // 更新登录信息
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ctx.ip || null },
    });

    // 签发 JWT（使用 ADMIN_JWT_SECRET）
    const token = this.jwt.sign(
      {
        sub: admin.id,
        username: admin.username,
        role: admin.role,
      },
      {
        secret: this.config.get<string>('ADMIN_JWT_SECRET'),
        expiresIn: this.config.get<string>('ADMIN_JWT_EXPIRES_IN') || '1d',
      },
    );

    // 登录审计
    await this.writeAuditLog(admin.id, 'admin', 'login', {
      targetType: 'admin',
      targetId: admin.id,
      newValue: JSON.stringify({ ip: ctx.ip, at: new Date().toISOString() }),
      ctx,
    });

    return {
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        nickname: admin.nickname,
        role: admin.role,
        email: admin.email,
      },
    };
  }

  /** 当前管理员信息 */
  async getProfile(adminId: number) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        username: true,
        nickname: true,
        role: true,
        permissions: true,
        status: true,
        email: true,
        qq: true,
        avatarUrl: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
      },
    });
    if (!admin) throw new NotFoundException('管理员不存在');
    return {
      ...admin,
      permissions: admin.permissions ? JSON.parse(admin.permissions) : [],
    };
  }

  /** 修改自己密码 */
  async changePassword(adminId: number, dto: ChangePasswordDto, ctx: AuditContext = {}) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('管理员不存在');
    const ok = await bcrypt.compare(dto.oldPassword, admin.passwordHash);
    if (!ok) throw new BadRequestException('原密码错误');

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash: newHash },
    });

    await this.writeAuditLog(adminId, 'admin', 'change_password', {
      targetType: 'admin',
      targetId: adminId,
      ctx,
    });
    return { success: true };
  }

  /** 更新自己的个人资料（昵称/邮箱/QQ/头像，不允许改用户名/角色/状态） */
  async updateProfile(adminId: number, dto: UpdateProfileDto, ctx: AuditContext = {}) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('管理员不存在');

    const data: any = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname.trim() || null;
    if (dto.email !== undefined) data.email = dto.email.trim() || null;
    if (dto.qq !== undefined) {
      const qq = dto.qq.trim();
      if (qq && !/^\d{4,12}$/.test(qq)) {
        throw new BadRequestException('QQ 号格式不正确（4-12 位数字）');
      }
      data.qq = qq || null;
      // 自动同步 QQ 头像
      if (qq) {
        data.avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=140`;
      }
    }
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl.trim() || null;

    if (Object.keys(data).length === 0) {
      return this.formatProfile(admin);
    }

    const updated = await this.prisma.admin.update({
      where: { id: adminId },
      data,
    });

    await this.writeAuditLog(adminId, 'admin', 'update_profile', {
      targetType: 'admin',
      targetId: adminId,
      oldValue: JSON.stringify({
        nickname: admin.nickname,
        email: admin.email,
        qq: admin.qq,
        avatarUrl: admin.avatarUrl,
      }),
      newValue: JSON.stringify({
        nickname: updated.nickname,
        email: updated.email,
        qq: updated.qq,
        avatarUrl: updated.avatarUrl,
      }),
      ctx,
    });

    return this.formatProfile(updated);
  }

  private formatProfile(admin: any) {
    return {
      id: admin.id,
      username: admin.username,
      nickname: admin.nickname,
      role: admin.role,
      permissions: admin.permissions ? JSON.parse(admin.permissions) : [],
      status: admin.status,
      email: admin.email,
      qq: admin.qq,
      avatarUrl: admin.avatarUrl,
      lastLoginAt: admin.lastLoginAt,
      lastLoginIp: admin.lastLoginIp,
      createdAt: admin.createdAt,
    };
  }

  // ============ 2. 仪表盘 ============

  async getDashboard() {
    const todayStart = dayjs().startOf('day').toDate();
    const todayEnd = dayjs().endOf('day').toDate();
    const yesterdayStart = dayjs().subtract(1, 'day').startOf('day').toDate();
    const yesterdayEnd = dayjs().subtract(1, 'day').endOf('day').toDate();

    // 今日 / 昨日数据（并行）
    const [
      todayNewUsers,
      todayOrders,
      todaySales,
      todayOpenedProducts,
      yesterdayNewUsers,
      yesterdayOrders,
      yesterdaySales,
      yesterdayOpenedProducts,
      totalUsers,
      totalOrders,
      totalSales,
      totalProducts,
      failedOrders,
      pendingTickets,
      syncFailedUsers,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: SALES_STATUS },
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.userProduct.count({
        where: { createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: yesterdayStart, lt: yesterdayEnd } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: yesterdayStart, lt: yesterdayEnd } },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: SALES_STATUS },
          createdAt: { gte: yesterdayStart, lt: yesterdayEnd },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.userProduct.count({
        where: { createdAt: { gte: yesterdayStart, lt: yesterdayEnd } },
      }),
      this.prisma.user.count(),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        where: { status: { in: SALES_STATUS } },
        _sum: { totalAmount: true },
      }),
      this.prisma.userProduct.count(),
      this.prisma.order.count({ where: { status: 'FAILED' } }),
      this.prisma.ticket.count({
        where: { status: 'OPEN', assignedAdminId: null },
      }),
      this.prisma.user.count({ where: { panelUserStatus: 'FAILED' } }),
    ]);

    // 上游账号信息（失败容错）
    let upstreamBalance: any = null;
    let upstreamMode = 'UNKNOWN';
    try {
      upstreamBalance = await this.rainyun.getAccount();
      upstreamMode = this.rainyun.isMockMode() ? 'MOCK' : 'LIVE';
    } catch (e: any) {
      this.logger.warn(`获取上游账号信息失败: ${e.message}`);
    }

    // 统一字段名（兼容 MOCK 与 LIVE）
    const upstreamNormalized: any = {
      balance: upstreamBalance?.balance ?? upstreamBalance?.Money ?? null,
      points: upstreamBalance?.points ?? upstreamBalance?.Points ?? null,
      username: upstreamBalance?.username ?? upstreamBalance?.Name ?? null,
    };

    // 近 7 天销售额趋势
    const salesTrend: { date: string; amount: number }[] = [];
    // 近 7 天新增用户趋势
    const userTrend: { date: string; count: number }[] = [];
    const trendDays: { start: Date; end: Date; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day');
      trendDays.push({
        start: d.startOf('day').toDate(),
        end: d.endOf('day').toDate(),
        label: d.format('YYYY-MM-DD'),
      });
    }
    const salesAggs = await Promise.all(
      trendDays.map((d) =>
        this.prisma.order.aggregate({
          where: {
            status: { in: SALES_STATUS },
            createdAt: { gte: d.start, lt: d.end },
          },
          _sum: { totalAmount: true },
        }),
      ),
    );
    for (let i = 0; i < trendDays.length; i++) {
      salesTrend.push({
        date: trendDays[i].label,
        amount: Number(salesAggs[i]._sum.totalAmount ?? 0),
      });
    }
    const userCounts = await Promise.all(
      trendDays.map((d) =>
        this.prisma.user.count({
          where: { createdAt: { gte: d.start, lt: d.end } },
        }),
      ),
    );
    for (let i = 0; i < trendDays.length; i++) {
      userTrend.push({ date: trendDays[i].label, count: userCounts[i] });
    }

    return {
      today: {
        newUsers: todayNewUsers,
        orders: todayOrders,
        sales: Number(todaySales._sum.totalAmount ?? 0),
        openedProducts: todayOpenedProducts,
      },
      yesterday: {
        newUsers: yesterdayNewUsers,
        orders: yesterdayOrders,
        sales: Number(yesterdaySales._sum.totalAmount ?? 0),
        openedProducts: yesterdayOpenedProducts,
      },
      total: {
        users: totalUsers,
        orders: totalOrders,
        sales: Number(totalSales._sum.totalAmount ?? 0),
        products: totalProducts,
      },
      pending: {
        failedOrders,
        pendingTickets,
        syncFailedUsers,
      },
      upstream: {
        balance: upstreamNormalized.balance,
        points: upstreamNormalized.points,
        username: upstreamNormalized.username,
        mode: upstreamMode,
      },
      salesTrend,
      userTrend,
    };
  }

  // ============ 3. 用户管理 ============

  /** 用户列表（分页，支持筛选 phone/email/status/keyword，可按余额/注册时间排序） */
  async listUsers(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.phone) where.phone = { contains: query.phone };
    if (query.email) where.email = { contains: query.email };
    if (query.keyword) {
      where.OR = [
        { phone: { contains: query.keyword } },
        { email: { contains: query.keyword } },
        { nickname: { contains: query.keyword } },
      ];
    }

    // 排序
    let orderBy: any[] = [{ createdAt: 'desc' }];
    if (query.sortBy === 'balance') {
      orderBy = [{ balance: query.sortOrder === 'asc' ? 'asc' : 'desc' }];
    } else if (query.sortBy === 'createdAt') {
      orderBy = [{ createdAt: query.sortOrder === 'asc' ? 'asc' : 'desc' }];
    }

    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          phone: true,
          email: true,
          nickname: true,
          balance: true,
          status: true,
          panelUserName: true,
          panelUserStatus: true,
          panelUserSyncedAt: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  /** 用户详情（含 panel_user 信息、订单数、产品数、工单数、总消费金额） */
  async getUserDetail(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            orderNo: true,
            productName: true,
            totalAmount: true,
            status: true,
            createdAt: true,
          },
        },
        userProducts: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            upstreamRcsName: true,
            state: true,
            expireAt: true,
          },
        },
        tickets: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            ticketNo: true,
            title: true,
            status: true,
            createdAt: true,
          },
        },
        _count: { select: { orders: true, userProducts: true, tickets: true } },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');

    // 总消费金额（已支付订单 sum totalAmount）
    const consumeAgg = await this.prisma.order.aggregate({
      where: { userId: id, status: { in: SALES_STATUS } },
      _sum: { totalAmount: true },
    });

    return {
      ...user,
      balance: Number(user.balance),
      totalConsume: Number(consumeAgg._sum.totalAmount ?? 0),
    };
  }

  /** 封禁/解封用户 */
  async updateUserStatus(adminId: number, userId: number, dto: UserStatusDto, ctx: AuditContext = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.status === dto.status) {
      throw new BadRequestException(`用户已是 ${dto.status} 状态`);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: dto.status },
    });
    await this.writeAuditLog(adminId, 'user', dto.status === 'BANNED' ? 'ban' : 'unban', {
      targetType: 'user',
      targetId: userId,
      oldValue: JSON.stringify({ status: user.status }),
      newValue: JSON.stringify({ status: dto.status }),
      ctx,
    });
    return { id: updated.id, status: updated.status };
  }

  /** 余额调整（事务：User.balance 更新 + BalanceTransaction 创建） */
  async adjustBalance(adminId: number, userId: number, dto: BalanceAdjustDto, ctx: AuditContext = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    return this.prisma.$transaction(async (tx) => {
      const currentBalance = Number(user.balance);
      const newBalance = +(currentBalance + dto.amount).toFixed(2);
      if (newBalance < 0) {
        throw new BadRequestException('调整后余额不能为负');
      }
      await tx.user.update({
        where: { id: userId },
        data: { balance: newBalance },
      });
      const txn = await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'admin_adjust',
          amount: dto.amount,
          balanceAfter: newBalance,
          adminId,
          remark: dto.remark,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId,
          module: 'user',
          action: 'adjust_balance',
          targetType: 'user',
          targetId: userId,
          oldValue: JSON.stringify({ balance: currentBalance }),
          newValue: JSON.stringify({ balance: newBalance, amount: dto.amount, remark: dto.remark }),
          ip: ctx.ip || null,
          userAgent: ctx.userAgent || null,
        },
      });
      return txn;
    });
  }

  /** 重置用户密码（同步到 panel_user） */
  async resetUserPassword(adminId: number, userId: number, dto: ResetPasswordDto, ctx: AuditContext = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // 同步到雨云 panel_user（失败不阻断主流程）
    if (user.panelUserName) {
      try {
        await this.rainyun.updatePanelUserPassword(
          user.panelUserName,
          dto.newPassword,
          `admin_id:${adminId}`,
        );
        await this.prisma.user.update({
          where: { id: userId },
          data: { panelUserSyncedAt: new Date() },
        });
        this.logger.log(`用户 ${userId} 密码已同步至 panel_user`);
      } catch (e: any) {
        this.logger.warn(`用户 ${userId} 密码同步 panel_user 失败: ${e.message}`);
      }
    }

    await this.writeAuditLog(adminId, 'user', 'reset_password', {
      targetType: 'user',
      targetId: userId,
      ctx,
    });
    return { success: true };
  }

  /** 重建 panel_user（同步失败时补偿） */
  async rebuildPanelUser(adminId: number, userId: number, ctx: AuditContext = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    // 雨云 API 不允许 name 含下划线，仅允许字母数字（3-16 字符）
    const panelUserName = user.panelUserName || `pu${user.id}`;
    const panelPassword = `Reset${Date.now().toString(36)}!`;

    try {
      // 尝试创建，若已存在则忽略并更新密码
      try {
        await this.rainyun.createPanelUser(panelUserName, panelPassword, `admin_id:${adminId}`);
      } catch {
        // panel_user 已存在，更新密码
        await this.rainyun.updatePanelUserPassword(
          panelUserName,
          panelPassword,
          `admin_id:${adminId}`,
        );
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          panelUserName,
          panelUserStatus: 'CREATED',
          panelUserSyncedAt: new Date(),
        },
      });
      await this.writeAuditLog(adminId, 'user', 'rebuild_panel_user', {
        targetType: 'user',
        targetId: userId,
        newValue: JSON.stringify({ panelUserName }),
        ctx,
      });
      return { success: true, panelUserName };
    } catch (e: any) {
      // 标记失败
      await this.prisma.user.update({
        where: { id: userId },
        data: { panelUserStatus: 'FAILED' },
      });
      throw new BadRequestException(`重建 panel_user 失败: ${e.message}`);
    }
  }

  // ============ 4. 商品管理（委托 ProductService） ============

  async listProducts(query: any) {
    return this.product.listProductsAdmin(query);
  }

  async createProduct(dto: CreateProductDto) {
    return this.product.createProduct(dto as any);
  }

  async updateProduct(adminId: number, id: number, dto: UpdateProductDto, ctx: AuditContext = {}) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('商品不存在');
    const updated = await this.product.updateProduct(id, dto as any);
    await this.writeAuditLog(adminId, 'product', 'update', {
      targetType: 'product',
      targetId: id,
      oldValue: JSON.stringify({ name: before.name, isOnSale: before.isOnSale, markupRate: before.markupRate }),
      newValue: JSON.stringify(dto),
      ctx,
    });
    return updated;
  }

  async deleteProduct(adminId: number, id: number, ctx: AuditContext = {}) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('商品不存在');
    const result = await this.product.deleteProduct(id);
    await this.writeAuditLog(adminId, 'product', 'delete', {
      targetType: 'product',
      targetId: id,
      oldValue: JSON.stringify({ name: before.name, isOnSale: before.isOnSale }),
      newValue: JSON.stringify({ isOnSale: false }),
      ctx,
    });
    return result;
  }

  // ===== 删除所有商品（批量操作，含审计日志） =====
  // mode: 'soft' = 全部下架 / 'hard' = 物理删除
  async deleteAllProducts(
    adminId: number,
    mode: 'soft' | 'hard' = 'soft',
    ctx: AuditContext = {},
  ) {
    const total = await this.prisma.product.count();
    const result = await this.product.deleteAllProducts(mode);
    await this.writeAuditLog(adminId, 'product', 'delete_all', {
      targetType: 'product',
      targetId: null,
      oldValue: JSON.stringify({ total, mode }),
      newValue: JSON.stringify(result),
      ctx,
    });
    return result;
  }

  async syncUpstreamPlans(adminId: number, ctx: AuditContext = {}) {
    const result = await this.product.syncUpstreamPlans();
    await this.writeAuditLog(adminId, 'product', 'sync_upstream', {
      targetType: 'product',
      targetId: null,
      newValue: JSON.stringify(result),
      ctx,
    });
    return result;
  }

  // ============ 5. 订单管理（委托 OrderService） ============

  async listOrders(query: any) {
    return this.order.listAllOrders(query);
  }

  async getOrderDetail(id: number) {
    const order = await this.order.getOrder(id);
    // 附带 UpstreamApiLog（category=rcs，按时间倒序最近 50 条）
    const logs = await this.prisma.upstreamApiLog.findMany({
      where: { category: 'rcs' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { ...order, upstreamLogs: logs };
  }

  async refundOrder(adminId: number, id: number, dto: RefundDto, ctx: AuditContext = {}) {
    const before = await this.prisma.order.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('订单不存在');
    const result = await this.order.refundOrder(id, dto.reason, adminId);
    await this.writeAuditLog(adminId, 'order', 'refund', {
      targetType: 'order',
      targetId: id,
      oldValue: JSON.stringify({ status: before.status, totalAmount: before.totalAmount }),
      newValue: JSON.stringify({ reason: dto.reason }),
      ctx,
    });
    return result;
  }

  async retryOpenOrder(adminId: number, id: number, ctx: AuditContext = {}) {
    const result = await this.order.retryOpen(id);
    await this.writeAuditLog(adminId, 'order', 'retry_open', {
      targetType: 'order',
      targetId: id,
      ctx,
    });
    return result;
  }

  // ============ 6. 用户产品管理（委托 UserProductService） ============

  async listUserProducts(query: any) {
    return this.userProduct.listAllProducts(query);
  }

  async getUserProductDetail(id: number) {
    return this.userProduct.getProduct(id);
  }

  async syncUserProduct(adminId: number, id: number, ctx: AuditContext = {}) {
    const result = await this.userProduct.syncProductState(id);
    await this.writeAuditLog(adminId, 'user_product', 'sync', {
      targetType: 'user_product',
      targetId: id,
      newValue: JSON.stringify({ state: (result as any)?.state }),
      ctx,
    });
    return result;
  }

  /** 代操作：start/stop/restart（直接调雨云 rcsAction） */
  async operateUserProduct(adminId: number, id: number, dto: OperateDto, ctx: AuditContext = {}) {
    const up = await this.prisma.userProduct.findUnique({ where: { id } });
    if (!up) throw new NotFoundException('产品不存在');
    if (!up.upstreamRcsId) {
      throw new BadRequestException('产品未关联上游 RCS，无法操作');
    }

    const triggeredBy = `admin_id:${adminId}`;
    const result: any = await this.rainyun.rcsAction(
      up.upstreamRcsId,
      dto.action,
      undefined,
      triggeredBy,
    );

    // 操作后立即同步一次状态
    let newState = up.state;
    try {
      const synced = await this.userProduct.syncProductState(id);
      newState = (synced as any)?.state || up.state;
    } catch (e: any) {
      this.logger.warn(`操作后同步产品 ${id} 状态失败: ${e.message}`);
    }

    await this.writeAuditLog(adminId, 'user_product', 'operate', {
      targetType: 'user_product',
      targetId: id,
      newValue: JSON.stringify({ action: dto.action, state: newState }),
      ctx,
    });

    return { success: true, action: dto.action, state: newState, upstream: result };
  }

  // ============ 7. 工单管理（委托 TicketService） ============

  async listTickets(query: any) {
    return this.ticket.listAllTickets(query);
  }

  async getTicketDetail(id: number) {
    return this.ticket.getTicket(id);
  }

  async assignTicket(adminId: number, id: number, dto: AssignTicketDto, ctx: AuditContext = {}) {
    // 校验目标管理员存在
    const target = await this.prisma.admin.findUnique({ where: { id: dto.adminId } });
    if (!target) throw new NotFoundException('目标管理员不存在');
    const result = await this.ticket.assignTicket(id, dto.adminId);
    await this.writeAuditLog(adminId, 'ticket', 'assign', {
      targetType: 'ticket',
      targetId: id,
      newValue: JSON.stringify({ assignedAdminId: dto.adminId }),
      ctx,
    });
    return result;
  }

  async replyTicket(adminId: number, id: number, dto: ReplyTicketDto, ctx: AuditContext = {}) {
    const result = await this.ticket.adminReply(id, adminId, dto.content);
    await this.writeAuditLog(adminId, 'ticket', 'reply', {
      targetType: 'ticket',
      targetId: id,
      newValue: JSON.stringify({ contentLength: dto.content.length }),
      ctx,
    });
    return result;
  }

  async closeTicket(adminId: number, id: number, ctx: AuditContext = {}) {
    // 传 adminId 给 ticket.closeTicket，便于雨云侧记录是管理员关闭（admin_id:X）
    const result = await this.ticket.closeTicket(id, undefined, adminId);
    await this.writeAuditLog(adminId, 'ticket', 'close', {
      targetType: 'ticket',
      targetId: id,
      ctx,
    });
    return result;
  }

  async escalateTicket(adminId: number, id: number, ctx: AuditContext = {}) {
    const result = await this.ticket.escalateToRainyun(id, adminId, 'admin');
    await this.writeAuditLog(adminId, 'ticket', 'escalate', {
      targetType: 'ticket',
      targetId: id,
      newValue: JSON.stringify(result),
      ctx,
    });
    return result;
  }

  // ============ 8. 财务管理 ============

  async getFinanceOverview() {
    const todayStart = dayjs().startOf('day').toDate();
    const todayEnd = dayjs().endOf('day').toDate();
    const monthStart = dayjs().startOf('month').toDate();
    const monthEnd = dayjs().endOf('month').toDate();

    const [
      todayRevenue,
      todayCost,
      todayRefund,
      monthRevenue,
      monthCost,
      monthRefund,
      totalRevenue,
      totalCost,
      totalRefund,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          status: { in: SALES_STATUS },
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { totalAmount: true, upstreamCost: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: SALES_STATUS },
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { upstreamCost: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: 'REFUNDED',
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: SALES_STATUS },
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { totalAmount: true, upstreamCost: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: SALES_STATUS },
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { upstreamCost: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: 'REFUNDED',
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { in: SALES_STATUS } },
        _sum: { totalAmount: true, upstreamCost: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { in: SALES_STATUS } },
        _sum: { upstreamCost: true },
      }),
      this.prisma.order.aggregate({
        where: { status: 'REFUNDED' },
        _sum: { totalAmount: true },
      }),
    ]);

    const toNum = (v: any) => Number(v ?? 0);

    return {
      today: {
        revenue: toNum(todayRevenue._sum.totalAmount),
        cost: toNum(todayCost._sum.upstreamCost),
        refund: toNum(todayRefund._sum.totalAmount),
        profit: toNum(todayRevenue._sum.totalAmount) - toNum(todayCost._sum.upstreamCost),
      },
      month: {
        revenue: toNum(monthRevenue._sum.totalAmount),
        cost: toNum(monthCost._sum.upstreamCost),
        refund: toNum(monthRefund._sum.totalAmount),
        profit: toNum(monthRevenue._sum.totalAmount) - toNum(monthCost._sum.upstreamCost),
      },
      total: {
        revenue: toNum(totalRevenue._sum.totalAmount),
        cost: toNum(totalCost._sum.upstreamCost),
        refund: toNum(totalRefund._sum.totalAmount),
        profit:
          toNum(totalRevenue._sum.totalAmount) - toNum(totalCost._sum.upstreamCost),
      },
    };
  }

  /** 余额流水列表（全字段筛选） */
  async listTransactions(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.userId) where.userId = Number(query.userId);
    if (query.type) where.type = query.type;
    if (query.adminId) where.adminId = Number(query.adminId);
    if (query.orderId) where.orderId = Number(query.orderId);
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lt = new Date(query.endDate);
    }

    const [list, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, phone: true, nickname: true } },
          admin: { select: { id: true, username: true, nickname: true } },
        },
      }),
      this.prisma.balanceTransaction.count({ where }),
    ]);
    // Decimal → number 序列化
    const formatted = list.map((t: any) => ({
      ...t,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
    }));
    return { list: formatted, total, page, pageSize };
  }

  /** 导出 CSV（简化：返回 JSON，前端转 CSV） */
  async exportTransactions(query: any) {
    // 不分页，最多导出 10000 条
    const where: any = {};
    if (query.userId) where.userId = Number(query.userId);
    if (query.type) where.type = query.type;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lt = new Date(query.endDate);
    }
    const list = await this.prisma.balanceTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: {
        user: { select: { id: true, phone: true, nickname: true } },
      },
    });
    return list.map((t: any) => ({
      id: t.id,
      userId: t.userId,
      userPhone: t.user?.phone,
      userNickname: t.user?.nickname,
      type: t.type,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
      orderId: t.orderId,
      adminId: t.adminId,
      remark: t.remark,
      createdAt: t.createdAt,
    }));
  }

  // ============ 9. 上游管理 ============

  async getUpstreamInfo() {
    const account = await this.rainyun.getAccount();
    // 统一字段名（兼容 MOCK 与 LIVE 模式返回的两种字段）
    const info: any = {
      apiKey: account?.api_key || account?.apiKey || (account?.APIKey ? String(account.APIKey).slice(0, 4) + '****' + String(account.APIKey).slice(-4) : '-'),
      balance: account?.balance ?? account?.Money ?? 0,
      username: account?.username ?? account?.Name ?? '-',
      status: account?.valid === false || account?.Valid === false ? 'FROZEN' : 'ACTIVE',
      lastSyncAt: new Date().toISOString(),
    };
    return {
      account: info,
      mode: this.rainyun.isMockMode() ? 'MOCK' : 'LIVE',
    };
  }

  // ===== 雨云 API Key 配置：获取（apiKey 脱敏 + 数据库 + 运行时合并） =====
  async getRainyunApiKeyConfig() {
    const dbConfig = await this.prisma.rainyunConfig.findUnique({ where: { id: 1 } });
    const runtime = this.rainyun.getRuntimeConfig();
    return {
      // 数据库配置（脱敏展示是否已设置）
      hasApiKey: !!(dbConfig?.apiKeyEnc) || runtime.hasApiKey,
      apiKeyMasked: runtime.apiKey, // 当前运行时使用的 apiKey（前4+****+后4）
      apiBase: dbConfig?.apiBase || runtime.apiBase,
      mockMode: dbConfig?.mockMode ?? runtime.mockMode,
      lastTestAt: dbConfig?.lastTestAt || null,
      lastTestResult: dbConfig?.lastTestResult || null,
      updatedAt: dbConfig?.updatedAt || null,
      // 当前运行模式（用于 UI 提示）
      currentMode: this.rainyun.isMockMode() ? 'MOCK' : 'LIVE',
      runtime,
    };
  }

  // ===== 雨云 API Key 配置：更新（AES 加密存储 + 运行时热更新） =====
  // 留空字段表示不修改（保留原值）
  async updateRainyunApiKeyConfig(
    adminId: number,
    dto: UpdateRainyunApiKeyDto,
    ctx: AuditContext = {},
  ) {
    const existing = await this.prisma.rainyunConfig.findUnique({ where: { id: 1 } });
    const data: any = { updatedBy: adminId };

    // apiKey：留空表示不修改；传值则用 AES 加密后存储
    if (dto.apiKey !== undefined && dto.apiKey !== '') {
      data.apiKeyEnc = CryptoUtil.encrypt(dto.apiKey);
    }
    // apiBase：留空表示不修改
    if (dto.apiBase !== undefined && dto.apiBase !== '') {
      data.apiBase = dto.apiBase;
    }
    // mockMode：显式传值才更新
    if (dto.mockMode !== undefined) {
      data.mockMode = dto.mockMode;
    }

    if (existing) {
      await this.prisma.rainyunConfig.update({ where: { id: 1 }, data });
    } else {
      await this.prisma.rainyunConfig.create({
        data: { id: 1, ...data },
      });
    }

    // 从数据库重新加载到内存（运行时热更新）
    // 先读最新数据库记录，再调用 RainyunService 的 updateApiKey
    const latest = await this.prisma.rainyunConfig.findUnique({ where: { id: 1 } });
    let decryptedKey = '';
    if (latest?.apiKeyEnc) {
      try {
        decryptedKey = CryptoUtil.decrypt(latest.apiKeyEnc);
      } catch {
        decryptedKey = '';
      }
    }
    await this.rainyun.updateApiKey(decryptedKey, {
      apiBase: latest?.apiBase,
      mockMode: latest?.mockMode,
    });

    // 写审计日志（apiKey 不记录明文，只记录掩码）
    const maskedKey = decryptedKey
      ? decryptedKey.slice(0, 4) + '****' + decryptedKey.slice(-4)
      : '(unchanged)';
    await this.writeAuditLog(adminId, 'upstream', 'update_api_key', {
      targetType: 'rainyun_config',
      targetId: 1,
      oldValue: JSON.stringify({
        apiBase: existing?.apiBase,
        mockMode: existing?.mockMode,
      }),
      newValue: JSON.stringify({
        apiKey: maskedKey,
        apiBase: latest?.apiBase,
        mockMode: latest?.mockMode,
      }),
      ctx,
    });

    return {
      success: true,
      apiKeyMasked: maskedKey,
      apiBase: latest?.apiBase,
      mockMode: latest?.mockMode,
      currentMode: this.rainyun.isMockMode() ? 'MOCK' : 'LIVE',
    };
  }

  // ===== 雨云 API Key 测试连接：用当前运行时配置调用 /user/ 验证 =====
  async testRainyunApiKey() {
    const startedAt = Date.now();
    let success = false;
    let message = '';
    let accountInfo: any = null;

    try {
      if (this.rainyun.isMockMode()) {
        success = true;
        message = '当前为 MOCK 模式，无需测试真实连接';
        accountInfo = { mode: 'MOCK' };
      } else {
        // 调用雨云 /user/ 接口验证 API Key
        const account = await this.rainyun.getAccount();
        if (account) {
          success = true;
          message = '连接成功';
          accountInfo = {
            username: account?.username ?? account?.Name ?? '-',
            balance: account?.balance ?? account?.Money ?? 0,
            status: account?.valid === false || account?.Valid === false ? 'FROZEN' : 'ACTIVE',
          };
        } else {
          message = '未获取到账号信息';
        }
      }
    } catch (e: any) {
      message = e.message || '连接失败';
    }

    const durationMs = Date.now() - startedAt;

    // 更新数据库中的测试结果
    try {
      const existing = await this.prisma.rainyunConfig.findUnique({ where: { id: 1 } });
      const testData = {
        lastTestAt: new Date(),
        lastTestResult: JSON.stringify({ success, message, durationMs, accountInfo }),
      };
      if (existing) {
        await this.prisma.rainyunConfig.update({ where: { id: 1 }, data: testData });
      } else {
        await this.prisma.rainyunConfig.create({ data: { id: 1, ...testData } });
      }
    } catch {}

    return { success, message, durationMs, accountInfo };
  }

  async getPanelConfig() {
    return this.rainyun.getPanelConfig();
  }

  async updatePanelConfig(adminId: number, dto: UpdatePanelConfigDto, ctx: AuditContext = {}) {
    // 移除 undefined 字段
    const payload: any = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) payload[k] = v;
    }
    const before = await this.rainyun.getPanelConfig().catch(() => ({}));
    const after = await this.rainyun.updatePanelConfig(payload, `admin_id:${adminId}`);
    await this.writeAuditLog(adminId, 'upstream', 'update_panel_config', {
      targetType: 'upstream',
      targetId: null,
      oldValue: JSON.stringify(before),
      newValue: JSON.stringify(payload),
      ctx,
    });
    return after;
  }

  /** 上游 API 调用日志列表 */
  async listUpstreamLogs(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.category) where.category = query.category;
    if (query.method) where.method = query.method;
    if (query.statusCode) where.statusCode = Number(query.statusCode);
    if (query.triggeredBy) where.triggeredBy = { contains: query.triggeredBy };
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lt = new Date(query.endDate);
    }

    const [list, total] = await Promise.all([
      this.prisma.upstreamApiLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.upstreamApiLog.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async listPanelUsers() {
    return this.rainyun.listPanelUsers();
  }

  // ============ 10. SMTP 邮件（委托 MailerService） ============

  async getSmtpConfig() {
    return this.mailer.getSmtpConfig();
  }

  async updateSmtpConfig(adminId: number, dto: any, ctx: AuditContext = {}) {
    const before = await this.mailer.getSmtpConfig();
    const result = await this.mailer.updateSmtpConfig(dto, adminId);
    await this.writeAuditLog(adminId, 'smtp', 'update_config', {
      targetType: 'smtp',
      targetId: null,
      oldValue: JSON.stringify({ host: before.host, port: before.port, fromAddress: before.fromAddress }),
      newValue: JSON.stringify({ host: dto.host, port: dto.port, fromAddress: dto.fromAddress }),
      ctx,
    });
    return result;
  }

  async testSmtp(adminId: number, dto: any, ctx: AuditContext = {}) {
    const result = await this.mailer.testSend(dto, adminId);
    await this.writeAuditLog(adminId, 'smtp', 'test_send', {
      targetType: 'smtp',
      targetId: null,
      newValue: JSON.stringify({ to: dto.to, result }),
      ctx,
    });
    return result;
  }

  async listEmailTemplates() {
    return this.mailer.listTemplates();
  }

  async createEmailTemplate(adminId: number, dto: any, ctx: AuditContext = {}) {
    const result = await this.mailer.createTemplate(dto);
    await this.writeAuditLog(adminId, 'smtp', 'create_template', {
      targetType: 'email_template',
      targetId: result.id,
      newValue: JSON.stringify({ code: dto.code, name: dto.name }),
      ctx,
    });
    return result;
  }

  async updateEmailTemplate(adminId: number, id: number, dto: any, ctx: AuditContext = {}) {
    const result = await this.mailer.updateTemplate(id, dto);
    await this.writeAuditLog(adminId, 'smtp', 'update_template', {
      targetType: 'email_template',
      targetId: id,
      newValue: JSON.stringify(dto),
      ctx,
    });
    return result;
  }

  async deleteEmailTemplate(adminId: number, id: number, ctx: AuditContext = {}) {
    const before = await this.mailer.getTemplate(id);
    const result = await this.mailer.deleteTemplate(id);
    await this.writeAuditLog(adminId, 'smtp', 'delete_template', {
      targetType: 'email_template',
      targetId: id,
      oldValue: JSON.stringify({ code: before?.code, name: before?.name }),
      ctx,
    });
    return result;
  }

  async listEmailLogs(query: any) {
    return this.mailer.listEmailLogs(query);
  }

  // ============ 10.5 短信服务（委托 SmsService） ============

  async getSmsConfig() {
    return this.sms.getSmsConfig();
  }

  async updateSmsConfig(adminId: number, dto: any, ctx: AuditContext = {}) {
    const before = await this.sms.getSmsConfig();
    const result = await this.sms.updateSmsConfig(dto, adminId);
    await this.writeAuditLog(adminId, 'sms', 'update_config', {
      targetType: 'sms',
      targetId: null,
      oldValue: JSON.stringify({
        enabled: before.enabled,
        accessKeyId: before.accessKeyId ? before.accessKeyId.slice(0, 4) + '****' : '',
        signName: before.signName,
        templateCode: before.templateCode,
      }),
      newValue: JSON.stringify({
        enabled: dto.enabled,
        accessKeyId: dto.accessKeyId ? dto.accessKeyId.slice(0, 4) + '****' : '',
        signName: dto.signName,
        templateCode: dto.templateCode,
      }),
      ctx,
    });
    return result;
  }

  async testSms(adminId: number, dto: any, ctx: AuditContext = {}) {
    const result = await this.sms.testSend(dto.phone, adminId);
    await this.writeAuditLog(adminId, 'sms', 'test_send', {
      targetType: 'sms',
      targetId: null,
      newValue: JSON.stringify({ phone: dto.phone, result }),
      ctx,
    });
    return result;
  }

  async listSmsLogs(query: any) {
    return this.sms.listLogs(query);
  }

  // ============ 11. 优惠券管理 ============

  async listCoupons(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { code: { contains: query.keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    const formatted = list.map((c: any) => ({
      ...c,
      value: Number(c.value),
      minAmount: Number(c.minAmount),
    }));
    return { list: formatted, total, page, pageSize };
  }

  async createCoupon(adminId: number, dto: CreateCouponDto, ctx: AuditContext = {}) {
    // 生成 code（若未传）
    const code = dto.code || this.genCouponCode();
    // 唯一性校验
    const exists = await this.prisma.coupon.findUnique({ where: { code } });
    if (exists) throw new BadRequestException('优惠码已存在');

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        name: dto.name,
        type: dto.type,
        value: dto.value,
        minAmount: dto.minAmount ?? 0,
        applicableCategory: dto.applicableCategory || null,
        validFrom: new Date(dto.validFrom),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        totalQty: dto.totalQty ?? -1,
        perUserLimit: dto.perUserLimit ?? 1,
        status: 'ACTIVE',
      },
    });
    await this.writeAuditLog(adminId, 'coupon', 'create', {
      targetType: 'coupon',
      targetId: coupon.id,
      newValue: JSON.stringify({ code, name: dto.name, type: dto.type }),
      ctx,
    });
    return coupon;
  }

  async updateCoupon(adminId: number, id: number, dto: UpdateCouponDto, ctx: AuditContext = {}) {
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('优惠券不存在');
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.minAmount !== undefined) data.minAmount = dto.minAmount;
    if (dto.validTo !== undefined) data.validTo = dto.validTo ? new Date(dto.validTo) : null;
    if (dto.totalQty !== undefined) data.totalQty = dto.totalQty;
    if (dto.perUserLimit !== undefined) data.perUserLimit = dto.perUserLimit;
    if (dto.applicableCategory !== undefined) data.applicableCategory = dto.applicableCategory;
    if (dto.status !== undefined) data.status = dto.status;
    const updated = await this.prisma.coupon.update({ where: { id }, data });
    await this.writeAuditLog(adminId, 'coupon', 'update', {
      targetType: 'coupon',
      targetId: id,
      oldValue: JSON.stringify({
        name: before.name,
        status: before.status,
        value: before.value,
      }),
      newValue: JSON.stringify(dto),
      ctx,
    });
    return updated;
  }

  async deleteCoupon(adminId: number, id: number, ctx: AuditContext = {}) {
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('优惠券不存在');
    await this.prisma.coupon.delete({ where: { id } });
    await this.writeAuditLog(adminId, 'coupon', 'delete', {
      targetType: 'coupon',
      targetId: id,
      oldValue: JSON.stringify({ code: before.code, name: before.name }),
      ctx,
    });
    return { success: true };
  }

  /** 生成 8 位大写优惠码 */
  private genCouponCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // ============ 12. 公告管理 ============

  async listAnnouncements(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.position) where.position = query.position;
    if (query.status) where.status = query.status;
    if (query.pinned !== undefined && query.pinned !== '') {
      where.pinned = query.pinned === 'true' || query.pinned === true;
    }
    const [list, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async createAnnouncement(adminId: number, dto: CreateAnnouncementDto, ctx: AuditContext = {}) {
    // XSS 清洗公告标题和内容
    const safeTitle = sanitizeText(dto.title, 200);
    const safeContent = sanitizeText(dto.content, 10000);
    if (!safeTitle) throw new BadRequestException('公告标题不能为空');
    if (!safeContent) throw new BadRequestException('公告内容不能为空');
    const ann = await this.prisma.announcement.create({
      data: {
        title: safeTitle,
        content: safeContent,
        position: dto.position || 'portal',
        pinned: dto.pinned ?? false,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        status: 'ACTIVE',
      },
    });
    await this.writeAuditLog(adminId, 'announcement', 'create', {
      targetType: 'announcement',
      targetId: ann.id,
      newValue: JSON.stringify({ title: safeTitle, position: dto.position }),
      ctx,
    });
    return ann;
  }

  async updateAnnouncement(adminId: number, id: number, dto: UpdateAnnouncementDto, ctx: AuditContext = {}) {
    const before = await this.prisma.announcement.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('公告不存在');
    const data: any = {};
    if (dto.title !== undefined) data.title = sanitizeText(dto.title, 200);
    if (dto.content !== undefined) data.content = sanitizeText(dto.content, 10000);
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.pinned !== undefined) data.pinned = dto.pinned;
    if (dto.validFrom !== undefined) data.validFrom = new Date(dto.validFrom);
    if (dto.validTo !== undefined) data.validTo = dto.validTo ? new Date(dto.validTo) : null;
    if (dto.status !== undefined) data.status = dto.status;
    const updated = await this.prisma.announcement.update({ where: { id }, data });
    await this.writeAuditLog(adminId, 'announcement', 'update', {
      targetType: 'announcement',
      targetId: id,
      oldValue: JSON.stringify({ title: before.title, status: before.status }),
      newValue: JSON.stringify(dto),
      ctx,
    });
    return updated;
  }

  async deleteAnnouncement(adminId: number, id: number, ctx: AuditContext = {}) {
    const before = await this.prisma.announcement.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('公告不存在');
    await this.prisma.announcement.delete({ where: { id } });
    await this.writeAuditLog(adminId, 'announcement', 'delete', {
      targetType: 'announcement',
      targetId: id,
      oldValue: JSON.stringify({ title: before.title }),
      ctx,
    });
    return { success: true };
  }

  // ============ 13. 系统配置 ============

  async listConfigs() {
    const list = await this.prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    });
    return list;
  }

  async updateConfigs(adminId: number, dto: UpdateConfigDto, ctx: AuditContext = {}) {
    const changes: any[] = [];
    for (const item of dto.configs) {
      const before = await this.prisma.systemConfig.findUnique({ where: { key: item.key } });
      if (before) {
        if (before.value !== item.value) {
          await this.prisma.systemConfig.update({
            where: { key: item.key },
            data: { value: item.value },
          });
          changes.push({ key: item.key, oldValue: before.value, newValue: item.value });
        }
      } else {
        await this.prisma.systemConfig.create({
          data: { key: item.key, value: item.value, type: 'string' },
        });
        changes.push({ key: item.key, oldValue: null, newValue: item.value });
      }
    }
    if (changes.length > 0) {
      await this.writeAuditLog(adminId, 'system', 'update_configs', {
        targetType: 'system_config',
        targetId: null,
        newValue: JSON.stringify(changes),
        ctx,
      });
    }
    return { updated: changes.length, changes };
  }

  // ============ 14. 管理员管理（仅 SUPER_ADMIN） ============

  async listAdmins(currentAdminId: number) {
    const list = await this.prisma.admin.findMany({
      orderBy: [{ id: 'asc' }],
      select: {
        id: true,
        username: true,
        nickname: true,
        role: true,
        permissions: true,
        status: true,
        email: true,
        qq: true,
        avatarUrl: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
      },
    });
    // 不返回当前管理员自己的 lastLoginIp（敏感信息脱敏可选）
    return list.map((a: any) => ({
      ...a,
      permissions: a.permissions ? JSON.parse(a.permissions) : [],
    }));
  }

  async createAdmin(currentAdminId: number, dto: CreateAdminDto, ctx: AuditContext = {}) {
    const exist = await this.prisma.admin.findUnique({ where: { username: dto.username } });
    if (exist) throw new BadRequestException('管理员用户名已存在');

    // SMTP 开启时管理员必须绑定邮箱；邮箱唯一性校验
    const smtpEnabled = await this.mailer.isSmtpEnabled();
    const email = dto.email?.trim() || null;
    if (smtpEnabled && !email) {
      throw new BadRequestException('系统已开启邮件服务，管理员必须绑定邮箱');
    }
    if (email) {
      const emailExists = await this.prisma.admin.findUnique({ where: { email } });
      if (emailExists) throw new BadRequestException('邮箱已被其他管理员使用');
    }

    // QQ 号校验
    let avatarUrl: string | null = null;
    if (dto.qq) {
      const qq = dto.qq.trim();
      if (qq && !/^\d{4,12}$/.test(qq)) {
        throw new BadRequestException('QQ 号格式不正确（4-12 位数字）');
      }
      if (qq) avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=140`;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const admin = await this.prisma.admin.create({
      data: {
        username: dto.username,
        passwordHash,
        nickname: dto.nickname || null,
        role: dto.role || 'OPERATOR',
        email,
        qq: dto.qq || null,
        avatarUrl,
        status: 'ACTIVE',
      },
    });
    await this.writeAuditLog(currentAdminId, 'admin', 'create', {
      targetType: 'admin',
      targetId: admin.id,
      newValue: JSON.stringify({
        username: admin.username,
        role: admin.role,
        email: admin.email,
        qq: admin.qq,
      }),
      ctx,
    });
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    };
  }

  async updateAdmin(
    currentAdminId: number,
    id: number,
    dto: UpdateAdminDto,
    ctx: AuditContext = {},
    currentUserRole?: string, // 当前操作者的角色，用于权限判断
  ) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('管理员不存在');

    const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
    const isSelf = currentAdminId === id;

    // 权限规则：
    // 1. 修改 role/status 必须是 SUPER_ADMIN
    // 2. 修改 nickname/email/qq/avatarUrl：自己改自己 OR SUPER_ADMIN
    // 3. 重置密码：仅 SUPER_ADMIN（自己改密码走 changePassword 接口）
    if (!isSuperAdmin) {
      if (dto.role !== undefined || dto.status !== undefined) {
        throw new BadRequestException('仅超级管理员可修改管理员角色或状态');
      }
      if (dto.password !== undefined) {
        throw new BadRequestException('仅超级管理员可重置其他管理员密码');
      }
      if (!isSelf) {
        throw new BadRequestException('仅可修改自己的个人资料');
      }
    }

    // 不允许禁用最后一个 SUPER_ADMIN
    if (dto.status === 'DISABLED' && admin.role === 'SUPER_ADMIN') {
      const superCount = await this.prisma.admin.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      if (superCount <= 1) {
        throw new BadRequestException('不能禁用最后一个 SUPER_ADMIN');
      }
    }
    if (dto.role && dto.role !== 'SUPER_ADMIN' && admin.role === 'SUPER_ADMIN') {
      const superCount = await this.prisma.admin.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      if (superCount <= 1) {
        throw new BadRequestException('不能降级最后一个 SUPER_ADMIN');
      }
    }

    const data: any = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname?.trim() || null;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.email !== undefined) {
      const newEmail = dto.email?.trim() || null;
      // 邮箱唯一性校验
      if (newEmail) {
        const conflict = await this.prisma.admin.findUnique({ where: { email: newEmail } });
        if (conflict && conflict.id !== id) {
          throw new BadRequestException('邮箱已被其他管理员使用');
        }
      }
      // SMTP 开启时不允许清空邮箱
      if (!newEmail) {
        const smtpEnabled = await this.mailer.isSmtpEnabled();
        if (smtpEnabled) {
          throw new BadRequestException('系统已开启邮件服务，邮箱不能为空');
        }
      }
      data.email = newEmail;
    }
    if (dto.qq !== undefined) {
      const qq = dto.qq?.trim() || '';
      if (qq && !/^\d{4,12}$/.test(qq)) {
        throw new BadRequestException('QQ 号格式不正确（4-12 位数字）');
      }
      data.qq = qq || null;
      // 改 QQ 时自动同步 QQ 头像（除非 dto.avatarUrl 显式传入了）
      if (qq && dto.avatarUrl === undefined) {
        data.avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=140`;
      }
    }
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl?.trim() || null;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    if (Object.keys(data).length === 0) {
      return {
        id: admin.id,
        username: admin.username,
        nickname: admin.nickname,
        role: admin.role,
        status: admin.status,
        email: admin.email,
        qq: admin.qq,
        avatarUrl: admin.avatarUrl,
      };
    }

    const updated = await this.prisma.admin.update({ where: { id }, data });
    await this.writeAuditLog(currentAdminId, 'admin', 'update', {
      targetType: 'admin',
      targetId: id,
      oldValue: JSON.stringify({
        role: admin.role,
        status: admin.status,
        email: admin.email,
        qq: admin.qq,
        avatarUrl: admin.avatarUrl ? '[set]' : null,
      }),
      newValue: JSON.stringify({
        role: dto.role,
        status: dto.status,
        email: updated.email,
        qq: updated.qq,
        avatarUrl: updated.avatarUrl ? '[set]' : null,
        passwordChanged: !!dto.password,
      }),
      ctx,
    });
    return {
      id: updated.id,
      username: updated.username,
      nickname: updated.nickname,
      role: updated.role,
      status: updated.status,
      email: updated.email,
      qq: updated.qq,
      avatarUrl: updated.avatarUrl,
    };
  }

  async deleteAdmin(currentAdminId: number, id: number, ctx: AuditContext = {}) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('管理员不存在');
    if (admin.id === currentAdminId) {
      throw new BadRequestException('不能删除当前登录的管理员');
    }
    if (admin.role === 'SUPER_ADMIN') {
      const superCount = await this.prisma.admin.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      if (superCount <= 1) {
        throw new BadRequestException('不能删除最后一个 SUPER_ADMIN');
      }
    }
    await this.prisma.admin.delete({ where: { id } });
    await this.writeAuditLog(currentAdminId, 'admin', 'delete', {
      targetType: 'admin',
      targetId: id,
      oldValue: JSON.stringify({ username: admin.username, role: admin.role }),
      ctx,
    });
    return { success: true };
  }

  // ============ 15. 审计日志 ============

  async listAuditLogs(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.adminId) where.adminId = Number(query.adminId);
    if (query.module) where.module = query.module;
    if (query.action) where.action = query.action;
    if (query.targetType) where.targetType = query.targetType;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lt = new Date(query.endDate);
    }
    const [list, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          admin: { select: { id: true, username: true, nickname: true } },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ============ 系统管理（v1.1.0 新增） ============

  /**
   * 收集环境信息：Node/npm/PM2/MySQL/Redis/Nginx/Git 版本 + PM2 进程列表 + 磁盘/内存/CPU + 依赖列表
   * 用于管理员后台「系统环境」页面展示，便于排查问题
   */
  async getEnvInfo() {
    const { exec } = require('child_process');
    const os = require('os');
    const fs = require('fs');
    const path = require('path');

    const execCmd = (cmd: string): Promise<{ ok: boolean; stdout: string; stderr: string }> =>
      new Promise((resolve) => {
        exec(cmd, { timeout: 5000 }, (err, stdout, stderr) => {
          resolve({
            ok: !err,
            stdout: (stdout || '').toString().trim(),
            stderr: (stderr || '').toString().trim(),
          });
        });
      });

    // 并发收集版本信息
    const [nodeV, npmV, pm2V, mysqlV, redisV, nginxV, gitV] = await Promise.all([
      execCmd('node -v'),
      execCmd('npm -v'),
      execCmd('pm2 -v 2>/dev/null || echo NOT_FOUND'),
      execCmd('mysql --version 2>/dev/null || echo NOT_FOUND'),
      execCmd('redis-cli --version 2>/dev/null || echo NOT_FOUND'),
      execCmd('nginx -v 2>&1 | head -1 || echo NOT_FOUND'),
      execCmd('git --version'),
    ]);

    // PM2 进程列表
    let pm2Processes: any[] = [];
    try {
      const pm2List = await execCmd('pm2 jlist 2>/dev/null');
      if (pm2List.ok && pm2List.stdout) {
        pm2Processes = JSON.parse(pm2List.stdout).map((p: any) => ({
          name: p.name,
          pid: p.pid,
          status: p.pm2_env?.status,
          uptime: p.pm2_env?.pm_uptime,
          restarts: p.pm2_env?.restart_time,
          memory: p.monit?.memory,
          cpu: p.monit?.cpu,
          version: p.pm2_env?.version,
        }));
      }
    } catch (e: any) {
      this.logger.warn(`获取 PM2 进程列表失败: ${e.message}`);
    }

    // 磁盘使用率
    let diskUsage: any = null;
    try {
      const dfRes = await execCmd("df -h / | tail -1 | awk '{print $2\",\"$3\",\"$4\",\"$5}'");
      if (dfRes.ok && dfRes.stdout) {
        const [size, used, avail, usePercent] = dfRes.stdout.split(',');
        diskUsage = { size, used, avail, usePercent };
      }
    } catch (_) {}

    // 内存
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memory = {
      total: Math.round(totalMem / 1024 / 1024) + ' MB',
      used: Math.round(usedMem / 1024 / 1024) + ' MB',
      free: Math.round(freeMem / 1024 / 1024) + ' MB',
      usePercent: ((usedMem / totalMem) * 100).toFixed(1) + '%',
    };

    // CPU
    const cpus = os.cpus();
    const cpu = {
      cores: cpus.length,
      model: cpus[0]?.model || 'unknown',
      speed: cpus[0]?.speed ? `${cpus[0].speed} MHz` : 'unknown',
      loadavg: os.loadavg().map((n) => n.toFixed(2)),
    };

    // 应用目录与 git 信息
    const appDir = process.cwd().replace('/server', '');
    let gitInfo: any = null;
    try {
      const [branch, commit, status] = await Promise.all([
        execCmd(`git -C "${appDir}" rev-parse --abbrev-ref HEAD 2>/dev/null`),
        execCmd(`git -C "${appDir}" rev-parse --short HEAD 2>/dev/null`),
        execCmd(`git -C "${appDir}" status --porcelain 2>/dev/null | wc -l`),
      ]);
      gitInfo = {
        branch: branch.stdout || 'unknown',
        commit: commit.stdout || 'unknown',
        dirtyFiles: parseInt(status.stdout || '0', 10),
      };
    } catch (_) {}

    // 后端依赖列表
    let dependencies: Record<string, string> = {};
    try {
      const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        dependencies = pkg.dependencies || {};
      }
    } catch (_) {}

    // Node.js 启动时间（uptime）
    const uptime = process.uptime();

    return {
      versions: {
        node: nodeV.stdout.replace(/^v/, ''),
        npm: npmV.stdout,
        pm2: pm2V.stdout.includes('NOT_FOUND') ? null : pm2V.stdout,
        mysql: mysqlV.stdout.includes('NOT_FOUND') ? null : mysqlV.stdout,
        redis: redisV.stdout.includes('NOT_FOUND') ? null : redisV.stdout,
        nginx: nginxV.stdout.includes('NOT_FOUND') ? null : nginxV.stdout,
        git: gitV.stdout,
      },
      pm2Processes,
      diskUsage,
      memory,
      cpu,
      gitInfo,
      dependencies: Object.keys(dependencies).length + ' packages',
      app: {
        version: '1.1.0',
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        pid: process.pid,
        nodeEnv: process.env.NODE_ENV || 'development',
      },
      collectedAt: new Date().toISOString(),
    };
  }

  /**
   * 检查项目版本：对比当前版本与 GitHub Release 最新版本
   * 修复：处理 GitHub Release 404 情况（仓库未发布 Release 时给出友好提示）
   */
  async checkProjectVersion() {
    const https = require('https');
    const appDir = process.cwd().replace('/server', '');
    const fs = require('fs');
    const path = require('path');

    // 当前版本（从 package.json 读取，避免硬编码）
    let currentVersion = '1.1.0';
    try {
      const pkgPath = path.join(appDir, 'server', 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.version) currentVersion = pkg.version;
      }
    } catch (_) {}

    // 从 .env 读取仓库地址
    let repo = process.env.UPDATE_REPO || '';
    if (!repo) {
      try {
        const envPath = path.join(appDir, 'server', '.env');
        if (fs.existsSync(envPath)) {
          const envText = fs.readFileSync(envPath, 'utf8');
          const m = envText.match(/^UPDATE_REPO=(.+)$/m);
          if (m) repo = m[1].trim().replace(/^["']|["']$/g, '');
        }
      } catch (_) {}
    }

    // 如果没有配置 UPDATE_REPO，尝试从 git remote 读取
    if (!repo) {
      try {
        const { exec } = require('child_process');
        const remoteUrl = await new Promise<string>((resolve) => {
          exec(
            `git -C "${appDir}" remote get-url origin 2>/dev/null`,
            { timeout: 3000 },
            (err, stdout) => resolve(err ? '' : stdout.toString().trim()),
          );
        });
        // 解析 git@github.com:owner/repo.git 或 https://github.com/owner/repo.git
        const m = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
        if (m) repo = `${m[1]}/${m[2]}`;
      } catch (_) {}
    }

    if (!repo) {
      return {
        currentVersion,
        latestVersion: null,
        needUpdate: false,
        repo: null,
        checkedAt: new Date().toISOString(),
        message: '未配置 UPDATE_REPO 环境变量，且无法从 git remote 推断仓库地址',
      };
    }

    // 调用 GitHub Release API
    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    let latestVersion: string | null = null;
    let releaseUrl: string | null = null;
    let releaseNotes: string | null = null;
    let publishedAt: string | null = null;
    let errorMessage: string | null = null;

    try {
      const data: any = await new Promise((resolve, reject) => {
        const req = https.get(
          apiUrl,
          {
            headers: {
              'User-Agent': 'RainyunReseller/1.1.0',
              Accept: 'application/vnd.github+json',
            },
            timeout: 10000,
          },
          (res: any) => {
            let body = '';
            res.on('data', (chunk: any) => (body += chunk));
            res.on('end', () => {
              resolve({ statusCode: res.statusCode, body });
            });
          },
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('GitHub API 请求超时'));
        });
      });

      if (data.statusCode === 200) {
        const release = JSON.parse(data.body);
        latestVersion = release.tag_name?.replace(/^v/, '') || null;
        releaseUrl = release.html_url || null;
        releaseNotes = release.body || null;
        publishedAt = release.published_at || null;
      } else if (data.statusCode === 404) {
        // 仓库未发布任何 Release
        errorMessage = `仓库 ${repo} 未发布 GitHub Release（404），无法获取最新版本`;
      } else if (data.statusCode === 403) {
        // GitHub API 限流
        errorMessage = `GitHub API 限流（403），请稍后重试`;
      } else {
        errorMessage = `GitHub API 返回 ${data.statusCode}`;
      }
    } catch (e: any) {
      errorMessage = `GitHub API 请求失败: ${e.message}`;
    }

    // 版本对比
    let needUpdate = false;
    if (latestVersion) {
      needUpdate = this.compareVersions(latestVersion, currentVersion) > 0;
    }

    return {
      currentVersion,
      latestVersion,
      needUpdate,
      repo,
      releaseUrl,
      releaseNotes: releaseNotes?.slice(0, 500) || null,
      publishedAt,
      checkedAt: new Date().toISOString(),
      error: errorMessage,
    };
  }

  /** 版本号比较：a > b 返回 1，a < b 返回 -1，相等返回 0 */
  private compareVersions(a: string, b: string): number {
    const va = a.replace(/^v/, '').split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
    const vb = b.replace(/^v/, '').split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
    const len = Math.max(va.length, vb.length);
    for (let i = 0; i < len; i++) {
      const x = va[i] || 0;
      const y = vb[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  /**
   * 触发强制更新（异步执行，立即返回 taskId）
   * 修复：原同步等待 update.sh 完成会导致 PM2 reload 时杀死当前 HTTP 连接，API 超时
   *      新设计：立即返回 taskId，update.sh 在后台执行，前端通过 GET update-status 轮询状态
   *
   * 可选 domain 参数：用于设置部署域名（首次部署未配置域名时，可通过此参数补充设置）
   *   - 传入后会作为 DEPLOY_DOMAIN 环境变量传递给 update.sh
   *   - update.sh 会将其写入 .deploy-meta.json，并据此申请 SSL 证书、配置 HTTPS
   */
  async forceUpdate(adminId: number, dto: { domain?: string } = {}, ctx: AuditContext = {}) {
    const { spawn } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const appDir = process.cwd().replace('/server', '');
    const updateScript = path.join(appDir, 'deploy', 'update.sh');
    const stateFile = path.join(appDir, 'deploy', '.update-state');
    const lockFile = path.join(appDir, 'deploy', '.update-lock');

    // 检查 update.sh 是否存在
    if (!fs.existsSync(updateScript)) {
      throw new NotFoundException('更新脚本 deploy/update.sh 不存在');
    }

    // 检查是否有正在进行的更新
    if (fs.existsSync(lockFile)) {
      const lockContent = fs.readFileSync(lockFile, 'utf8');
      const pidMatch = lockContent.match(/pid:(\d+)/);
      if (pidMatch) {
        const pid = parseInt(pidMatch[1], 10);
        try {
          process.kill(pid, 0); // 检查进程是否存活
          throw new BadRequestException(
            `已有更新进程 (PID ${pid}) 正在运行，请等待其完成或删除 ${lockFile}`,
          );
        } catch (e: any) {
          if (e.code !== 'ESRCH' && !(e instanceof BadRequestException)) {
            // 进程存在
            throw new BadRequestException(`已有更新进程 (PID ${pid}) 正在运行`);
          }
          if (e instanceof BadRequestException) throw e;
          // ESRCH: 进程不存在，继续执行
        }
      }
    }

    // 如果传入了 domain，预先写入 .deploy-meta.json（双保险：即使 update.sh 中环境变量丢失也能读到）
    let domainForLog: string | null = null;
    if (dto.domain && dto.domain.trim()) {
      const domain = dto.domain.trim().toLowerCase();
      domainForLog = domain;
      const metaFile = path.join(appDir, 'deploy', '.deploy-meta.json');
      try {
        let meta: any = {};
        if (fs.existsSync(metaFile)) {
          meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        }
        meta.domain = domain;
        fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8');
        this.logger.log(`force-update: 已将 domain=${domain} 写入 ${metaFile}`);
      } catch (e: any) {
        this.logger.warn(`force-update: 写入 .deploy-meta.json 失败: ${e.message}`);
        // 不阻断流程，update.sh 内部还会从环境变量读取
      }
    }

    // 生成 taskId
    const taskId = `update-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 审计日志
    await this.writeAuditLog(adminId, 'system', 'force_update', {
      targetType: 'system',
      targetId: null,
      newValue: {
        taskId,
        script: updateScript,
        at: new Date().toISOString(),
        domain: domainForLog,
      },
      ctx,
    });

    // 异步启动 update.sh（detached，父进程退出后子进程继续运行）
    // 关键：使用 setsid + nohup 双重保障，让子进程完全脱离当前 Node.js 进程
    //  - setsid: 创建新会话，脱离父进程的进程组/会话
    //  - nohup: 忽略 SIGHUP（PM2 reload 时可能向整个进程组发 SIGHUP）
    //  - stdio: 'ignore' + 重定向到日志：避免 stdio 管道在父进程死亡时断裂
    // 这样即使 PM2 reload 杀死当前 NestJS 进程，update.sh 仍能继续执行
    const env: any = {
      ...process.env,
      APP_DIR: appDir,
      DEPLOY_NONINTERACTIVE: '1', // 强制非交互模式
      FORCE_UPDATE_TASK_ID: taskId,
    };
    // 传递 domain 环境变量（双保险：即使 .deploy-meta.json 写入失败，update.sh 也能读到）
    if (domainForLog) {
      env.DEPLOY_DOMAIN = domainForLog;
    }

    // 使用 setsid 创建新会话，nohup 忽略 SIGHUP
    // 日志输出到 update.sh 自己的日志文件（由脚本内部管理）
    const child = spawn('setsid', ['bash', updateScript], {
      cwd: appDir,
      stdio: 'ignore',
      env,
    });

    child.unref(); // 关键：让父进程可以独立退出

    this.logger.log(
      `force-update 已触发: taskId=${taskId}, pid=${child.pid}, script=${updateScript}, domain=${domainForLog || '(unchanged)'}`,
    );

    // 立即返回，不等 update.sh 完成
    return {
      taskId,
      status: 'STARTED',
      message: '更新已开始，请通过 GET /api/admin/system/update-status 查询进度',
      pid: child.pid,
      startedAt: new Date().toISOString(),
      domain: domainForLog,
      // 提示前端：update.sh 执行 pm2 reload 时会断开当前 HTTP 连接
      // 前端应轮询 GET /api/admin/system/update-status，而不是依赖长连接
      hint: '更新过程中后端服务会重启，请等待 10-30 秒后查询状态',
    };
  }

  /**
   * 查询更新状态：读取 deploy/.update-state 文件
   * 用于 force-update 触发后前端轮询
   */
  async getUpdateStatus() {
    const fs = require('fs');
    const path = require('path');
    const appDir = process.cwd().replace('/server', '');

    const stateFile = path.join(appDir, 'deploy', '.update-state');
    const lockFile = path.join(appDir, 'deploy', '.update-lock');
    const logDir = path.join(appDir, 'deploy', '.update-logs');

    // 读取状态文件
    let state: any = null;
    try {
      if (fs.existsSync(stateFile)) {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      }
    } catch (e: any) {
      this.logger.warn(`读取更新状态文件失败: ${e.message}`);
    }

    // 检查锁文件是否存在（判断是否正在运行）
    let isRunning = false;
    let lockPid: number | null = null;
    let lockAge: number | null = null;
    if (fs.existsSync(lockFile)) {
      try {
        const lockContent = fs.readFileSync(lockFile, 'utf8');
        const pidMatch = lockContent.match(/pid:(\d+)/);
        if (pidMatch) {
          lockPid = parseInt(pidMatch[1], 10);
          try {
            process.kill(lockPid, 0);
            isRunning = true;
          } catch (_) {
            // 进程不存在
            isRunning = false;
          }
        }
        const startedMatch = lockContent.match(/started:(.+)/);
        if (startedMatch) {
          const startedAt = new Date(startedMatch[1].trim()).getTime();
          lockAge = Math.floor((Date.now() - startedAt) / 1000);
        }
      } catch (_) {}
    }

    // 获取最新日志文件路径
    let latestLog: string | null = null;
    let logContent: string | null = null;
    try {
      if (fs.existsSync(logDir)) {
        const logs = fs.readdirSync(logDir)
          .filter((f: string) => f.startsWith('update-') && f.endsWith('.log'))
          .sort()
          .reverse();
        if (logs.length > 0) {
          latestLog = logs[0];
          const logPath = path.join(logDir, latestLog);
          // 只返回最后 50 行
          const fullLog = fs.readFileSync(logPath, 'utf8');
          const lines = fullLog.split('\n');
          logContent = lines.slice(-50).join('\n');
        }
      }
    } catch (_) {}

    // 如果状态文件不存在但锁存在，说明 update.sh 刚启动还未写状态
    if (!state && isRunning) {
      state = {
        status: 'RUNNING',
        message: '更新已启动，正在执行中',
        progress: 0,
        step: '0',
      };
    }

    // 如果状态文件不存在且锁不存在，说明从未执行过更新
    if (!state) {
      return {
        status: 'NEVER',
        message: '从未执行过更新',
        isRunning: false,
        checkedAt: new Date().toISOString(),
      };
    }

    // 检测僵尸状态：状态文件说 RUNNING 但实际进程已不在（崩溃/被杀）
    // 这种情况下更新已中断，需提示用户
    if (state.status === 'RUNNING' && !isRunning && lockPid !== null) {
      state = {
        ...state,
        status: 'STALE',
        message: `更新进程 (PID ${lockPid}) 已异常退出，状态停留在步骤 ${state.step || '?'}。请查看日志排查原因，或重新触发更新。`,
        originalStatus: 'RUNNING',
      };
    } else if (state.status === 'RUNNING' && !isRunning && lockPid === null) {
      // 没有 lock 文件但状态仍是 RUNNING — 通常是 update.sh 已完成但最终状态未更新
      // 不修改状态，仅通过 isRunning=false 提示
    }

    return {
      ...state,
      isRunning,
      lockPid,
      lockAgeSeconds: lockAge,
      latestLog,
      logTail: logContent,
      checkedAt: new Date().toISOString(),
    };
  }

  // ============ 工具方法 ============

  /** 写审计日志（fail-safe，不影响主流程） */
  private async writeAuditLog(
    adminId: number,
    module: string,
    action: string,
    data: {
      targetType?: string;
      targetId?: number | null;
      oldValue?: any;
      newValue?: any;
      ctx?: AuditContext;
    },
  ) {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          module,
          action,
          targetType: data.targetType || null,
          targetId: data.targetId ?? null,
          oldValue:
            data.oldValue !== undefined ? JSON.stringify(data.oldValue) : null,
          newValue:
            data.newValue !== undefined ? JSON.stringify(data.newValue) : null,
          ip: data.ctx?.ip || null,
          userAgent: data.ctx?.userAgent || null,
        },
      });
    } catch (e: any) {
      this.logger.error(`写审计日志失败: ${e.message}`);
    }
  }
}
