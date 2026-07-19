import { Global, Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule implements OnModuleInit {
  constructor(private redis: RedisService) {}
  async onModuleInit() {
    // 连接由 service 懒加载处理
  }
}
