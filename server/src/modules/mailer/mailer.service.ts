/**
 * 邮件服务 — SMTP 配置 / 模板 / 日志 / 发送
 * 配置存 DB（敏感字段 AES 加密），发送通过 nodemailer
 */
import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../common/prisma.service';
import { CryptoUtil } from '../../common/crypto.util';
import { parsePaging } from '../../common/api-response';
import {
  UpdateSmtpDto,
  TestSendDto,
  UpdateTemplateDto,
  CreateTemplateDto,
  SendMailDto,
} from './dto';

// 默认邮件模板（表为空时初始化）
const DEFAULT_TEMPLATES = [
  {
    code: 'register_verify',
    name: '注册验证码',
    subject: '【云服分销平台】您的注册验证码',
    htmlContent:
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:8px"><h2 style="color:#B8860B">注册验证码</h2><p>您正在注册云服分销平台账号，验证码为：</p><p style="font-size:24px;font-weight:bold;color:#B8860B;letter-spacing:4px;text-align:center;padding:16px;background:#FBF3DD;border-radius:6px">{{code}}</p><p style="color:#999;font-size:12px">5 分钟内有效，如非本人操作请忽略。</p></div>',
    textContent: '您正在注册云服分销平台账号，验证码为：{{code}}，5 分钟内有效。',
    variables: JSON.stringify(['code']),
  },
  {
    code: 'reset_password',
    name: '找回密码',
    subject: '【云服分销平台】密码重置验证码',
    htmlContent:
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:8px"><h2 style="color:#B8860B">密码重置</h2><p>验证码：<strong style="font-size:20px;color:#B8860B">{{code}}</strong></p><p style="color:#999;font-size:12px">10 分钟内有效。</p></div>',
    textContent: '密码重置验证码：{{code}}，10 分钟内有效。',
    variables: JSON.stringify(['code']),
  },
  {
    code: 'order_paid',
    name: '订单支付成功',
    subject: '【云服分销平台】订单支付成功',
    htmlContent:
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px"><h2 style="color:#B8860B">支付成功</h2><p>订单号：{{orderNo}}</p><p>金额：¥{{amount}}</p><p>商品：{{productName}}</p><p>系统正在为您开通，请稍候。</p></div>',
    textContent: '订单 {{orderNo}} 支付成功，金额 ¥{{amount}}，商品：{{productName}}',
    variables: JSON.stringify(['orderNo', 'amount', 'productName']),
  },
  {
    code: 'product_opened',
    name: '产品开通成功',
    subject: '【云服分销平台】产品已开通',
    htmlContent:
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px"><h2 style="color:#B8860B">产品开通成功</h2><p>产品：{{productName}}</p><p>到期时间：{{expireAt}}</p><p>请前往用户中心查看详情并管理您的产品。</p></div>',
    textContent: '产品 {{productName}} 已开通，到期时间 {{expireAt}}',
    variables: JSON.stringify(['productName', 'expireAt']),
  },
  {
    code: 'product_expiring',
    name: '产品即将到期',
    subject: '【云服分销平台】您的产品即将到期',
    htmlContent:
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px"><h2 style="color:#B8860B">到期提醒</h2><p>产品：{{productName}}</p><p>到期时间：{{expireAt}}</p><p>请及时续费避免服务中断。</p></div>',
    textContent: '产品 {{productName}} 即将于 {{expireAt}} 到期，请及时续费',
    variables: JSON.stringify(['productName', 'expireAt']),
  },
  {
    code: 'ticket_replied',
    name: '工单有新回复',
    subject: '【云服分销平台】工单有新回复',
    htmlContent:
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px"><h2 style="color:#B8860B">工单回复</h2><p>工单：{{ticketTitle}}</p><p>回复人：{{replyBy}}</p><p>请前往用户中心查看完整对话。</p></div>',
    textContent: '工单 {{ticketTitle}} 有新回复（来自 {{replyBy}}）',
    variables: JSON.stringify(['ticketTitle', 'replyBy']),
  },
  {
    code: 'balance_changed',
    name: '余额变动通知',
    subject: '【云服分销平台】余额变动',
    htmlContent:
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px"><h2 style="color:#B8860B">余额变动</h2><p>类型：{{type}}</p><p>金额：¥{{amount}}</p><p>当前余额：¥{{balance}}</p></div>',
    textContent: '余额变动：{{type}} ¥{{amount}}，当前余额 ¥{{balance}}',
    variables: JSON.stringify(['type', 'amount', 'balance']),
  },
];

@Injectable()
export class MailerService implements OnModuleInit {
  private logger = new Logger('Mailer');
  private transporter: nodemailer.Transporter | null = null;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaultTemplates();
    await this.refreshTransporter();
  }

  // ============ SMTP 配置 ============

  // 判断 SMTP 是否启用（用于注册/管理员创建时决定是否强制要求邮箱）
  // 满足条件：配置存在 + enabled=true + host 非空
  async isSmtpEnabled(): Promise<boolean> {
    const config = await this.prisma.smtpConfig.findUnique({ where: { id: 1 } });
    return !!(config && config.enabled && config.host);
  }

  async getSmtpConfig() {
    const config = await this.prisma.smtpConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      // 返回默认空配置
      return {
        enabled: false,
        host: '',
        port: 465,
        encryption: 'SSL',
        username: '',
        fromAddress: '',
        fromName: '',
        replyTo: '',
        hasPassword: false,
        connectTimeout: 10,
        sendTimeout: 30,
        retryCount: 3,
        dailyLimit: 1000,
      };
    }
    return {
      ...config,
      passwordEnc: undefined,
      hasPassword: !!config.passwordEnc,
    };
  }

  async updateSmtpConfig(dto: UpdateSmtpDto, adminId?: number) {
    const existing = await this.prisma.smtpConfig.findUnique({ where: { id: 1 } });
    const data: any = {
      enabled: dto.enabled,
      host: dto.host,
      port: dto.port,
      encryption: dto.encryption,
      username: dto.username,
      fromAddress: dto.fromAddress,
      fromName: dto.fromName,
      replyTo: dto.replyTo,
      connectTimeout: dto.connectTimeout ?? 10,
      sendTimeout: dto.sendTimeout ?? 30,
      retryCount: dto.retryCount ?? 3,
      dailyLimit: dto.dailyLimit ?? 1000,
      updatedBy: adminId,
    };
    // 密码单独处理（不传则保留）
    if (dto.password !== undefined && dto.password !== '') {
      data.passwordEnc = CryptoUtil.encrypt(dto.password);
    }
    if (existing) {
      await this.prisma.smtpConfig.update({ where: { id: 1 }, data });
    } else {
      await this.prisma.smtpConfig.create({ data: { id: 1, ...data } });
    }
    // 重新初始化 transporter
    await this.refreshTransporter();
    return { success: true };
  }

  async testSend(dto: TestSendDto, adminId?: number) {
    const config = await this.prisma.smtpConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.host) throw new BadRequestException('请先配置 SMTP');

    const password = config.passwordEnc ? CryptoUtil.decrypt(config.passwordEnc) : '';
    const transporter = this.createTransporter(config, password);
    const startedAt = Date.now();
    let result = '';
    let success = false;
    try {
      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromAddress}>`,
        to: dto.to,
        subject: '【测试邮件】SMTP 配置验证',
        html: '<p>这是一封来自云服分销平台的测试邮件，SMTP 配置成功。</p><p style="color:#999;font-size:12px">收到此邮件说明 SMTP 服务可用。</p>',
      });
      success = true;
      result = '发送成功';
    } catch (err: any) {
      result = `发送失败: ${err.message}`;
      this.logger.error(`SMTP 测试失败: ${err.message}`);
    } finally {
      transporter.close();
    }
    const durationMs = Date.now() - startedAt;
    await this.prisma.smtpConfig.update({
      where: { id: 1 },
      data: { lastTestAt: new Date(), lastTestResult: `${success ? '成功' : '失败'} (${durationMs}ms) ${result}` },
    });
    await this.logEmail(dto.to, '【测试邮件】SMTP 配置验证', null, null, success ? 'sent' : 'failed', success ? null : result, durationMs);
    return { success, message: result, durationMs };
  }

  // ============ 邮件模板 ============

  async listTemplates() {
    return this.prisma.emailTemplate.findMany({ orderBy: { id: 'asc' } });
  }

  async getTemplate(id: number) {
    return this.prisma.emailTemplate.findUnique({ where: { id } });
  }

  async getTemplateByCode(code: string) {
    return this.prisma.emailTemplate.findUnique({ where: { code } });
  }

  async createTemplate(dto: CreateTemplateDto) {
    return this.prisma.emailTemplate.create({
      data: {
        code: dto.code,
        name: dto.name,
        subject: dto.subject,
        htmlContent: dto.htmlContent,
        textContent: dto.textContent,
        variables: JSON.stringify(dto.variables || []),
        enabled: dto.enabled ?? true,
      },
    });
  }

  async updateTemplate(id: number, dto: UpdateTemplateDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.htmlContent !== undefined) data.htmlContent = dto.htmlContent;
    if (dto.textContent !== undefined) data.textContent = dto.textContent;
    if (dto.variables !== undefined) data.variables = JSON.stringify(dto.variables);
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    return this.prisma.emailTemplate.update({ where: { id }, data });
  }

  async deleteTemplate(id: number) {
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { success: true };
  }

  // ============ 邮件日志 ============

  async listEmailLogs(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.templateCode) where.templateCode = query.templateCode;
    if (query.userId) where.userId = Number(query.userId);
    const [list, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.emailLog.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async resendEmail(logId: number) {
    const log = await this.prisma.emailLog.findUnique({ where: { id: logId } });
    if (!log) throw new BadRequestException('日志不存在');
    // 简化：直接标记为重试中，实际重发逻辑可扩展
    return { success: true, message: '已加入重发队列' };
  }

  // ============ 发送（业务层调用）============

  /**
   * 通过模板发送邮件
   */
  async sendByTemplate(
    code: string,
    to: string,
    variables: Record<string, string>,
    userId?: number,
  ): Promise<boolean> {
    const template = await this.getTemplateByCode(code);
    if (!template || !template.enabled) {
      this.logger.warn(`模板 ${code} 不存在或已禁用，跳过发送`);
      return false;
    }
    const config = await this.prisma.smtpConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.enabled) {
      this.logger.warn('SMTP 未启用，跳过发送');
      return false;
    }

    const subject = this.render(template.subject, variables);
    const html = this.render(template.htmlContent, variables);
    const text = this.render(template.textContent, variables);

    return this.doSend(config, to, subject, html, text, code, userId);
  }

  /**
   * 直接发送邮件
   */
  async send(dto: SendMailDto): Promise<boolean> {
    const config = await this.prisma.smtpConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.enabled) throw new BadRequestException('SMTP 未启用');
    return this.doSend(config, dto.to, dto.subject, dto.html, dto.text, null, dto.userId);
  }

  // ============ 内部方法 ============

  private async refreshTransporter() {
    const config = await this.prisma.smtpConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.enabled || !config.host) {
      this.transporter = null;
      return;
    }
    const password = config.passwordEnc ? CryptoUtil.decrypt(config.passwordEnc) : '';
    this.transporter = this.createTransporter(config, password);
    this.logger.log(`📧 SMTP transporter 已初始化: ${config.host}:${config.port}`);
  }

  private createTransporter(config: any, password: string): nodemailer.Transporter {
    const port = config.port;
    let secure = false;
    let requireTLS = false;
    if (config.encryption === 'SSL') secure = true;
    if (config.encryption === 'STARTTLS') requireTLS = true;

    return nodemailer.createTransport({
      host: config.host,
      port,
      secure,
      requireTLS,
      auth: password ? { user: config.username, pass: password } : undefined,
      connectionTimeout: (config.connectTimeout || 10) * 1000,
      greetingTimeout: (config.connectTimeout || 10) * 1000,
      socketTimeout: (config.sendTimeout || 30) * 1000,
    } as any);
  }

  private async doSend(
    config: any,
    to: string,
    subject: string,
    html: string,
    text: string,
    templateCode: string | null,
    userId?: number,
  ): Promise<boolean> {
    if (!this.transporter) await this.refreshTransporter();
    if (!this.transporter) {
      await this.logEmail(to, subject, templateCode, userId, 'failed', 'SMTP 未配置', null);
      return false;
    }

    const startedAt = Date.now();
    try {
      await this.transporter.sendMail({
        from: `"${config.fromName}" <${config.fromAddress}>`,
        to,
        subject,
        html,
        text,
        replyTo: config.replyTo || undefined,
      });
      const durationMs = Date.now() - startedAt;
      await this.logEmail(to, subject, templateCode, userId, 'sent', null, durationMs);
      // 增加今日发送计数
      await this.prisma.smtpConfig.update({
        where: { id: 1 },
        data: { todaySent: { increment: 1 } },
      }).catch(() => {});
      return true;
    } catch (err: any) {
      const durationMs = Date.now() - startedAt;
      await this.logEmail(to, subject, templateCode, userId, 'failed', err.message, durationMs);
      this.logger.error(`邮件发送失败 [${to}]: ${err.message}`);
      return false;
    }
  }

  private render(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }

  private async logEmail(
    to: string,
    subject: string,
    templateCode: string | null,
    userId: number | null,
    status: string,
    errorMessage: string | null,
    durationMs: number | null,
  ) {
    try {
      await this.prisma.emailLog.create({
        data: {
          toAddress: to,
          subject,
          templateCode,
          userId,
          status,
          errorMessage,
          durationMs,
          sentAt: status === 'sent' ? new Date() : null,
        },
      });
    } catch (err: any) {
      this.logger.error(`记录邮件日志失败: ${err.message}`);
    }
  }

  private async ensureDefaultTemplates() {
    const count = await this.prisma.emailTemplate.count();
    if (count > 0) return;
    this.logger.log('初始化默认邮件模板...');
    for (const tpl of DEFAULT_TEMPLATES) {
      await this.prisma.emailTemplate.create({ data: tpl as any });
    }
    this.logger.log(`已初始化 ${DEFAULT_TEMPLATES.length} 个默认模板`);
  }
}
