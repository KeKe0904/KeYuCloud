// 用户产品服务 — 列表 / 详情 / 状态同步 / 续费 / 面板登录
import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { RainyunService } from '../rainyun/rainyun.service';
import { NotificationService } from '../notification/notification.service';
import { BizError, parsePaging } from '../../common/api-response';

// 雨云 RCS state（小写）→ 本地 state（大写）映射
const RCS_STATE_MAP: Record<string, string> = {
  running: 'RUNNING',
  stopped: 'STOPPED',
  expired: 'EXPIRED',
  failed: 'FAILED',
  pending: 'PENDING',
};

@Injectable()
export class UserProductService {
  private readonly logger = new Logger('UserProduct');

  constructor(
    private prisma: PrismaService,
    private rainyun: RainyunService,
    private notification: NotificationService,
  ) {}

  // ===== 1. 用户产品列表（含分页，按 expireAt desc） =====
  async listUserProducts(userId: number, query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = { userId };
    if (query.state) where.state = query.state;

    const [list, total] = await Promise.all([
      this.prisma.userProduct.findMany({
        where,
        orderBy: [{ expireAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.userProduct.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ===== 2. 管理后台：全部用户产品（支持 userId/state/zone 筛选） =====
  async listAllProducts(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.userId) where.userId = Number(query.userId);
    if (query.state) where.state = query.state;
    if (query.zone) where.zone = query.zone;

    const [list, total] = await Promise.all([
      this.prisma.userProduct.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, phone: true, nickname: true, email: true } },
        },
      }),
      this.prisma.userProduct.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ===== 3. 产品详情（userId 校验归属；admin 不传 userId） =====
  async getProduct(id: number, userId?: number) {
    const up = await this.prisma.userProduct.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!up) throw new NotFoundException('产品不存在');
    if (userId !== undefined && up.userId !== userId) {
      throw new ForbiddenException('无权访问该产品');
    }
    return up;
  }

  // ===== 4. 获取雨云官方面板登录信息 =====
  // 雨云白标面板：https://app.rainyun.com/panel/apps/rcs/list
  // 用户名：panelUserName（pu{id}）
  // 密码：用户注册时生成的独立面板密码（不存储明文，用户首次登录通过站内通知下发）
  // 用户也可在面板内修改密码
  async getPanelLoginUrl(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const panelUserName = user.panelUserName || user.username || `user${user.id}`;
    return {
      // 雨云官方面板地址（用户用 panelUserName + 面板密码登录）
      url: 'https://app.rainyun.com/panel/apps/rcs/list',
      loginUrl: 'https://app.rainyun.com/panel',
      panelUserName,
      hint: '请使用面板用户名和注册时下发的独立面板密码登录（如遗忘请通过工单重置）',
    };
  }

  // ===== 4.1 更新本地产品状态（操作后立即同步） =====
  async updateProductState(userProductId: number, state: string) {
    return this.prisma.userProduct.update({
      where: { id: userProductId },
      data: { state, stateSyncedAt: new Date() },
    });
  }

  // ===== 5. 同步单个产品状态 =====
  async syncProductState(userProductId: number) {
    const up = await this.prisma.userProduct.findUnique({ where: { id: userProductId } });
    if (!up) throw new NotFoundException('产品不存在');
    if (!up.upstreamRcsId) throw new BadRequestException('产品未关联上游 RCS');

    const triggeredBy = `user_id:${up.userId}`;
    const rcs: any = await this.rainyun.getRcs(up.upstreamRcsId, triggeredBy);

    // 上游不存在（返回空）→ 标记过期
    if (!rcs) {
      return this.prisma.userProduct.update({
        where: { id: userProductId },
        data: { state: 'EXPIRED', stateSyncedAt: new Date() },
      });
    }

    // 映射上游 state（小写）→ 本地 state（大写）
    const newState = RCS_STATE_MAP[String(rcs.state || '').toLowerCase()] || up.state;
    const newExpire = rcs.expire_at ? new Date(rcs.expire_at) : up.expireAt;
    const newIpv4 = rcs.ipv4 ?? up.ipv4;
    const newIpv6 = rcs.ipv6 ?? up.ipv6;

    return this.prisma.userProduct.update({
      where: { id: userProductId },
      data: {
        state: newState,
        expireAt: newExpire,
        ipv4: newIpv4,
        ipv6: newIpv6,
        stateSyncedAt: new Date(),
      },
    });
  }

  // ===== 6. 定时批量同步所有非过期产品状态（每 30 分钟，限制单次 100 条 + 并发 5） =====
  // 优化：原 */5 分钟串行同步所有产品，对上游 API 压力大且占用内存
  //       改为 30 分钟一次 + 限制单次扫描 100 条 + 并发 5，降低服务器负载
  @Cron('*/30 * * * *')
  async syncAllProductsState() {
    const list = await this.prisma.userProduct.findMany({
      where: { state: { notIn: ['EXPIRED', 'FAILED'] } },
      select: { id: true },
      take: 100, // 单次最多同步 100 条，避免长事务占用内存
      orderBy: { stateSyncedAt: 'asc' }, // 优先同步最久未同步的
    });

    if (!list.length) return { total: 0, updated: 0, failed: 0 };

    let updated = 0;
    let failed = 0;

    // 并发处理，限制并发数为 5
    const CONCURRENCY = 5;
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const batch = list.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((up) => this.syncProductState(up.id)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') updated++;
        else {
          failed++;
          this.logger.warn(`同步产品状态失败: ${r.reason?.message || r.reason}`);
        }
      }
    }
    this.logger.log(`批量同步完成: 总 ${list.length}，成功 ${updated}，失败 ${failed}`);
    return { total: list.length, updated, failed };
  }

  // ===== 6.1 获取续费价格（透传雨云 GET /product/rcs/{id}/renew/） =====
  // 返回 { prices: { '1': x, '3': y, '6': z, '12': w } }（单位：元，对应月数）
  async getRenewPrice(userProductId: number, userId: number) {
    const up = await this.getProduct(userProductId, userId);
    if (!up.upstreamRcsId) throw new BizError('产品未关联上游 RCS');
    const triggeredBy = `user_id:${userId}`;
    const res: any = await this.rainyun.getRcsRenewPrice(up.upstreamRcsId, triggeredBy);
    // 雨云返回 { prices: {'1':..,'3':..,'6':..,'12':..} }
    return res?.prices ?? res ?? null;
  }

  // ===== 7. 续费：调雨云 rcsAction(id, 'renew', {duration: months})，更新本地 expireAt =====
  // 注：续费的支付由 Order 模块处理（创建续费订单），这里只做上游续费动作。
  // 本方法供 admin 代续费或自动续费用。
  async renew(userProductId: number, userId: number, months: number) {
    const up = await this.getProduct(userProductId, userId);
    if (![1, 3, 6, 12].includes(months)) {
      throw new BizError('续费时长仅支持 1/3/6/12 月');
    }

    const triggeredBy = `user_id:${userId}`;
    const res: any = await this.rainyun.rcsAction(
      up.upstreamRcsId,
      'renew',
      { duration: months },
      triggeredBy,
    );

    // 计算新的到期时间
    let newExpire: Date;
    if (res?.expire_at) {
      newExpire = new Date(res.expire_at);
    } else {
      // 上游未返回 expire_at 时按本地推算（每月按 30 天）
      const base = up.expireAt.getTime() > Date.now() ? up.expireAt : new Date();
      newExpire = new Date(base.getTime() + months * 30 * 86400 * 1000);
    }

    const updated = await this.prisma.userProduct.update({
      where: { id: userProductId },
      data: { expireAt: newExpire, state: 'RUNNING' },
    });

    // 发通知给用户
    await this.notification.send(userId, {
      type: 'product',
      title: '产品续费成功',
      content: `您的产品 ${up.upstreamRcsName || '#' + up.upstreamRcsId} 已成功续费 ${months} 个月，新到期时间：${newExpire.toLocaleString('zh-CN')}`,
      link: `/user-products/${userProductId}`,
    });

    return updated;
  }

  // ===== 8. 即将到期产品列表（剩余天数 ≤ days） =====
  async listExpiring(days: number) {
    const now = new Date();
    const deadline = new Date(now.getTime() + days * 86400 * 1000);
    return this.prisma.userProduct.findMany({
      where: {
        expireAt: { gte: now, lte: deadline },
        state: { notIn: ['EXPIRED', 'FAILED'] },
      },
      orderBy: [{ expireAt: 'asc' }],
      include: {
        user: { select: { id: true, phone: true, nickname: true, email: true } },
      },
    });
  }

  // ===== 9. 同步用户产品（以子用户面板为准） =====
  // 业务逻辑：
  //   1. 拉取用户 panelUserName 在雨云侧分配的产品列表（rcs 类型）
  //   2. 拉取每个 RCS 实例详情
  //   3. 与本地 UserProduct 表对账：
  //      - 面板有但本地无 → 新增（orderId=null，productId 取默认占位商品）
  //      - 面板有本地有 → 更新状态/IP/到期时间
  //      - 面板无本地有 → 标记为 EXPIRED（管理员撤销了分配）
  //   4. 返回同步结果统计
  async syncUserProductsFromPanel(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if (!user.panelUserName) {
      throw new BadRequestException('用户未关联子用户面板账号');
    }

    const triggeredBy = `user_id:${userId}`;
    const panelProducts: any[] = await this.rainyun.listPanelUserProducts(
      user.panelUserName,
      triggeredBy,
    );

    // 仅处理 rcs 类型产品
    const rcsProducts = panelProducts.filter((p) => p.product_type === 'rcs');
    const panelRcsIds = new Set(rcsProducts.map((p) => Number(p.product_id)));

    // 拉取每个 RCS 详情（并行）
    const rcsDetails: any[] = [];
    for (const p of rcsProducts) {
      try {
        const detail = await this.rainyun.getRcs(Number(p.product_id), triggeredBy);
        if (detail) rcsDetails.push(detail);
      } catch (e: any) {
        this.logger.warn(`获取 RCS ${p.product_id} 详情失败: ${e.message}`);
      }
    }

    // 获取本地已有产品
    const localProducts = await this.prisma.userProduct.findMany({
      where: { userId },
    });
    const localByRcsId = new Map(localProducts.map((p) => [p.upstreamRcsId, p]));

    // 找一个占位商品（用于面板分配的产品，没有真实订单）
    let placeholderProduct = await this.prisma.product.findFirst({
      where: { isOnSale: true },
      orderBy: { id: 'asc' },
    });
    if (!placeholderProduct) {
      // 没有商品则创建一个占位商品
      placeholderProduct = await this.prisma.product.create({
        data: {
          name: '面板分配服务器',
          upstreamPlanId: 0,
          markupRate: 0,
          group: 'system',
          isOnSale: false,
        },
      });
    }

    let added = 0;
    let updated = 0;
    let removed = 0;

    // 处理面板有的产品
    // 注：rcs 详情来自 mapRcsInstance，字段名为 status/ipv4/host_name/region/node_name/os_id/os_name/cpu/memory/disk/bandwidth/expire_at
    for (const rcs of rcsDetails) {
      const rcsId = Number(rcs.id);
      const newState = RCS_STATE_MAP[String(rcs.status || rcs.state || '').toLowerCase()] || 'PENDING';
      const newExpire = rcs.expire_at ? new Date(rcs.expire_at) : new Date(Date.now() + 30 * 86400 * 1000);
      const existing = localByRcsId.get(rcsId);
      // memory 上游单位为 MB，本地统一 GB
      const memoryGB = rcs.memory ? Math.round(Number(rcs.memory) / 1024) : null;
      const commonUpdate = {
        state: newState,
        expireAt: newExpire,
        ipv4: rcs.ipv4 || null,
        ipv6: rcs.ipv6 || null,
        upstreamRcsName: rcs.host_name || rcs.name || existing?.upstreamRcsName || `rcs-${rcsId}`,
        panelUserName: user.panelUserName,
        zone: rcs.region || rcs.zone || null,
        zoneName: rcs.node_name || rcs.region || rcs.zone_name || null,
        osId: rcs.os_id ? Number(rcs.os_id) : null,
        osName: rcs.os_name || null,
        cpu: rcs.cpu ? Number(rcs.cpu) : null,
        memory: memoryGB,
        disk: rcs.disk ? Number(rcs.disk) : null,
        bandwidth: rcs.bandwidth ? Number(rcs.bandwidth) : null,
        stateSyncedAt: new Date(),
      };

      if (existing) {
        // 更新现有记录
        await this.prisma.userProduct.update({
          where: { id: existing.id },
          data: commonUpdate,
        });
        updated++;
        localByRcsId.delete(rcsId);
      } else {
        // 新增：面板有但本地无
        await this.prisma.userProduct.create({
          data: {
            userId,
            productId: placeholderProduct.id,
            orderId: null, // 面板分配的产品没有本地订单
            upstreamRcsId: rcsId,
            ...commonUpdate,
          },
        });
        added++;
      }
    }

    // 处理面板没有但本地有的产品（标记为 EXPIRED）
    for (const [, local] of localByRcsId.entries()) {
      if (local.state !== 'EXPIRED' && local.state !== 'FAILED') {
        await this.prisma.userProduct.update({
          where: { id: local.id },
          data: { state: 'EXPIRED', stateSyncedAt: new Date() },
        });
        removed++;
      }
    }

    this.logger.log(
      `用户 ${userId} 面板同步完成: 面板 ${rcsDetails.length} 台，新增 ${added}，更新 ${updated}，撤销 ${removed}`,
    );

    return {
      panelCount: rcsDetails.length,
      added,
      updated,
      removed,
    };
  }

  // ===== 10. 定时同步所有用户的面板设备（每 2 小时，限制单次 50 个用户 + 并发 3） =====
  // 优化：原每 10 分钟同步所有用户，频率过高且串行
  //       改为 2 小时一次 + 限制单次 50 个 + 并发 3，大幅降低上游 API 调用频率
  @Cron('0 */2 * * *')
  async syncAllUsersPanelDevices() {
    const users = await this.prisma.user.findMany({
      where: {
        panelUserName: { not: null },
        panelUserStatus: 'CREATED',
      },
      select: { id: true },
      take: 50, // 单次最多同步 50 个用户
    });

    if (!users.length) return { total: 0, success: 0, failed: 0 };

    let success = 0;
    let failed = 0;

    // 并发处理，限制并发数为 3
    const CONCURRENCY = 3;
    for (let i = 0; i < users.length; i += CONCURRENCY) {
      const batch = users.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((u) => this.syncUserProductsFromPanel(u.id)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') success++;
        else {
          failed++;
          this.logger.warn(`同步用户面板设备失败: ${r.reason?.message || r.reason}`);
        }
      }
    }
    this.logger.log(
      `定时面板同步完成: 共 ${users.length} 个用户，成功 ${success}，失败 ${failed}`,
    );
    return { total: users.length, success, failed };
  }
}
