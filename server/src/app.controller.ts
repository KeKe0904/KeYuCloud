import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from './common/decorators/public.decorator';
import { RainyunService } from './modules/rainyun/rainyun.service';

@Controller()
export class AppController {
  constructor(
    private config: ConfigService,
    private rainyun: RainyunService,
  ) {}

  // 版本号统一从 package.json 读取，避免多处硬编码不一致
  private getAppVersion(): string {
    try {
      // 兼容 dist/main.js 与 dist/src/main.js 两种产物结构
      const candidates = [
        path.join(__dirname, '..', 'package.json'),
        path.join(__dirname, '..', '..', 'package.json'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (pkg.version) return pkg.version;
        }
      }
    } catch (_) {}
    return '1.1.0';
  }

  @Public()
  @Get('api/health')
  health() {
    // 优先使用 RainyunService 运行时实际模式（已从数据库加载覆盖环境变量）
    // 兜底：若运行时尚未初始化完成，则按环境变量判断
    const mock = this.rainyun.isMockMode();
    // 仅暴露最小必要信息，避免泄露站点配置（siteName、域名等）
    return {
      status: 'ok',
      service: 'rainyun-reseller-server',
      version: this.getAppVersion(),
      time: new Date().toISOString(),
      upstream: mock ? 'MOCK' : 'LIVE',
    };
  }
}
