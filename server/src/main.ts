import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import * as cookieParserLib from 'cookie-parser';
const cookieParser = (cookieParserLib as any).default || cookieParserLib;
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// 注入系统 HTTPS 代理：阿里云 SDK 内部使用 httpx 库，httpx 在模块加载时就创建了独立的
// https.Agent，不走 https.globalAgent 也不读 HTTPS_PROXY 环境变量。
// 这里通过 monkey-patch https.Agent.prototype.addRequest，让所有 https.Agent 实例
// 在发起请求时，若目标主机不在 NO_PROXY 列表，则改走 HttpsProxyAgent。
const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const noProxyList = (process.env.NO_PROXY || process.env.no_proxy || '')
  .toLowerCase()
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (httpsProxy) {
  const proxyAgent = new HttpsProxyAgent(httpsProxy);
  const isLocalHost = (host: string): boolean => {
    const h = (host || '').toLowerCase();
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      noProxyList.some((p) => h === p || h.endsWith(p))
    );
  };
  const origAddRequest = (https.Agent.prototype as any).addRequest;
  (https.Agent.prototype as any).addRequest = function (req: any, options: any) {
    if (!isLocalHost(options.host || options.hostname || '')) {
      // 走代理：把代理 agent 的 addRequest 借过来用
      return (proxyAgent as any).addRequest.call(proxyAgent, req, options);
    }
    return origAddRequest.call(this, req, options);
  };
  // eslint-disable-next-line no-console
  console.log(`[Bootstrap] HTTPS 代理已注入: ${httpsProxy} (NO_PROXY: ${noProxyList.join(',') || '无'})`);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(ConfigService);

  // helmet：设置安全相关 HTTP 头（X-Content-Type-Options、X-Frame-Options、CSP、HSTS 等）
  app.use(
    helmet({
      // 允许跨域加载图片（用户头像、logo 等）
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // 内容安全策略：允许同源 + 内联样式（Element Plus 等 UI 库依赖）
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'http:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // 禁止点击劫持
      frameguard: { action: 'deny' },
      // 禁止 MIME 嗅探
      noSniff: true,
      // HSTS 仅在生产启用（开发期通常 http）
      hsts: config.get('NODE_ENV') === 'production',
    }),
  );

  // CORS：限制为环境变量 CORS_ORIGIN 指定的来源，避免 origin: '*'
  app.enableCors({
    origin: config.get('CORS_ORIGIN', 'http://localhost:5173').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token'],
  });

  // 全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // 全局异常过滤器
  app.useGlobalFilters(new HttpExceptionFilter());

  // 全局日志拦截器
  app.useGlobalInterceptors(new LoggingInterceptor());

  // cookie
  app.use(cookieParser());

  // 静态文件（上传的 logo 等）
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const port = config.get<number>('PORT', 3001);
  const logger = new Logger('Bootstrap');

  // ===== 生产环境启动安全校验 =====
  // 开源场景下，所有密钥必须强随机，禁止使用占位符/弱密钥
  if (config.get('NODE_ENV') === 'production') {
    const weakSecrets: string[] = [];
    const fatalSecrets: string[] = [];
    const jwtSecret = config.get('JWT_SECRET') || '';
    const adminJwtSecret = config.get('ADMIN_JWT_SECRET') || '';
    const aesSecret = config.get('AES_SECRET') || '';
    const initAdminPwd = config.get('INIT_ADMIN_PASSWORD') || '';
    const rainyunMock = config.get('RAINYUN_MOCK') === 'true';
    const rainyunApiKey = config.get('RAINYUN_API_KEY') || '';

    // 弱密钥检测正则（占位符/默认值）
    const weakPatterns = /change|dev|placeholder|please-change|123|secret/i;

    // 1. JWT_SECRET 强度校验（≥32 字节，且非占位符）
    if (weakPatterns.test(jwtSecret)) {
      fatalSecrets.push('JWT_SECRET（疑似占位符/弱密钥）');
    } else if (jwtSecret.length < 32) {
      fatalSecrets.push(`JWT_SECRET（长度 ${jwtSecret.length}，要求 ≥ 32 字节）`);
    }

    // 2. ADMIN_JWT_SECRET 强度校验（≥32 字节，且非占位符）
    if (weakPatterns.test(adminJwtSecret)) {
      fatalSecrets.push('ADMIN_JWT_SECRET（疑似占位符/弱密钥）');
    } else if (adminJwtSecret.length < 32) {
      fatalSecrets.push(`ADMIN_JWT_SECRET（长度 ${adminJwtSecret.length}，要求 ≥ 32 字节）`);
    }

    // 3. AES_SECRET 严格校验（必须 32 字节，非占位符）
    if (weakPatterns.test(aesSecret)) {
      fatalSecrets.push('AES_SECRET（疑似占位符/弱密钥）');
    } else if (aesSecret.length !== 32) {
      fatalSecrets.push(`AES_SECRET（长度 ${aesSecret.length}，要求恰好 32 字节，请用 openssl rand -hex 16 生成）`);
    }

    // 4. INIT_ADMIN_PASSWORD 强度校验（≥ 8 位，非 admin123）
    if (weakPatterns.test(initAdminPwd) || initAdminPwd === 'admin123' || initAdminPwd.length < 8) {
      weakSecrets.push(`INIT_ADMIN_PASSWORD（长度 ${initAdminPwd.length}，建议 ≥ 12 位强密码）`);
    }

    // 5. RAINYUN_MOCK 警告：生产环境禁止 mock 模式（除非显式声明仅测试）
    if (rainyunMock && !rainyunApiKey) {
      weakSecrets.push('RAINYUN_MOCK=true 且未配置 RAINYUN_API_KEY（生产环境应配置真实 API Key）');
    }

    // 致命错误：拒绝启动
    if (fatalSecrets.length) {
      logger.error('═══════════════════════════════════════════════════════════');
      logger.error('⚠️  生产环境密钥校验未通过，服务拒绝启动：');
      for (const s of fatalSecrets) logger.error(`   ❌ ${s}`);
      logger.error('');
      logger.error('请通过以下方式修复：');
      logger.error('  1. 生成强随机密钥：openssl rand -hex 32  (JWT) / openssl rand -hex 16  (AES)');
      logger.error('  2. 写入 server/.env 文件，替换所有 change-me 占位符');
      logger.error('  3. 重新执行 deploy.sh 一键部署脚本会自动生成强随机密钥');
      logger.error('═══════════════════════════════════════════════════════════');
      process.exit(1);
    }

    // 警告项：允许启动但提示
    if (weakSecrets.length) {
      logger.warn('⚠️  生产环境检测到以下弱配置，建议尽快修复：');
      for (const s of weakSecrets) logger.warn(`   ⚠️  ${s}`);
    }
  }

  await app.listen(port);

  const mockMode = config.get('RAINYUN_MOCK') === 'true' || !config.get('RAINYUN_API_KEY');
  logger.log(`🚀 服务已启动: http://localhost:${port}`);
  logger.log(`📊 雨云上游模式: ${mockMode ? '🟡 MOCK（本地模拟）' : '🟢 真实 API'}`);
  logger.log(`🌐 CORS 允许来源: ${config.get('CORS_ORIGIN')}`);
  logger.log(`🔒 helmet HTTP 安全头已启用`);
  logger.log(`📋 API 文档: http://localhost:${port}/api/health`);
}
bootstrap();
