/**
 * 短信服务 — 阿里云号码认证服务（PNVS）短信认证
 * 文档：https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-dir-sms-authentication-service
 *
 * 核心 API：
 *   - SendSmsVerifyCode：发送验证码（阿里云生成验证码并管理生命周期）
 *   - CheckSmsVerifyCode：核验验证码（返回 VerifyResult = PASS/UNKNOWN）
 *
 * 优势：无需自行生成/存储/校验验证码，阿里云负责防盗刷、频控、生命周期。
 */
import * as crypto from 'crypto';
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import Dypnsapi, * as $Dypnsapi from '@alicloud/dypnsapi20170525';
import * as $OpenApi from '@alicloud/openapi-client';
import * as $Util from '@alicloud/tea-util';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { CryptoUtil } from '../../common/crypto.util';
import { parsePaging } from '../../common/api-response';
import { UpdateSmsConfigDto } from './dto';

const ALIYUN_ENDPOINT = 'dypnsapi.aliyuncs.com';

@Injectable()
export class SmsService {
  private readonly logger = new Logger('Sms');

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============ 配置管理 ============

  async getSmsConfig() {
    const config = await this.prisma.smsConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      // 默认值与阿里云 PNVS 官方推荐一致
      return {
        enabled: false,
        accessKeyId: '',
        hasAccessKeySecret: false,
        signName: '',
        templateCode: '100001',
        schemeName: '',
        codeLength: 4, // 官方默认 4 位
        codeType: 1, // 官方默认纯数字
        validTime: 300, // 官方默认 300 秒
        interval: 60, // 官方默认 60 秒
        duplicatePolicy: 1, // 官方默认覆盖
        dailyLimit: 1000,
        todaySent: 0,
        lastTestAt: null,
        lastTestResult: null,
      };
    }
    // 安全：accessKeyId 脱敏返回（前4位+****+后4位），避免明文泄露阿里云 AK
    const akid = config.accessKeyId || '';
    const maskedAkid = akid.length > 8
      ? akid.slice(0, 4) + '****' + akid.slice(-4)
      : (akid ? '****' : '');
    return {
      enabled: config.enabled,
      accessKeyId: maskedAkid,
      hasAccessKeySecret: !!config.accessKeySecretEnc,
      signName: config.signName,
      templateCode: config.templateCode,
      schemeName: config.schemeName || '',
      codeLength: config.codeLength,
      codeType: config.codeType,
      validTime: config.validTime,
      interval: config.interval,
      duplicatePolicy: config.duplicatePolicy,
      dailyLimit: config.dailyLimit,
      todaySent: config.todaySent,
      lastTestAt: config.lastTestAt,
      lastTestResult: config.lastTestResult,
    };
  }

  async updateSmsConfig(dto: UpdateSmsConfigDto, adminId?: number) {
    const existing = await this.prisma.smsConfig.findUnique({ where: { id: 1 } });
    const data: any = {
      updatedBy: adminId,
    };
    // 仅更新显式传入的字段
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    // accessKeyId：脱敏值（含 ****）或空值视为不修改，避免把脱敏回显值误存为真实值
    if (dto.accessKeyId !== undefined && dto.accessKeyId.trim() && !dto.accessKeyId.includes('****')) {
      data.accessKeyId = dto.accessKeyId.trim();
    }
    if (dto.signName !== undefined) data.signName = dto.signName;
    if (dto.templateCode !== undefined) data.templateCode = dto.templateCode;
    if (dto.schemeName !== undefined) data.schemeName = dto.schemeName || null;
    if (dto.codeLength !== undefined) data.codeLength = dto.codeLength;
    if (dto.codeType !== undefined) data.codeType = dto.codeType;
    if (dto.validTime !== undefined) data.validTime = dto.validTime;
    if (dto.interval !== undefined) data.interval = dto.interval;
    if (dto.duplicatePolicy !== undefined) data.duplicatePolicy = dto.duplicatePolicy;
    if (dto.dailyLimit !== undefined) data.dailyLimit = dto.dailyLimit;
    // Secret 单独处理（不传则保留）
    if (dto.accessKeySecret !== undefined && dto.accessKeySecret !== '') {
      data.accessKeySecretEnc = CryptoUtil.encrypt(dto.accessKeySecret);
    }
    if (existing) {
      await this.prisma.smsConfig.update({ where: { id: 1 }, data });
    } else {
      // 首次创建时填充官方推荐默认值
      await this.prisma.smsConfig.create({
        data: {
          id: 1,
          enabled: data.enabled ?? false,
          accessKeyId: data.accessKeyId ?? '',
          accessKeySecretEnc: data.accessKeySecretEnc ?? '',
          signName: data.signName ?? '',
          templateCode: data.templateCode ?? '100001',
          codeLength: data.codeLength ?? 4, // 官方默认 4 位
          codeType: data.codeType ?? 1,
          validTime: data.validTime ?? 300,
          interval: data.interval ?? 60,
          duplicatePolicy: data.duplicatePolicy ?? 1,
          dailyLimit: data.dailyLimit ?? 1000,
          updatedBy: adminId,
        },
      });
    }
    return { success: true };
  }

  // ============ 发送验证码 ============

  /**
   * 发送短信验证码（阿里云生成验证码，无需本地存储）
   * @param phone 手机号
   * @param scene 场景：register/reset_password/login/bind_phone/test
   * @param userId 关联用户 ID（可选）
   */
  async sendVerifyCode(
    phone: string,
    scene: string,
    userId?: number,
  ): Promise<{ success: boolean; message: string; bizId?: string }> {
    const config = await this.prisma.smsConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.enabled) {
      throw new BadRequestException('短信服务未启用，请联系管理员');
    }
    if (!config.accessKeyId || !config.accessKeySecretEnc) {
      throw new BadRequestException('短信服务未配置 AccessKey');
    }
    if (!config.signName || !config.templateCode) {
      throw new BadRequestException('短信服务未配置签名或模板');
    }

    // 本地频控：同一手机号在 interval 秒内只能发一次（与阿里云频控叠加）
    const rateKey = `sms:rate:${scene}:${phone}`;
    const allowed = await this.redis.rateLimit(rateKey, 1, Math.max(60, config.interval));
    if (!allowed) {
      throw new BadRequestException(`发送过于频繁，请 ${config.interval} 秒后重试`);
    }

    // 每日上限检查
    if (config.dailyLimit > 0 && config.todaySent >= config.dailyLimit) {
      throw new BadRequestException('今日短信发送量已达上限');
    }

    const client = this.createClient(config.accessKeyId, CryptoUtil.decrypt(config.accessKeySecretEnc));
    const outId = crypto.randomBytes(16).toString('hex'); // 外部流水号

    // 模板参数：使用 ##code## 占位符，由阿里云生成验证码
    // min 字段对应模板中的 ${min} 变量（有效期分钟数）
    const templateParam = JSON.stringify({
      code: '##code##',
      min: String(Math.ceil(config.validTime / 60)),
    });

    const req = new $Dypnsapi.SendSmsVerifyCodeRequest({
      phoneNumber: phone,
      signName: config.signName,
      templateCode: config.templateCode,
      templateParam,
      codeType: config.codeType,
      codeLength: config.codeLength,
      validTime: config.validTime,
      interval: config.interval,
      duplicatePolicy: config.duplicatePolicy,
      // schemeName: config.schemeName || undefined, // 不填则使用默认方案
      outId,
      returnVerifyCode: false, // 不返回验证码明文（安全考虑）
      autoRetry: 1, // 开启自动重试
    });

    const startedAt = Date.now();
    let status: 'sent' | 'failed' = 'failed';
    let errorCode: string | undefined;
    let errorMessage: string | undefined;
    let rawErrorMessage: string | undefined; // 原始错误（仅记录到日志）
    let bizId: string | undefined;

    try {
      const runtime = new $Util.RuntimeOptions({});
      const resp = await client.sendSmsVerifyCodeWithOptions(req, runtime);
      const body = resp?.body;
      if (body?.code === 'OK' && body.success === true) {
        status = 'sent';
        bizId = body.model?.bizId || undefined;
        // 增加今日计数
        await this.prisma.smsConfig
          .update({ where: { id: 1 }, data: { todaySent: { increment: 1 } } })
          .catch(() => {});
        this.logger.log(`短信发送成功 [${phone}] scene=${scene} bizId=${bizId}`);
      } else {
        errorCode = body?.code || 'UNKNOWN';
        errorMessage = body?.message || '阿里云返回失败';
        rawErrorMessage = errorMessage;
        this.logger.error(`短信发送失败 [${phone}]: ${errorCode} ${errorMessage}`);
      }
    } catch (err: any) {
      errorCode = err?.code || 'EXCEPTION';
      // 完整错误信息仅记录到服务端日志，对外返回脱敏消息
      errorMessage = this.safeErrorMessage(err);
      rawErrorMessage = err?.message;
      this.logger.error(`短信发送异常 [${phone}]: ${rawErrorMessage}`);
    }

    const durationMs = Date.now() - startedAt;
    await this.logSms({
      phoneNumber: phone,
      scene,
      bizId,
      outId,
      verifyCode: null,
      status,
      errorCode,
      errorMessage: rawErrorMessage || errorMessage, // 日志中保留原始错误
      durationMs,
      userId,
    });

    if (status === 'sent') {
      return { success: true, message: '验证码已发送', bizId };
    }
    // 对外只返回友好提示，不泄露阿里云内部 URL/请求参数
    return { success: false, message: errorMessage || '短信发送失败，请稍后重试', bizId };
  }

  /**
   * 将阿里云 SDK 异常转换为脱敏的用户友好消息
   * 避免泄露内部 API URL、AccessKey 等敏感信息
   */
  private safeErrorMessage(err: any): string {
    const msg: string = err?.message || '';
    const code: string = err?.code || '';
    // 网络类错误
    if (/Connect.*failed|timeout|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
      return '网络连接异常，请稍后重试';
    }
    // 阿里云业务错误码
    if (code === 'isv.BUSINESS_LIMIT_CONTROL' || /business.*limit/i.test(msg)) {
      return '短信发送频率受限，请稍后再试';
    }
    if (code === 'isv.MOBILE_NUMBER_ILLEGAL' || /mobile.*illegal/i.test(msg)) {
      return '手机号格式不正确';
    }
    if (code === 'isv.SMS_TEMPLATE_ILLEGAL' || /template.*illegal/i.test(msg)) {
      return '短信模板配置错误，请联系管理员';
    }
    if (code === 'isv.SMS_SIGNATURE_ILLEGAL' || /signature.*illegal/i.test(msg)) {
      return '短信签名配置错误，请联系管理员';
    }
    if (code === 'InvalidAccessKeyId.NotFound' || /AccessKey/i.test(msg)) {
      return '短信服务凭证配置错误，请联系管理员';
    }
    if (code === 'Forbidden.AccessKeyDisabled' || /AccessKey.*disabled/i.test(msg)) {
      return '短信服务凭证已禁用，请联系管理员';
    }
    // 兜底：返回通用提示，不泄露细节
    return '短信发送失败，请稍后重试';
  }

  // ============ 校验验证码 ============

  /**
   * 校验短信验证码
   * @returns true=通过 false=不通过
   */
  async checkVerifyCode(phone: string, code: string): Promise<boolean> {
    const config = await this.prisma.smsConfig.findUnique({ where: { id: 1 } });
    if (!config || !config.enabled) {
      throw new BadRequestException('短信服务未启用');
    }
    if (!config.accessKeyId || !config.accessKeySecretEnc) {
      throw new BadRequestException('短信服务未配置 AccessKey');
    }

    const client = this.createClient(config.accessKeyId, CryptoUtil.decrypt(config.accessKeySecretEnc));
    const req = new $Dypnsapi.CheckSmsVerifyCodeRequest({
      phoneNumber: phone,
      verifyCode: code,
      // schemeName: config.schemeName || undefined,
    });

    try {
      const runtime = new $Util.RuntimeOptions({});
      const resp = await client.checkSmsVerifyCodeWithOptions(req, runtime);
      const body = resp?.body;
      // 重要：接口请求成功（code=OK）不代表核验通过，必须看 model.verifyResult
      if (body?.code === 'OK' && body?.model?.verifyResult === 'PASS') {
        return true;
      }
      this.logger.warn(`验证码核验失败 [${phone}]: code=${body?.code} verifyResult=${body?.model?.verifyResult}`);
      return false;
    } catch (err: any) {
      this.logger.error(`验证码核验异常 [${phone}]: ${err?.message}`);
      return false;
    }
  }

  // ============ 测试发送 ============

  async testSend(phone: string, adminId?: number) {
    const result = await this.sendVerifyCode(phone, 'test', undefined);
    const success = result.success;
    const message = result.message;

    await this.prisma.smsConfig
      .update({
        where: { id: 1 },
        data: {
          lastTestAt: new Date(),
          lastTestResult: `${success ? '成功' : '失败'} ${message}`,
        },
      })
      .catch(() => {});

    return { success, message, bizId: result.bizId };
  }

  // ============ 日志查询 ============

  async listLogs(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.scene) where.scene = query.scene;
    if (query.phone) where.phoneNumber = { contains: String(query.phone) };
    if (query.userId) where.userId = Number(query.userId);

    const [list, total] = await Promise.all([
      this.prisma.smsLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.smsLog.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  // ============ 内部方法 ============

  private createClient(accessKeyId: string, accessKeySecret: string): Dypnsapi {
    const config = new $OpenApi.Config({
      accessKeyId,
      accessKeySecret,
    });
    config.endpoint = ALIYUN_ENDPOINT;
    // 透传系统代理配置（沙箱/CI 环境通过 HTTP 代理访问阿里云）
    // 阿里云 SDK 原生支持 httpsProxy / noProxy，仅在环境变量存在时启用
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
    const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
    if (httpsProxy) {
      (config as any).httpsProxy = httpsProxy;
      if (noProxy) (config as any).noProxy = noProxy;
    }
    return new Dypnsapi(config);
  }

  private async logSms(params: {
    phoneNumber: string;
    scene: string;
    bizId?: string | null;
    outId?: string | null;
    verifyCode?: string | null;
    status: 'sent' | 'failed';
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
    userId?: number;
  }) {
    try {
      // 截断 errorCode / errorMessage，避免存储过长内容（如阿里云 SDK 的完整 URL）
      const truncate = (s: string | null | undefined, max: number) =>
        s ? (s.length > max ? s.slice(0, max) : s) : null;
      await this.prisma.smsLog.create({
        data: {
          phoneNumber: params.phoneNumber,
          scene: params.scene,
          bizId: params.bizId || null,
          outId: params.outId || null,
          verifyCode: params.verifyCode || null,
          status: params.status,
          errorCode: truncate(params.errorCode, 64),
          errorMessage: truncate(params.errorMessage, 1000),
          durationMs: params.durationMs ?? null,
          userId: params.userId ?? null,
        },
      });
    } catch (err: any) {
      this.logger.error(`记录短信日志失败: ${err.message}`);
    }
  }
}
