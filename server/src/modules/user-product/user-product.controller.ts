// 用户产品 Controller — 路由 api/user-products（全部需登录）
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserProductService } from './user-product.service';
import { RainyunService } from '../rainyun/rainyun.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse, BizError } from '../../common/api-response';

@Controller('api/user-products')
@UseGuards(JwtAuthGuard)
export class UserProductController {
  constructor(
    private userProduct: UserProductService,
    private rainyun: RainyunService,
  ) {}

  // 用户产品列表（支持 state 筛选 + 分页）
  // 注：列表加载时自动触发从子用户面板同步，确保面板设备变化能反映到本站
  @Get()
  async list(@CurrentUser('sub') userId: number, @Query() query: any) {
    // 静默触发面板同步（失败不影响列表加载）
    try {
      await this.userProduct.syncUserProductsFromPanel(userId);
    } catch {
      // 静默失败
    }
    const result = await this.userProduct.listUserProducts(userId, query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  // 手动触发从子用户面板同步设备
  @Post('sync-panel')
  async syncPanel(@CurrentUser('sub') userId: number) {
    const result = await this.userProduct.syncUserProductsFromPanel(userId);
    return ApiResponse.success(result, '面板同步完成');
  }

  // 产品详情（含上游 RCS 实时状态 + 资源使用率）
  @Get(':id')
  async detail(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    const up = await this.userProduct.getProduct(parseInt(id, 10), userId);
    // 附加上游实时详情（含 usage_percent）
    let upstreamDetail: any = null;
    if (up.upstreamRcsId) {
      try {
        upstreamDetail = await this.rainyun.getRcs(up.upstreamRcsId, `user_id:${userId}`);
      } catch {
        // 上游不可达时仅返回本地数据
      }
    }
    return ApiResponse.success({ ...up, upstreamDetail });
  }

  // 实时资源使用率（CPU/内存/磁盘/网络）
  @Get(':id/usage')
  async usage(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    const up = await this.userProduct.getProduct(parseInt(id, 10), userId);
    if (!up.upstreamRcsId) throw new BizError('产品未关联上游 RCS');
    const rcs = await this.rainyun.getRcs(up.upstreamRcsId, `user_id:${userId}`);
    return ApiResponse.success({
      status: rcs?.status,
      usage_percent: rcs?.usage_percent || null,
      usage_data: rcs?.usage_data || null,
      traffic_bytes: rcs?.traffic_bytes || 0,
      traffic_bytes_day_limit: rcs?.traffic_bytes_day_limit || 0,
      net_in: rcs?.net_in || 0,
      net_out: rcs?.net_out || 0,
      update_time: rcs?.usage_percent?.update_time || null,
    });
  }

  // 开机/关机/重启（直接调雨云官方 API）
  @Post(':id/operate')
  async operate(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
    @Body() body: { action: string },
  ) {
    const up = await this.userProduct.getProduct(parseInt(id, 10), userId);
    if (!up.upstreamRcsId) throw new BizError('产品未关联上游 RCS');
    const allowed = ['start', 'stop', 'restart'];
    if (!allowed.includes(body.action)) {
      throw new BizError('不支持的操作，仅支持：start/stop/restart');
    }
    // 状态校验：开机时若已 running 则拒绝，关机时若已 stopped 则拒绝
    if (body.action === 'start' && up.state === 'RUNNING') {
      throw new BizError('服务器已在运行中，无需开机');
    }
    if (body.action === 'stop' && up.state === 'STOPPED') {
      throw new BizError('服务器已关机，无需重复关机');
    }
    const result = await this.rainyun.rcsAction(
      up.upstreamRcsId,
      body.action,
      null,
      `user_id:${userId}`,
    );
    // 同步本地状态
    const newState = body.action === 'start' ? 'RUNNING' : body.action === 'stop' ? 'STOPPED' : up.state;
    await this.userProduct.updateProductState(up.id, newState);
    const actionLabel = { start: '开机', stop: '关机', restart: '重启' }[body.action] || body.action;
    return ApiResponse.success(result, `${actionLabel}指令已发送`);
  }

  // 重装系统（直接调雨云官方 API）
  // 请求体：
  //   - osId: 必填，操作系统 ID（来自 /os-templates）
  //   - password: 可选，不传则雨云自动随机生成
  //   - appVars: 可选，预装软件 [{ app_id, vars }]
  @Post(':id/reinstall')
  async reinstall(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
    @Body() body: { osId: number; password?: string; appVars?: Array<{ app_id: number; vars?: Record<string, string> }> },
  ) {
    const up = await this.userProduct.getProduct(parseInt(id, 10), userId);
    if (!up.upstreamRcsId) throw new BizError('产品未关联上游 RCS');
    if (!body.osId) throw new BizError('请选择要安装的操作系统');
    const result = await this.rainyun.reinstallRcs(
      up.upstreamRcsId,
      Number(body.osId),
      body.password,
      `user_id:${userId}`,
      body.appVars,
    );
    const hint = body.password
      ? '重装系统指令已发送，请等待几分钟'
      : '重装系统指令已发送，系统将自动生成随机密码，请稍后在面板查看';
    return ApiResponse.success(result, hint);
  }

  // OS 模板列表（用于重装系统选择，与购买页保持一致）
  // 复用 getRcsOs(zone)：按产品 zone 过滤 + mapOs 字段标准化 + is_available 过滤
  @Get(':id/os-templates')
  async osTemplates(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    const up = await this.userProduct.getProduct(parseInt(id, 10), userId);
    // 优先用产品 zone 过滤（与购买页一致），zone 缺失时返回所有区域
    const zone = (up as any).zone || '';
    const { os } = await this.rainyun.getRcsOs(zone);
    return ApiResponse.success(os);
  }

  // 预装软件列表（用于重装系统选择，与购买页保持一致）
  @Get(':id/app-templates')
  async appTemplates(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    // 先校验产品归属
    await this.userProduct.getProduct(parseInt(id, 10), userId);
    const { apps } = await this.rainyun.getRcsAppTemplates();
    return ApiResponse.success(apps);
  }

  // 手动同步单个产品状态
  @Post(':id/sync')
  async sync(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    // 先校验归属
    await this.userProduct.getProduct(parseInt(id, 10), userId);
    const up = await this.userProduct.syncProductState(parseInt(id, 10));
    return ApiResponse.success(up, '同步成功');
  }

  // 获取续费价格（透传雨云 GET /product/rcs/{id}/renew/）
  // 返回 { prices: { '1': x, '3': y, '6': z, '12': w } }（单位：元）
  @Get(':id/renew-price')
  async renewPrice(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    const prices = await this.userProduct.getRenewPrice(parseInt(id, 10), userId);
    return ApiResponse.success({ prices });
  }

  // 续费（直接调雨云官方 API：POST /product/rcs/{id}/renew）
  // 请求体：{ duration: number }，单位月，雨云官方仅支持 1/3/6/12 月
  // 注：本接口仅做上游续费动作，扣费由 Order 模块处理（如需走支付流程请走续费订单）
  @Post(':id/renew')
  async renew(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
    @Body() body: { duration: number },
  ) {
    const months = Number(body?.duration);
    if (![1, 3, 6, 12].includes(months)) {
      throw new BizError('续费时长仅支持 1/3/6/12 月');
    }
    const updated = await this.userProduct.renew(parseInt(id, 10), userId, months);
    return ApiResponse.success(updated, `续费 ${months} 个月成功`);
  }

  // 获取雨云官方面板登录信息
  // 注：雨云白标面板地址 https://app.rainyun.com/panel
  //     用户名 = 本站 panelUserName，密码 = 用户注册时生成的独立面板密码
  //     用户可在面板内修改密码，本站不存储明文面板密码
  @Get(':id/panel-url')
  async panelUrl(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    // 先校验产品归属
    await this.userProduct.getProduct(parseInt(id, 10), userId);
    const data = await this.userProduct.getPanelLoginUrl(userId);
    return ApiResponse.success(data);
  }
}
