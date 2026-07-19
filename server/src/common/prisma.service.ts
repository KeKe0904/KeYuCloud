import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('Prisma');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ 数据库已连接');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
