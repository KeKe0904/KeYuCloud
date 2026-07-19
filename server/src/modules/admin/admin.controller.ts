// 管理员后台 Controller — 全部管理后台 API 入口，路由前缀 api/admin
// 全类应用 AdminAuthGuard（除登录接口 @Public）
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AdminService, AuditContext } from './admin.service';
import { AdminAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentAdmin } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/api-response';
import {
  LoginDto,
  ChangePasswordDto,
  UserStatusDto,
  BalanceAdjustDto,
  ResetPasswordDto,
  CreateProductDto,
  UpdateProductDto,
  RefundDto,
  OperateDto,
  AssignTicketDto,
  ReplyTicketDto,
  CreateCouponDto,
  UpdateCouponDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  UpdateConfigDto,
  CreateAdminDto,
  UpdateAdminDto,
  UpdateProfileDto,
  UpdatePanelConfigDto,
  UpdateRainyunApiKeyDto,
} from './dto';
// SMTP 模板/测试 DTO 复用 mailer 模块定义（保持解耦的同时避免重复定义）
import {
  UpdateSmtpDto,
  TestSendDto,
  CreateTemplateDto,
  UpdateTemplateDto,
} from '../mailer/dto';
// 短信服务 DTO（阿里云号码认证 PNVS）
import { UpdateSmsConfigDto, TestSmsDto } from '../sms/dto';

@Controller('api/admin')
@Public() // 让全局 JwtAuthGuard 放行，由 AdminAuthGuard 做管理员认证
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

  // 从请求中提取审计上下文
  private ctx(req: Request): AuditContext {
    return {
      ip: req.ip || req.socket?.remoteAddress || undefined,
      userAgent: req.headers['user-agent'],
    };
  }

  private ensureSuperAdmin(role: string | undefined) {
    if (role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('仅超级管理员可执行此操作');
    }
  }

  // 校验当前管理员角色是否在允许列表中
  private ensureRoleIn(role: string | undefined, allowed: string[]) {
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException(`当前角色无权执行此操作（允许的角色：${allowed.join(', ')}）`);
    }
  }

  // 可执行财务类敏感操作的角色
  private static FINANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'FINANCE'];
  // 可执行运营类操作的角色
  private static OPS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'];
  // 可执行工单类操作的角色
  private static SUPPORT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'SUPPORT', 'TECH'];

  // ============ 1. 管理员认证 ============

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 管理员登录防暴力破解
  @Post('auth/login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.admin.login(dto, this.ctx(req));
    return ApiResponse.success(result, '登录成功');
  }

  @Get('auth/profile')
  async profile(@CurrentAdmin('sub') adminId: number) {
    const data = await this.admin.getProfile(adminId);
    return ApiResponse.success(data);
  }

  @Put('auth/profile')
  async updateProfile(
    @CurrentAdmin('sub') adminId: number,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    const data = await this.admin.updateProfile(adminId, dto, this.ctx(req));
    return ApiResponse.success(data, '个人资料已更新');
  }

  @Post('auth/change-password')
  async changePassword(
    @CurrentAdmin('sub') adminId: number,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    await this.admin.changePassword(adminId, dto, this.ctx(req));
    return ApiResponse.success(null, '密码修改成功');
  }

  // QQ 昵称代理：前端直调第三方 API 会有 CORS 问题，由后端代理
  // 多端点兜底，任一成功即返回
  // 注：QQ 头像始终可用（https://q1.qlogo.cn/g?b=qq&nk={qq}&s=140），不依赖这些接口
  //     这些接口仅用于拉取昵称；任一失效时自动 fallback 到下一个
  @Get('auth/qq-nickname')
  async fetchQqNickname(@Query('qq') qq: string) {
    const qqTrim = (qq || '').trim();
    if (!/^\d{4,12}$/.test(qqTrim)) {
      ApiResponse.error('QQ 号格式不正确', 'BIZ_ERROR', 400);
    }
    // 端点列表（按稳定性排序，任一成功即返回）
    // 注：在沙箱/容器内网环境下部分端点可能不可达，多端点兜底提高成功率
    const endpoints = [
      // ffapi.cn：返回 {code:200, name:"xxx", avatar:"..."}
      `http://ffapi.cn/int/v1/qqname?qq=${qqTrim}`,
      // guiguiya：返回 {code:200, data:{name:"xxx"}}
      `https://api.guiguiya.com/api/qq_info?qq=${qqTrim}`,
      // uomg：返回 {code:1, data:{name:"xxx"}}（备用）
      `https://api.uomg.com/api/qq.info?qq=${qqTrim}`,
      // leafone：返回 {code:200, name:"xxx"}（备用）
      `https://api.leafone.cn/api/qqname?qq=${qqTrim}`,
    ];
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RainyunReseller/1.0)' },
        });
        if (!resp.ok) continue;
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data: any = await resp.json().catch(() => null);
          if (!data) continue;
          // 兼容多种返回格式
          const name =
            data.name ||
            data.nickname ||
            data.data?.name ||
            data.data?.nickname ||
            null;
          if (name && typeof name === 'string' && name.length > 0 && name.length <= 32) {
            return ApiResponse.success({ nickname: name.trim(), source: url });
          }
        } else {
          const text = (await resp.text()).trim();
          if (text && text.length <= 32 && !text.includes('<')) {
            return ApiResponse.success({ nickname: text, source: url });
          }
        }
      } catch {
        // 该端点失败，尝试下一个
      }
    }
    return ApiResponse.success({ nickname: null, source: null }, 'QQ 昵称获取失败（所有端点不可达），请手动填写');
  }

  // ============ 2. 仪表盘 ============

  @Get('dashboard')
  async dashboard() {
    const data = await this.admin.getDashboard();
    return ApiResponse.success(data);
  }

  // ============ 3. 用户管理 ============

  @Get('users')
  async listUsers(@Query() query: any) {
    const result = await this.admin.listUsers(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    const data = await this.admin.getUserDetail(parseInt(id, 10));
    return ApiResponse.success(data);
  }

  @Put('users/:id/status')
  async updateUserStatus(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: UserStatusDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.updateUserStatus(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, `用户状态已更新为 ${dto.status}`);
  }

  @Post('users/:id/balance')
  async adjustBalance(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: BalanceAdjustDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.FINANCE_ROLES);
    const result = await this.admin.adjustBalance(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '余额调整成功');
  }

  @Post('users/:id/reset-password')
  async resetUserPassword(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.SUPPORT_ROLES);
    await this.admin.resetUserPassword(adminId, parseInt(id, 10), dto, this.ctx(req));
    return ApiResponse.success(null, '密码已重置');
  }

  @Post('users/:id/rebuild-panel-user')
  async rebuildPanelUser(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.rebuildPanelUser(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, 'panel_user 重建成功');
  }

  // ============ 4. 商品管理 ============

  @Get('products')
  async listProducts(@Query() query: any) {
    const list = await this.admin.listProducts(query);
    return ApiResponse.success(list);
  }

  @Post('products')
  async createProduct(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: CreateProductDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.createProduct(dto);
    return ApiResponse.success(result, '商品创建成功');
  }

  @Put('products/:id')
  async updateProduct(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.updateProduct(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '商品更新成功');
  }

  // 删除所有商品（批量操作）
  //   mode=soft  → 全部下架（isOnSale=false），数据保留
  //   mode=hard  → 物理删除所有商品记录（不可恢复，需超级管理员）
  // 注：必须放在 @Delete('products/:id') 之前，否则 'all' 会被 :id 捕获
  @Delete('products/all')
  async deleteAllProducts(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Query('mode') mode: string,
    @Req() req: Request,
  ) {
    // 物理删除需超级管理员；软删除允许运维角色
    const finalMode: 'soft' | 'hard' = mode === 'hard' ? 'hard' : 'soft';
    if (finalMode === 'hard') {
      this.ensureSuperAdmin(role);
    } else {
      this.ensureRoleIn(role, AdminController.OPS_ROLES);
    }
    const result = await this.admin.deleteAllProducts(
      adminId,
      finalMode,
      this.ctx(req),
    );
    return ApiResponse.success(
      result,
      finalMode === 'hard' ? '已物理删除全部商品' : '已下架全部商品',
    );
  }

  @Delete('products/:id')
  async deleteProduct(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.deleteProduct(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '商品已下架');
  }

  @Post('products/sync')
  @Throttle({ default: { limit: 2, ttl: 300_000 } }) // 上游同步 5 分钟内最多 2 次，防止消耗上游配额
  async syncProducts(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.syncUpstreamPlans(adminId, this.ctx(req));
    return ApiResponse.success(result, '上游套餐同步完成');
  }

  // ============ 5. 订单管理 ============

  @Get('orders')
  async listOrders(@Query() query: any) {
    const result = await this.admin.listOrders(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  @Get('orders/:id')
  async getOrder(@Param('id') id: string) {
    const data = await this.admin.getOrderDetail(parseInt(id, 10));
    return ApiResponse.success(data);
  }

  @Post('orders/:id/refund')
  async refundOrder(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: RefundDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.FINANCE_ROLES);
    const result = await this.admin.refundOrder(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '退款处理完成');
  }

  @Post('orders/:id/retry-open')
  async retryOpen(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.retryOpenOrder(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '已触发重试开通');
  }

  // ============ 6. 用户产品管理 ============

  @Get('user-products')
  async listUserProducts(@Query() query: any) {
    const result = await this.admin.listUserProducts(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  @Get('user-products/:id')
  async getUserProduct(@Param('id') id: string) {
    const data = await this.admin.getUserProductDetail(parseInt(id, 10));
    return ApiResponse.success(data);
  }

  @Post('user-products/:id/sync')
  async syncUserProduct(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.SUPPORT_ROLES);
    const result = await this.admin.syncUserProduct(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '状态同步成功');
  }

  @Post('user-products/:id/operate')
  async operateUserProduct(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: OperateDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.SUPPORT_ROLES);
    const result = await this.admin.operateUserProduct(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, `操作 ${dto.action} 已执行`);
  }

  // ============ 7. 工单管理 ============

  @Get('tickets')
  async listTickets(@Query() query: any) {
    const result = await this.admin.listTickets(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  @Get('tickets/:id')
  async getTicket(@Param('id') id: string) {
    const data = await this.admin.getTicketDetail(parseInt(id, 10));
    return ApiResponse.success(data);
  }

  @Post('tickets/:id/assign')
  async assignTicket(
    @CurrentAdmin('sub') adminId: number,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @Req() req: Request,
  ) {
    const result = await this.admin.assignTicket(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '工单已分配');
  }

  @Post('tickets/:id/reply')
  async replyTicket(
    @CurrentAdmin('sub') adminId: number,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
    @Req() req: Request,
  ) {
    const result = await this.admin.replyTicket(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '回复已发送');
  }

  @Post('tickets/:id/close')
  async closeTicket(
    @CurrentAdmin('sub') adminId: number,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const result = await this.admin.closeTicket(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '工单已关闭');
  }

  @Post('tickets/:id/escalate')
  async escalateTicket(
    @CurrentAdmin('sub') adminId: number,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const result = await this.admin.escalateTicket(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '已升级到雨云工单');
  }

  // ============ 8. 财务管理 ============

  @Get('finance/overview')
  async financeOverview() {
    const data = await this.admin.getFinanceOverview();
    return ApiResponse.success(data);
  }

  @Get('finance/transactions')
  async listTransactions(@Query() query: any) {
    const result = await this.admin.listTransactions(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  @Get('finance/export')
  async exportTransactions(@Query() query: any) {
    const data = await this.admin.exportTransactions(query);
    return ApiResponse.success(data);
  }

  // ============ 9. 上游管理 ============

  @Get('upstream/info')
  async upstreamInfo() {
    const data = await this.admin.getUpstreamInfo();
    return ApiResponse.success(data);
  }

  @Get('upstream/panel-config')
  async panelConfig() {
    const data = await this.admin.getPanelConfig();
    return ApiResponse.success(data);
  }

  @Put('upstream/panel-config')
  async updatePanelConfig(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: UpdatePanelConfigDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.updatePanelConfig(
      adminId,
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '白标配置已更新');
  }

  @Get('upstream/logs')
  async upstreamLogs(@CurrentAdmin('role') role: string, @Query() query: any) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.listUpstreamLogs(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  @Get('upstream/panel-users')
  async panelUsers(@CurrentAdmin('role') role: string) {
    this.ensureSuperAdmin(role);
    const data = await this.admin.listPanelUsers();
    return ApiResponse.success(data);
  }

  // 雨云 API Key 配置（获取，apiKey 脱敏）
  @Get('upstream/api-key')
  async getRainyunApiKey(@CurrentAdmin('role') role: string) {
    this.ensureSuperAdmin(role);
    const data = await this.admin.getRainyunApiKeyConfig();
    return ApiResponse.success(data);
  }

  // 雨云 API Key 配置（更新，AES 加密存储 + 运行时热更新）
  @Put('upstream/api-key')
  async updateRainyunApiKey(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: UpdateRainyunApiKeyDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.updateRainyunApiKeyConfig(
      adminId,
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '雨云 API Key 已更新');
  }

  // 雨云 API Key 测试连接（用当前配置调用 /user/ 掞验 Key 是否有效）
  @Post('upstream/api-key/test')
  async testRainyunApiKey(@CurrentAdmin('role') role: string) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.testRainyunApiKey();
    return ApiResponse.success(result);
  }

  // ============ 10. SMTP 邮件 ============

  @Get('smtp/config')
  async smtpConfig(@CurrentAdmin('role') role: string) {
    this.ensureSuperAdmin(role);
    const data = await this.admin.getSmtpConfig();
    return ApiResponse.success(data);
  }

  @Put('smtp/config')
  async updateSmtpConfig(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: UpdateSmtpDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.updateSmtpConfig(adminId, dto, this.ctx(req));
    return ApiResponse.success(result, 'SMTP 配置已更新');
  }

  @Post('smtp/test')
  async testSmtp(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: TestSendDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.testSmtp(adminId, dto, this.ctx(req));
    return ApiResponse.success(result);
  }

  @Get('smtp/templates')
  async listEmailTemplates(@CurrentAdmin('role') role: string) {
    this.ensureSuperAdmin(role);
    const data = await this.admin.listEmailTemplates();
    return ApiResponse.success(data);
  }

  @Post('smtp/templates')
  async createEmailTemplate(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: CreateTemplateDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.createEmailTemplate(adminId, dto, this.ctx(req));
    return ApiResponse.success(result, '模板创建成功');
  }

  @Put('smtp/templates/:id')
  async updateEmailTemplate(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.updateEmailTemplate(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '模板已更新');
  }

  @Delete('smtp/templates/:id')
  async deleteEmailTemplate(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.deleteEmailTemplate(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '模板已删除');
  }

  @Get('smtp/logs')
  async emailLogs(@CurrentAdmin('role') role: string, @Query() query: any) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.listEmailLogs(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  // ============ 10.5 短信服务（阿里云号码认证 PNVS） ============

  @Get('sms/config')
  async smsConfig(@CurrentAdmin('role') role: string) {
    this.ensureSuperAdmin(role);
    const data = await this.admin.getSmsConfig();
    return ApiResponse.success(data);
  }

  @Put('sms/config')
  async updateSmsConfig(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: UpdateSmsConfigDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.updateSmsConfig(adminId, dto, this.ctx(req));
    return ApiResponse.success(result, '短信配置已更新');
  }

  @Post('sms/test')
  async testSms(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: TestSmsDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.testSms(adminId, dto, this.ctx(req));
    return ApiResponse.success(result);
  }

  @Get('sms/logs')
  async smsLogs(@CurrentAdmin('role') role: string, @Query() query: any) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.listSmsLogs(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  // ============ 11. 优惠券管理 ============

  @Get('coupons')
  async listCoupons(@Query() query: any) {
    const result = await this.admin.listCoupons(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  @Post('coupons')
  async createCoupon(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: CreateCouponDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.createCoupon(adminId, dto, this.ctx(req));
    return ApiResponse.success(result, '优惠券创建成功');
  }

  @Put('coupons/:id')
  async updateCoupon(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.updateCoupon(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '优惠券已更新');
  }

  @Delete('coupons/:id')
  async deleteCoupon(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.deleteCoupon(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '优惠券已删除');
  }

  // ============ 12. 公告管理 ============

  @Get('announcements')
  async listAnnouncements(@Query() query: any) {
    const result = await this.admin.listAnnouncements(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  @Post('announcements')
  async createAnnouncement(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: CreateAnnouncementDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.createAnnouncement(adminId, dto, this.ctx(req));
    return ApiResponse.success(result, '公告创建成功');
  }

  @Put('announcements/:id')
  async updateAnnouncement(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.updateAnnouncement(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
    );
    return ApiResponse.success(result, '公告已更新');
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    this.ensureRoleIn(role, AdminController.OPS_ROLES);
    const result = await this.admin.deleteAnnouncement(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '公告已删除');
  }

  // ============ 13. 系统配置 ============

  @Get('system/configs')
  async listConfigs(@CurrentAdmin('role') role: string) {
    this.ensureSuperAdmin(role);
    const data = await this.admin.listConfigs();
    return ApiResponse.success(data);
  }

  @Put('system/configs')
  async updateConfigs(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: UpdateConfigDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.updateConfigs(adminId, dto, this.ctx(req));
    return ApiResponse.success(result, '系统配置已更新');
  }

  // ============ 14. 管理员管理（仅 SUPER_ADMIN） ============

  @Get('admins')
  async listAdmins(@CurrentAdmin('sub') adminId: number) {
    const data = await this.admin.listAdmins(adminId);
    return ApiResponse.success(data);
  }

  @Post('admins')
  async createAdmin(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Body() dto: CreateAdminDto,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.createAdmin(adminId, dto, this.ctx(req));
    return ApiResponse.success(result, '管理员创建成功');
  }

  @Put('admins/:id')
  async updateAdmin(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
    @Req() req: Request,
  ) {
    // 权限下沉到 service：超级管理员可改任何字段，普通管理员仅可改自己且不可改角色/状态/密码
    const result = await this.admin.updateAdmin(
      adminId,
      parseInt(id, 10),
      dto,
      this.ctx(req),
      role,
    );
    return ApiResponse.success(result, '管理员已更新');
  }

  @Delete('admins/:id')
  async deleteAdmin(
    @CurrentAdmin('sub') adminId: number,
    @CurrentAdmin('role') role: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.deleteAdmin(
      adminId,
      parseInt(id, 10),
      this.ctx(req),
    );
    return ApiResponse.success(result, '管理员已删除');
  }

  // ============ 15. 审计日志 ============

  @Get('audit-logs')
  async listAuditLogs(@CurrentAdmin('role') role: string, @Query() query: any) {
    this.ensureSuperAdmin(role);
    const result = await this.admin.listAuditLogs(query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }
}
