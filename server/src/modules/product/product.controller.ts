// 商品 Controller — 前台公开接口
// 管理接口（CRUD / 同步）由 admin 模块统一处理，注入 ProductService 调用
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductService } from './product.service';
import { Public } from '../../common/decorators/public.decorator';
import { ApiResponse } from '../../common/api-response';

@Controller('api/products')
export class ProductController {
  constructor(private productService: ProductService) {}

  // 商品列表（前台，仅上架）
  @Public()
  @Get()
  async list(@Query() query: any) {
    const list = await this.productService.listProducts(query);
    return ApiResponse.success(list);
  }

  // OS 模板列表（可按 region 过滤，雨云 OS 按 region 分组：cn-sq1/cn-wz1/cn-hk1...）
  // 用法：GET /api/products/meta/os        → 返回所有区域 OS
  //      GET /api/products/meta/os?region=cn-sq1 → 仅返回该区域可用 OS
  @Public()
  @Get('meta/os')
  async osList(@Query('region') region?: string) {
    const os = await this.productService.getOsList(region);
    return ApiResponse.success(os);
  }

  // 区域列表
  @Public()
  @Get('meta/zones')
  async zones() {
    const zones = await this.productService.getZones();
    return ApiResponse.success(zones);
  }

  // 流量类型选项（雨云所有区域均为无限流量，仅宁波为叠加流量）
  @Public()
  @Get('meta/traffic-types')
  async trafficTypes() {
    return ApiResponse.success([
      { value: 'unlimited', label: '无限流量' },
      { value: 'stacked', label: '叠加流量' },
    ]);
  }

  // 预装软件模板列表（用于购买页选择预装软件）
  @Public()
  @Get('meta/app-templates')
  async appTemplates() {
    const apps = await this.productService.getAppTemplates();
    return ApiResponse.success(apps);
  }

  // 商品详情
  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    const product = await this.productService.getProduct(parseInt(id, 10));
    return ApiResponse.success(product);
  }

  // 实时库存查询（调上游 /product/rcs/plans 获取最新 available_stock）
  // 返回 { availableStock, upstreamAvailable, updatedAt, fallback? }
  // 用途：购买页进入时、下单前实时刷新库存，避免本地快照过期
  @Public()
  @Get(':id/stock')
  async stock(@Param('id') id: string) {
    const result = await this.productService.getRealtimeStock(parseInt(id, 10));
    return ApiResponse.success(result);
  }
}
