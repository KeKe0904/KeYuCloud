import { Controller, Get, Put, Query, Param } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse, parsePaging } from '../../common/api-response';
import { PrismaService } from '../../common/prisma.service';

@Controller('api/notifications')
export class NotificationController {
  constructor(
    private notification: NotificationService,
    private prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentUser('sub') userId: number, @Query() query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = { userId };
    if (query.type) where.type = query.type;
    // 支持按已读/未读过滤（前端"未读"tab 传 isRead=false）
    if (query.isRead !== undefined && query.isRead !== '') {
      where.isRead = query.isRead === 'true' || query.isRead === true;
    }
    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return ApiResponse.paged(list, total, page, pageSize);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser('sub') userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return ApiResponse.success({ count });
  }

  @Put(':id/read')
  async markRead(@Param('id') id: number, @CurrentUser('sub') userId: number) {
    await this.prisma.notification.updateMany({
      where: { id: Number(id), userId },
      data: { isRead: true },
    });
    return ApiResponse.success(null, '已标记为已读');
  }

  @Put('read-all')
  async markAllRead(@CurrentUser('sub') userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return ApiResponse.success(null, '全部已读');
  }
}
