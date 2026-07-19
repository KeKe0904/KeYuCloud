// 工单服务 — 双层架构（本站工单 + 可升级到雨云）
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
import { sanitizeText } from '../../common/sanitize.util';
import { CreateTicketDto } from './dto';

// 雨云工单 status → 本地 Ticket status 映射
const RAINYUN_STATUS_MAP: Record<string, string> = {
  waiting: 'OPEN',
  handling: 'REPLIED',
  answered: 'REPLIED',
  finished: 'CLOSED',
};

@Injectable()
export class TicketService {
  private readonly logger = new Logger('Ticket');

  constructor(
    private prisma: PrismaService,
    private rainyun: RainyunService,
    private notification: NotificationService,
  ) {}

  // ===== 1. 创建工单（本站 / 官方） =====
  // source=local（默认）：仅写本地 DB
  // source=official：必须传 userProductId，先调雨云 createWorkorder，再写本地（rainyunWorkorderId 已设置）
  async createTicket(userId: number, dto: CreateTicketDto) {
    const source = dto.source === 'official' ? 'official' : 'local';

    // 校验关联产品归属
    let userProduct: any = null;
    if (dto.userProductId) {
      userProduct = await this.prisma.userProduct.findUnique({
        where: { id: dto.userProductId },
      });
      if (!userProduct || userProduct.userId !== userId) {
        throw new ForbiddenException('关联的产品不属于当前用户');
      }
    }

    // 官方工单必须关联雨云产品（雨云 /workorder/ 要求 related_product_id 必填）
    if (source === 'official') {
      if (!userProduct || !userProduct.upstreamRcsId) {
        throw new BadRequestException(
          '官方工单必须关联已购买的雨云服务器（用于雨云 API 校验），如无关联产品请选择本站工单',
        );
      }
    }

    // 生成工单号 T{timestamp}{random4}
    const ticketNo = `T${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    // XSS 清洗：标题限 100 字符，内容限 5000 字符
    const safeTitle = sanitizeText(dto.title, 100);
    const safeContent = sanitizeText(dto.content, 5000);
    if (!safeTitle) throw new BadRequestException('工单标题不能为空');
    if (!safeContent) throw new BadRequestException('工单内容不能为空');

    // type 标准化：sale → sales；feedback 雨云需特殊权限，降级为 tech
    const TYPE_MAP: Record<string, string> = {
      tech: 'tech',
      expense: 'expense',
      sales: 'sales',
      sale: 'sales',
      reward: 'reward',
      feedback: 'feedback', // 本站工单保留 feedback；官方工单下面会降级
    };
    const localType = TYPE_MAP[dto.type] || 'tech';

    // 官方工单：先调雨云 createWorkorder
    let rainyunWorkorderId: number | null = null;
    let rainyunSyncedAt: Date | null = null;
    if (source === 'official') {
      // 雨云 type 标准化：feedback 降级为 tech（分销账号无 feedback 权限）
      const RAINYUN_TYPE_MAP: Record<string, string> = {
        tech: 'tech',
        expense: 'expense',
        sales: 'sales',
        sale: 'sales',
        reward: 'reward',
        feedback: 'tech',
      };
      const rainyunType = RAINYUN_TYPE_MAP[dto.type] || 'tech';
      try {
        const wo: any = await this.rainyun.createWorkorder(
          {
            type: rainyunType,
            title: `[本站] ${safeTitle}`.slice(0, 50),
            content: safeContent,
            related_product_id: userProduct.upstreamRcsId,
            related_product_type: 'rcs',
            is_urgent: (dto.priority ?? 0) === 1 ? 1 : 0,
            is_authed: true,
          },
          `user_id:${userId}`,
        );
        // 兼容 LIVE PascalCase 与 MOCK snake_case
        rainyunWorkorderId = wo?.ID ?? wo?.id ?? null;
        rainyunSyncedAt = new Date();
        if (!rainyunWorkorderId) {
          throw new BadRequestException('雨云创建工单失败：未返回工单 ID');
        }
      } catch (e: any) {
        this.logger.warn(`用户 ${userId} 创建官方工单失败: ${e.message}`);
        throw new BadRequestException(`创建官方工单失败：${e.message}`);
      }
    }

    // 写 Ticket
    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNo,
        userId,
        userProductId: dto.userProductId ?? null,
        type: localType,
        title: safeTitle,
        content: safeContent,
        priority: dto.priority ?? 0,
        status: 'OPEN',
        source,
        rainyunIsAuthed: true,
        ...(rainyunWorkorderId
          ? { rainyunWorkorderId, rainyunSyncedAt }
          : {}),
      },
      include: { userProduct: true },
    });

    // 写 TicketMessage(fromType='user', fromId=userId)
    await this.prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        fromType: 'user',
        fromId: userId,
        content: safeContent,
      },
    });

    // 官方工单：写入系统消息提示
    if (source === 'official' && rainyunWorkorderId) {
      await this.prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          fromType: 'system',
          content: `本工单已直接提交至雨云官方（官方工单 ID: ${rainyunWorkorderId}），雨云客服将处理。本站仅做同步展示。`,
        },
      });
    }

    // 发通知给所有 admin（SUPER_ADMIN/SUPPORT）
    try {
      const admins = await this.prisma.admin.findMany({
        where: { role: { in: ['SUPER_ADMIN', 'SUPPORT'] }, status: 'ACTIVE' },
      });
      // 注：Notification 表的 userId 外键指向 User 表，无法直接为 Admin 创建通知。
      // 此处仅记录日志，admin 通过工单后台查看新工单。
      this.logger.log(
        `工单 ${ticket.id} 已创建（source=${source}），通知 ${admins.length} 位管理员（后台查看）`,
      );
    } catch (e: any) {
      this.logger.warn(`查询管理员失败: ${e.message}`);
    }

    return ticket;
  }

  // ===== 2. 用户工单列表 =====
  // 支持按 userProductId 过滤：当传入 userProductId 时，仅返回关联该产品的工单
  // （用于产品详情页的"关联工单"区块；userProductId 为空字符串或 undefined 时不加过滤）
  async listUserTickets(userId: number, query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = { userId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.userProductId != null && query.userProductId !== '') {
      const pid = Number(query.userProductId);
      if (!Number.isNaN(pid)) where.userProductId = pid;
    }

    const [list, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: pageSize,
        include: {
          userProduct: { select: { id: true, upstreamRcsName: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ===== 3. 管理后台：全部工单（支持 status/type/assignedAdminId 筛选） =====
  async listAllTickets(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.assignedAdminId) where.assignedAdminId = Number(query.assignedAdminId);
    if (query.userId) where.userId = Number(query.userId);

    const [list, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, phone: true, nickname: true } },
          userProduct: { select: { id: true, upstreamRcsName: true } },
          assignedAdmin: { select: { id: true, username: true, nickname: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ===== 4. 工单详情（含 messages，按 createdAt asc） =====
  async getTicket(id: number, userId?: number) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: [{ createdAt: 'asc' }] },
        userProduct: { select: { id: true, upstreamRcsId: true, upstreamRcsName: true } },
        user: { select: { id: true, phone: true, nickname: true } },
        assignedAdmin: { select: { id: true, username: true, nickname: true } },
      },
    });
    if (!ticket) throw new NotFoundException('工单不存在');
    if (userId !== undefined && ticket.userId !== userId) {
      throw new ForbiddenException('无权访问该工单');
    }
    return ticket;
  }

  // ===== 5. 用户回复 =====
  async replyTicket(id: number, userId: number, content: string) {
    const ticket = await this.getTicket(id, userId);
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException('工单已关闭，不可回复');
    }

    // XSS 清洗回复内容
    const safeContent = sanitizeText(content, 5000);
    if (!safeContent) throw new BadRequestException('回复内容不能为空');

    // 写 TicketMessage(fromType='user', fromId=userId)
    const msg = await this.prisma.ticketMessage.create({
      data: {
        ticketId: id,
        fromType: 'user',
        fromId: userId,
        content: safeContent,
      },
    });

    // 更新 Ticket status='OPEN'（用户回复后重新打开）
    await this.prisma.ticket.update({
      where: { id },
      data: { status: 'OPEN' },
    });

    // 若已升级到雨云，同步调 replyWorkorder
    if (ticket.rainyunWorkorderId) {
      try {
        await this.rainyun.replyWorkorder(
          ticket.rainyunWorkorderId,
          safeContent,
          `user_id:${userId}`,
        );
        await this.prisma.ticket.update({
          where: { id },
          data: { rainyunSyncedAt: new Date() },
        });
        this.logger.log(`工单 ${id} 用户回复已同步至雨云`);
      } catch (e: any) {
        this.logger.error(`工单 ${id} 用户回复同步雨云失败: ${e.message}`);
      }
    }

    return msg;
  }

  // ===== 6. 管理员回复 =====
  async adminReply(id: number, adminId: number, content: string) {
    const ticket = await this.getTicket(id);
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException('工单已关闭，不可回复');
    }

    // XSS 清洗回复内容
    const safeContent = sanitizeText(content, 5000);
    if (!safeContent) throw new BadRequestException('回复内容不能为空');

    // 写 TicketMessage(fromType='admin', fromId=adminId)
    const msg = await this.prisma.ticketMessage.create({
      data: {
        ticketId: id,
        fromType: 'admin',
        fromId: adminId,
        content: safeContent,
      },
    });

    // 更新 status='REPLIED', firstResponseAt（若为 null）
    await this.prisma.ticket.update({
      where: { id },
      data: {
        status: 'REPLIED',
        firstResponseAt: ticket.firstResponseAt ?? new Date(),
      },
    });

    // 发通知给用户
    await this.notification.send(ticket.userId, {
      type: 'ticket',
      title: '工单有新回复',
      content: `您的工单 ${ticket.ticketNo} 有新回复：${safeContent.slice(0, 100)}`,
      link: `/tickets/${id}`,
    });

    return msg;
  }

  // ===== 7. 升级到雨云（本站 → 官方，单向不可降级） =====
  // 注：雨云 POST /workorder/ 要求 related_product_id 必须为有效产品 ID（不能为 0 或缺失）
  //     实测：无 related_product_id 或 id=0 → 返回 10002 "输入参数无效"
  //     type 仅支持 tech/expense/sales/reward（feedback 需特殊权限，分销账号无权限）
  // operatorType: 'admin' | 'user'，决定触发者标识与权限校验路径
  async escalateToRainyun(id: number, operatorId: number, operatorType: 'admin' | 'user' = 'admin') {
    const ticket = await this.getTicket(id);

    // 用户调用时校验归属；管理员调用走 AdminService 路径已校验
    if (operatorType === 'user' && ticket.userId !== operatorId) {
      throw new ForbiddenException('无权操作他人的工单');
    }

    if (ticket.status === 'CLOSED') {
      throw new BadRequestException('工单已关闭，无法升级');
    }
    if (ticket.rainyunWorkorderId) {
      throw new BadRequestException('工单已升级到雨云官方，无需重复升级');
    }
    // 官方工单不可降级，也不可重复升级
    if (ticket.source === 'official') {
      throw new BadRequestException('该工单为官方工单，无需升级');
    }

    // 获取关联产品的 upstreamRcsId
    const relatedProductId = ticket.userProduct?.upstreamRcsId;
    if (!relatedProductId) {
      throw new BadRequestException(
        '工单未关联雨云产品，无法升级到雨云官方。请先在工单中关联用户购买的服务器',
      );
    }

    // type 标准化：feedback 需特殊权限，降级为 tech；sale 修正为 sales
    const RAINYUN_TYPE_MAP: Record<string, string> = {
      tech: 'tech',
      expense: 'expense',
      sales: 'sales',
      sale: 'sales', // 兼容历史数据
      reward: 'reward',
      feedback: 'tech', // feedback 需特殊权限，降级为 tech
    };
    const rainyunType = RAINYUN_TYPE_MAP[ticket.type] || 'tech';

    // 调雨云 createWorkorder
    // 注：is_urgent 是 integer (0/1)，不是 boolean
    const triggeredBy = operatorType === 'admin' ? `admin_id:${operatorId}` : `user_id:${operatorId}`;
    const wo: any = await this.rainyun.createWorkorder(
      {
        type: rainyunType,
        title: `[转接] 原工单:${ticket.ticketNo} ${ticket.title}`,
        content: ticket.content,
        related_product_id: relatedProductId,
        related_product_type: 'rcs',
        is_urgent: ticket.priority === 1 ? 1 : 0,
        is_authed: ticket.rainyunIsAuthed,
      },
      triggeredBy,
    );

    // 雨云 live API 返回 PascalCase（ID），mock 返回 snake_case（id）
    // 统一 PascalCase 优先，与雨云官方 API 保持一致
    const workorderId = wo?.ID ?? wo?.id;
    if (!workorderId) {
      throw new BizError('雨云工单创建失败：未返回工单 ID');
    }

    // 更新 Ticket：rainyunWorkorderId + source 改为 official（升级后即官方工单，不可降级）
    await this.prisma.ticket.update({
      where: { id },
      data: {
        rainyunWorkorderId: workorderId,
        rainyunSyncedAt: new Date(),
        source: 'official', // 升级后即官方工单
      },
    });

    // 写 TicketMessage(fromType='system')
    await this.prisma.ticketMessage.create({
      data: {
        ticketId: id,
        fromType: 'system',
        content: '工单已升级到雨云官方，雨云客服将介入处理。本站工单 → 官方工单为单向操作，不可降级。',
      },
    });

    this.logger.log(`工单 ${id} 已升级到雨云 workorderId=${workorderId}（由 ${triggeredBy} 触发）`);
    return { workorderId };
  }

  // ===== 8. 定时同步雨云工单（每分钟） =====
  @Cron('* * * * *')
  async syncRainyunWorkorders() {
    // 查所有 rainyunWorkorderId 非空且 status != CLOSED 的工单
    const tickets = await this.prisma.ticket.findMany({
      where: {
        rainyunWorkorderId: { not: null },
        status: { not: 'CLOSED' },
      },
    });

    let newMsgTotal = 0;
    let statusChanged = 0;

    for (const t of tickets) {
      try {
        const wo: any = await this.rainyun.getWorkorder(t.rainyunWorkorderId!, 'system');
        if (!wo) continue;

        // 雨云 live API 返回 PascalCase（Discuss），mock 返回 snake_case（discuss）
        // 统一 PascalCase 优先，与雨云官方 API 保持一致
        const discuss: any[] = wo.Discuss ?? wo.discuss ?? [];
        let newMsgCount = 0;

        for (const d of discuss) {
          // 仅同步 IsAssist=true 的消息（雨云客服回复）
          // IsAssist=false 是用户在雨云端的回复，本站已有
          // 雨云 live 返回字段：ID / IsAssist / UID / UserName / Content / Time / WaitTime / IsScored
          if (!d.IsAssist) continue;

          const rainyunMsgId = d.ID;
          // upsert：已存在则跳过（避免唯一约束冲突）
          const exist = await this.prisma.ticketMessage.findUnique({
            where: {
              ticketId_rainyunMsgId: { ticketId: t.id, rainyunMsgId },
            },
          });
          if (exist) continue;

          // 保存雨云客服真实用户名（如「雨云客服 xiaohei_」），便于追溯
          const supportName = d.UserName
            ? `雨云客服 ${d.UserName}`
            : '雨云客服';
          await this.prisma.ticketMessage.create({
            data: {
              ticketId: t.id,
              fromType: 'rainyun_support',
              fromName: supportName,
              content: d.Content,
              rainyunMsgId,
            },
          });
          newMsgCount++;
        }

        // 同步 status：雨云 live 返回 PascalCase（Status），mock 返回 snake_case（status）
        // 统一 PascalCase 优先
        const remoteStatus = String(wo.Status ?? wo.status ?? '').toLowerCase();
        const newStatus = RAINYUN_STATUS_MAP[remoteStatus];
        const needUpdate = newStatus && newStatus !== t.status;
        if (needUpdate || newMsgCount > 0) {
          await this.prisma.ticket.update({
            where: { id: t.id },
            data: {
              status: needUpdate ? newStatus : t.status,
              rainyunSyncedAt: new Date(),
              resolvedAt:
                needUpdate && newStatus === 'CLOSED' && !t.resolvedAt
                  ? new Date()
                  : t.resolvedAt,
            },
          });
          if (needUpdate) statusChanged++;
        }

        newMsgTotal += newMsgCount;
      } catch (e: any) {
        this.logger.warn(`同步工单 ${t.id} 雨云消息失败: ${e.message}`);
      }
    }

    if (tickets.length > 0) {
      this.logger.log(
        `雨云工单同步: 扫描 ${tickets.length}，新增消息 ${newMsgTotal}，状态变更 ${statusChanged}`,
      );
    }
    return { scanned: tickets.length, newMessages: newMsgTotal, statusChanged };
  }

  // ===== 9. 关闭工单（用户/管理员均可） =====
  // userId：用户端关闭时传；adminId：管理员端关闭时传；两者至少一个
  async closeTicket(id: number, userId?: number, adminId?: number) {
    const ticket = await this.getTicket(id, userId);
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException('工单已关闭');
    }

    // 若已升级到雨云，调 updateWorkorderStatus(rainyunWorkorderId, 'finished')
    if (ticket.rainyunWorkorderId) {
      try {
        // 标识触发者：管理员优先，其次用户，最后 system
        const trigger =
          adminId ? `admin_id:${adminId}` :
          userId ? `user_id:${userId}` :
          'system';
        await this.rainyun.updateWorkorderStatus(
          ticket.rainyunWorkorderId,
          'finished',
          trigger,
        );
      } catch (e: any) {
        this.logger.warn(`关闭雨云工单 ${ticket.rainyunWorkorderId} 失败: ${e.message}`);
      }
    }

    return this.prisma.ticket.update({
      where: { id },
      data: { status: 'CLOSED', resolvedAt: new Date() },
    });
  }

  // ===== 10. 评分 =====
  async rateTicket(id: number, userId: number, rating: number, comment?: string) {
    const ticket = await this.getTicket(id, userId);
    if (ticket.status !== 'CLOSED') {
      throw new BadRequestException('仅已关闭的工单可评分');
    }
    if (ticket.rating) {
      throw new BadRequestException('工单已评分，不可重复评分');
    }

    // 更新 rating, ratingComment
    const safeComment = comment ? sanitizeText(comment, 500) : null;
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { rating, ratingComment: safeComment },
    });

    // 若已升级，调 rateWorkorder
    if (ticket.rainyunWorkorderId) {
      try {
        await this.rainyun.rateWorkorder(
          ticket.rainyunWorkorderId,
          rating,
          `user_id:${userId}`,
        );
      } catch (e: any) {
        this.logger.warn(`雨云工单 ${ticket.rainyunWorkorderId} 评分失败: ${e.message}`);
      }
    }

    return updated;
  }

  // ===== 11. 分配给客服 =====
  async assignTicket(id: number, adminId: number) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('工单不存在');
    return this.prisma.ticket.update({
      where: { id },
      data: { assignedAdminId: adminId },
    });
  }

  // ===== 12. 设置优先级 =====
  async setPriority(id: number, priority: number) {
    if (![0, 1].includes(priority)) {
      throw new BadRequestException('优先级仅支持 0(普通) / 1(紧急)');
    }
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('工单不存在');
    return this.prisma.ticket.update({
      where: { id },
      data: { priority },
    });
  }
}
