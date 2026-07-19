import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 服务 - 用于缓存 / 分布式锁 / BullMQ 队列 / 限流
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  private client: Redis | null = null;

  constructor(private config: ConfigService) {}

  getClient(): Redis {
    if (!this.client) {
      this.client = new Redis({
        host: this.config.get('REDIS_HOST', '127.0.0.1'),
        port: this.config.get<number>('REDIS_PORT', 6379),
        password: this.config.get('REDIS_PASSWORD') || undefined,
        db: this.config.get<number>('REDIS_DB', 0),
        retryStrategy: (times) => Math.min(times * 200, 2000),
        maxRetriesPerRequest: 3,
        lazyConnect: false,
      });

      this.client.on('connect', () => this.logger.log('✅ Redis 已连接'));
      this.client.on('error', (err) => this.logger.error(`Redis 错误: ${err.message}`));
    }
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.getClient().get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.getClient().set(key, value, 'EX', ttlSeconds);
      } else {
        await this.getClient().set(key, value);
      }
    } catch (err: any) {
      this.logger.error(`Redis SET 失败: ${err.message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.getClient().del(key);
    } catch {}
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const client = this.getClient();
      const val = await client.incr(key);
      if (val === 1 && ttlSeconds) {
        await client.expire(key, ttlSeconds);
      }
      return val;
    } catch {
      return 0;
    }
  }

  // 简单限流：key 在 ttlSeconds 内最多 maxCount 次
  async rateLimit(key: string, maxCount: number, ttlSeconds: number): Promise<boolean> {
    const count = await this.incr(key, ttlSeconds);
    return count <= maxCount;
  }

  // 分布式锁
  async lock(key: string, ttlSeconds = 10): Promise<string | null> {
    const token = Math.random().toString(36).slice(2);
    try {
      const ok = await this.getClient().set(key, token, 'EX', ttlSeconds, 'NX');
      return ok === 'OK' ? token : null;
    } catch {
      return null;
    }
  }

  async unlock(key: string, token: string): Promise<void> {
    try {
      const script = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
      await this.getClient().eval(script, 1, key, token);
    } catch {}
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
