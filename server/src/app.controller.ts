import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private config: ConfigService) {}

  @Public()
  @Get('api/health')
  health() {
    const mock = this.config.get('RAINYUN_MOCK') === 'true' || !this.config.get('RAINYUN_API_KEY');
    return {
      status: 'ok',
      service: 'rainyun-reseller-server',
      version: '1.0.0',
      time: new Date().toISOString(),
      upstream: mock ? 'MOCK' : 'LIVE',
      siteName: this.config.get('SITE_NAME'),
    };
  }
}
