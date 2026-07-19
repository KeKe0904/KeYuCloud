import { Controller, Get } from '@nestjs/common';
import { PublicService } from './public.service';
import { Public } from '../../common/decorators/public.decorator';
import { ApiResponse } from '../../common/api-response';

@Controller('api/public')
export class PublicController {
  constructor(private publicService: PublicService) {}

  @Public()
  @Get('site-info')
  async siteInfo() {
    const data = await this.publicService.getSiteInfo();
    return ApiResponse.success(data);
  }

  @Public()
  @Get('announcements')
  async announcements() {
    const data = await this.publicService.getAnnouncements();
    return ApiResponse.success(data);
  }

  @Public()
  @Get('configs')
  async configs() {
    const data = await this.publicService.getPublicConfigs();
    return ApiResponse.success(data);
  }

  // 首页精选套餐推荐
  // 逻辑：(a)未设置随机6 / (b)设置最多6 / (c)未满补随机
  @Public()
  @Get('products/recommended')
  async recommendedProducts() {
    const data = await this.publicService.getRecommendedProducts(6);
    return ApiResponse.success(data);
  }
}
