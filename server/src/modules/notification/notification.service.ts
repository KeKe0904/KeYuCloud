import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class NotificationService {
  private logger = new Logger('Notification');

  constructor(private prisma: PrismaService) {}

  async send(userId: number, data: { type: string; title: string; content: string; link?: string }) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId,
          type: data.type,
          title: data.title,
          content: data.content,
          link: data.link || null,
        },
      });
    } catch (err: any) {
      this.logger.error(`发送通知失败: ${err.message}`);
    }
  }

  async sendToUsers(userIds: number[], data: { type: string; title: string; content: string; link?: string }) {
    for (const uid of userIds) {
      await this.send(uid, data);
    }
  }
}
