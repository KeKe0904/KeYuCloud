import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private config: ConfigService) {}

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
    const mock = this.config.get('RAINYUN_MOCK') === 'true' || !this.config.get('RAINYUN_API_KEY');
    return {
      status: 'ok',
      service: 'rainyun-reseller-server',
      version: this.getAppVersion(),
      time: new Date().toISOString(),
      upstream: mock ? 'MOCK' : 'LIVE',
      siteName: this.config.get('SITE_NAME'),
    };
  }
}
