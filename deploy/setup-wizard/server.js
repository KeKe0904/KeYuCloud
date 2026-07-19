/**
 * 雨云服务器分销平台 - 网页外部部署向导 (v1.1.0)
 * ----------------------------------------------------------------------------
 * 6 步向导：
 *   1. 环境检测      POST /api/wizard/check-env
 *   2. 雨云 API Key   POST /api/wizard/configure-api-key  (可跳过)
 *   3. 连接数据库    POST /api/wizard/test-db
 *   4. 数据库迁移    POST /api/wizard/migrate-db
 *   5. 域名配置      POST /api/wizard/configure-domain
 *   6. 配置管理员    POST /api/wizard/setup-admin
 *   7. 启动服务      POST /api/wizard/start-services
 *
 * 辅助：
 *   POST /api/wizard/verify-token       验证向导令牌
 *   GET  /api/wizard/status             读取 .deploy-meta.json 部署元信息
 *   GET  /api/wizard/services           查询前后端运行状态
 *
 * 安全：
 *   - 仅监听 127.0.0.1 + 部署元信息中的 host（默认 0.0.0.0）
 *   - 仅在部署后短期内可用，完成向导后自动停止
 *   - 不暴露任何敏感字段（数据库密码、JWT 密钥等只写不读）
 *   - 所有 POST /api/wizard/* 接口需携带 x-wizard-token 头部
 */
'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execFile, spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const PORT = parseInt(process.env.WIZARD_PORT || '8888', 10);
// 关键：默认监听 127.0.0.1（仅本地），通过 Nginx 反代 /setup-wizard/ 路径访问
// 这样无需开放 8888 端口到公网，更安全
// 如需直接公网访问（如 Nginx 未配置），设置 WIZARD_HOST=0.0.0.0
const HOST = process.env.WIZARD_HOST || '127.0.0.1';

// 部署元信息文件路径（由 deploy.sh 生成）
const META_FILE = path.join(__dirname, '..', '.deploy-meta.json');
// 应用根目录（默认 /opt/rainyun-reseller，可由 meta 覆盖）
const DEFAULT_APP_DIR = process.env.APP_DIR || '/opt/rainyun-reseller';

// 向导完成标记（启动服务后写入，标记向导可关闭）
const DONE_FILE = path.join(__dirname, '..', '.wizard-done');

// 内存中临时缓存数据库密码（仅在向导运行期间，进程退出即清除）
// 用户在步骤 2 输入，步骤 4 创建管理员时复用，避免再次输入
let cachedDbPassword = '';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ 工具函数 ============

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (_) {
    return {
      appDir: DEFAULT_APP_DIR,
      domain: '',
      sslMode: 'none',
      dbName: 'rainyun_reseller',
      dbUser: 'rainyun',
      dbHost: '127.0.0.1',
      dbPort: 3306,
      wizardPort: PORT,
      siteUrl: '',
    };
  }
}

function writeMeta(patch) {
  const cur = readMeta();
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(META_FILE, JSON.stringify(next, null, 2));
  return next;
}

function readEnvFile(appDir) {
  const envPath = path.join(appDir, 'server', '.env');
  const text = fs.readFileSync(envPath, 'utf8');
  const obj = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) obj[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return obj;
}

// 解析后端入口文件路径：兼容 nest build 的两种产物结构
//   - dist/main.js        (nest-cli.json 配置了 flat 结构)
//   - dist/src/main.js    (默认结构，src/ 被保留到 dist 下)
function getServerEntry(serverDir) {
  const candidates = [
    path.join(serverDir, 'dist', 'main.js'),
    path.join(serverDir, 'dist', 'src', 'main.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 检查后端是否已构建
function isServerBuilt(serverDir) {
  return getServerEntry(serverDir) !== null;
}

function writeEnvFile(appDir, kv) {
  const envPath = path.join(appDir, 'server', '.env');
  let text = '';
  try { text = fs.readFileSync(envPath, 'utf8'); } catch (_) { text = ''; }
  const lines = text.split('\n');
  const handled = new Set();
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/);
    if (m && Object.prototype.hasOwnProperty.call(kv, m[1])) {
      handled.add(m[1]);
      const v = kv[m[1]];
      return `${m[1]}=${v.includes(' ') || v.includes('"') ? `"${v.replace(/"/g, '\\"')}"` : v}`;
    }
    return line;
  });
  for (const k of Object.keys(kv)) {
    if (!handled.has(k)) {
      const v = kv[k];
      out.push(`${k}=${v.includes(' ') || v.includes('"') ? `"${v.replace(/"/g, '\\"')}"` : v}`);
    }
  }
  fs.writeFileSync(envPath, out.join('\n'));
}

function execCmd(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 60000, ...opts }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err ? (err.code || 1) : 0,
        stdout: (stdout || '').toString().trim(),
        stderr: (stderr || '').toString().trim(),
      });
    });
  });
}

function execFileCmd(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 60000, ...opts }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err ? (err.code || 1) : 0,
        stdout: (stdout || '').toString().trim(),
        stderr: (stderr || '').toString().trim(),
      });
    });
  });
}

// 解析版本号字符串为数字数组（用于比较）
function parseVersion(v) {
  if (!v) return [0];
  return String(v)
    .replace(/^v/i, '')
    .split(/[.\-]/)
    .map((x) => parseInt(x, 10) || 0);
}

function compareVersion(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  const len = Math.max(va.length, vb.length);
  for (let i = 0; i < len; i++) {
    const x = va[i] || 0;
    const y = vb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

// 包装响应：统一 { success, message, data }
function ok(res, data = {}, message = 'success') {
  res.json({ success: true, message, data });
}
function fail(res, message, code = 400, data = {}) {
  res.status(code).json({ success: false, message, data });
}

// ============ 中间件：仅在本机或部署期可访问 ============
app.use((req, res, next) => {
  // 完成标记存在时只允许 /api/wizard/status 与 /api/wizard/services
  if (fs.existsSync(DONE_FILE)) {
    if (req.path.startsWith('/api/wizard/status') || req.path.startsWith('/api/wizard/services')) {
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return fail(res, '向导已完成，如需重新配置请删除 .wizard-done 文件后重启向导服务', 403);
    }
  }
  next();
});

// ============ 中间件：向导令牌认证 ============
// 所有 POST /api/wizard/* 接口必须携带正确的 x-wizard-token 头部
// token 由 deploy.sh 启动向导时随机生成并写入 .deploy-meta.json
// 同时展示在部署脚本控制台，用户需手动输入到向导页面
const PUBLIC_GET_ROUTES = ['/api/wizard/status', '/api/wizard/services', '/health', '/api/wizard/verify-token'];
app.use((req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return next();
  }
  if (!req.path.startsWith('/api/wizard/')) {
    return next();
  }
  // /api/wizard/verify-token 用于初次验证，不需 token
  if (req.path === '/api/wizard/verify-token') {
    return next();
  }

  const meta = readMeta();
  const expectedToken = meta.wizardToken || '';
  if (!expectedToken) {
    // 未配置 token（旧版本兼容），允许通过但记录警告
    console.warn('[wizard] 警告：未配置 wizardToken，向导接口未受保护');
    return next();
  }

  const provided = req.headers['x-wizard-token'] || '';
  if (!provided || provided !== expectedToken) {
    return fail(res, '向导令牌无效或缺失，请输入部署脚本显示的向导令牌', 401);
  }
  next();
});

// ============ 路由：验证向导令牌 ============
app.post('/api/wizard/verify-token', (req, res) => {
  const meta = readMeta();
  const expectedToken = meta.wizardToken || '';
  const provided = req.body.token || '';
  if (!expectedToken) {
    return ok(res, { valid: true }, '未配置 token，直接放行');
  }
  if (provided && provided === expectedToken) {
    return ok(res, { valid: true }, '令牌验证成功');
  }
  return fail(res, '令牌错误', 401);
});

// ============ 路由：状态 ============
app.get('/api/wizard/status', (req, res) => {
  const meta = readMeta();
  const done = fs.existsSync(DONE_FILE);
  ok(res, {
    meta: {
      appDir: meta.appDir,
      domain: meta.domain || '',
      sslMode: meta.sslMode || 'none',
      dbName: meta.dbName,
      dbUser: meta.dbUser,
      dbHost: meta.dbHost,
      dbPort: meta.dbPort,
      siteUrl: meta.siteUrl || '',
      wizardPort: meta.wizardPort || PORT,
      deployedAt: meta.deployedAt || '',
    },
    done,
    wizardVersion: '1.1.0',
  });
});

// ============ 路由：环境检测 ============
app.post('/api/wizard/check-env', async (req, res) => {
  const meta = readMeta();
  const appDir = meta.appDir || DEFAULT_APP_DIR;

  // 并发检测各项
  const [nodeRes, npmRes, pm2Res, mysqlRes, redisRes, nginxRes, gitRes] = await Promise.all([
    execCmd('node -v'),
    execCmd('npm -v'),
    execCmd('pm2 -v 2>/dev/null || echo NOT_FOUND'),
    execCmd('mysql --version 2>/dev/null || echo NOT_FOUND'),
    execCmd('redis-cli --version 2>/dev/null || echo NOT_FOUND'),
    execCmd('command -v nginx >/dev/null 2>&1 && nginx -v 2>&1 | head -1 || echo NOT_FOUND'),
    execCmd('git --version'),
  ]);

  const nodeV = nodeRes.ok ? nodeRes.stdout.replace(/^v/, '') : '';
  const npmV = npmRes.ok ? npmRes.stdout : '';
  const pm2V = pm2Res.ok && !pm2Res.stdout.includes('NOT_FOUND') ? pm2Res.stdout : '';
  const mysqlV = mysqlRes.ok && !mysqlRes.stdout.includes('NOT_FOUND') ? mysqlRes.stdout : '';
  const redisV = redisRes.ok && !redisRes.stdout.includes('NOT_FOUND') ? redisRes.stdout : '';
  const nginxV = nginxRes.ok && !nginxRes.stdout.includes('NOT_FOUND') && !nginxRes.stdout.includes('not found') ? nginxRes.stdout : '';
  const gitV = gitRes.ok ? gitRes.stdout : '';

  // 版本检查
  const nodeOk = nodeV && compareVersion(nodeV, '18.0.0') >= 0;
  const nodeLts = nodeV && compareVersion(nodeV, '22.0.0') >= 0; // 推荐 22 LTS

  // 检查应用目录是否存在
  const serverDir = path.join(appDir, 'server');
  const webDir = path.join(appDir, 'web');
  const serverExists = fs.existsSync(serverDir);
  const webExists = fs.existsSync(webDir);
  const envExists = fs.existsSync(path.join(serverDir, '.env'));
  const distExists = fs.existsSync(path.join(webDir, 'dist', 'index.html'));
  const serverEntry = getServerEntry(serverDir);
  const serverDistExists = !!serverEntry;

  const checks = {
    node: { installed: !!nodeV, version: nodeV, ok: nodeOk, recommended: '22.x LTS', lts: nodeLts },
    npm: { installed: !!npmV, version: npmV, ok: !!npmV },
    pm2: { installed: !!pm2V, version: pm2V, ok: !!pm2V },
    mysql: { installed: !!mysqlV, version: mysqlV, ok: !!mysqlV },
    redis: { installed: !!redisV, version: redisV, ok: !!redisV },
    nginx: { installed: !!nginxV, version: nginxV, ok: !!nginxV },
    git: { installed: !!gitV, version: gitV, ok: !!gitV },
    appDir: { exists: serverExists && webExists, path: appDir, ok: serverExists && webExists },
    envFile: { exists: envExists, ok: envExists },
    webBuild: { exists: distExists, ok: distExists },
    serverBuild: { exists: serverDistExists, ok: serverDistExists },
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  const missing = Object.entries(checks).filter(([_, v]) => !v.ok).map(([k]) => k);

  ok(res, {
    checks,
    allOk,
    missing,
    appDir,
  }, allOk ? '环境检测通过' : `环境检测未通过：缺少 ${missing.join(', ')}`);
});

// ============ 路由：测试数据库连接 ============
app.post('/api/wizard/test-db', async (req, res) => {
  const meta = readMeta();
  const appDir = meta.appDir || DEFAULT_APP_DIR;

  // 允许 body 覆盖（便于二次填写）
  const host = req.body.host || meta.dbHost || '127.0.0.1';
  const port = parseInt(req.body.port || meta.dbPort || '3306', 10);
  const user = req.body.user || meta.dbUser || 'rainyun';
  const password = req.body.password || '';
  const database = req.body.database || meta.dbName || 'rainyun_reseller';

  if (!password) {
    return fail(res, '请输入数据库密码', 400);
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 8000,
    });
    const [rows] = await conn.execute('SELECT VERSION() AS v, NOW() AS now');
    const version = rows[0] && rows[0].v;
    // 检查业务库是否存在（严禁自动创建，必须由 deploy.sh 一键脚本通过 SSH 创建）
    const [dbs] = await conn.execute(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [database],
    );
    const dbExists = dbs.length > 0;

    if (!dbExists) {
      // 数据库不存在：直接报错，提示用户回 SSH 用一键脚本创建
      return fail(res, `数据库 "${database}" 不存在。数据库必须由 deploy.sh 一键部署脚本通过 SSH 创建（脚本使用本机 root 权限自动建库+授权），网页向导无 root 权限，不允许自动创建。请登录服务器执行部署脚本后再来此页面继续配置。`, 400, {
        hint: '若已执行过部署脚本仍报错，请检查数据库名拼写或主机/端口是否正确',
        dbExists: false,
      });
    }

    // 测试业务库可访问
    let businessOk = false;
    try {
      await conn.changeUser({ database });
      businessOk = true;
    } catch (_) {
      businessOk = false;
    }

    if (!businessOk) {
      return fail(res, `用户 "${user}" 无权访问数据库 "${database}"，请通过 deploy.sh 重新执行数据库配置步骤以正确授权`, 400, {
        hint: '可通过 SSH 登录后执行 sudo mysql -uroot 重新授权',
      });
    }

    // 缓存数据库密码到内存，供 setup-admin 复用（不写文件）
    cachedDbPassword = password;

    ok(res, {
      connected: true,
      host,
      port,
      user,
      database,
      version,
      dbExists: true,
      dbCreated: false,
      businessOk: true,
    }, '数据库连接成功');
  } catch (e) {
    const msg = String(e && e.message || e);
    let friendly = '数据库连接失败';
    if (/ECONNREFUSED/.test(msg)) friendly = `无法连接到 ${host}:${port}，请确认 MySQL 已启动并监听该端口`;
    else if (/ENOTFOUND/.test(msg)) friendly = `主机 ${host} 无法解析`;
    else if (/access denied/i.test(msg)) friendly = '用户名或密码错误';
    else if (/Unknown database/i.test(msg)) friendly = `数据库 ${database} 不存在，请通过 SSH 执行一键部署脚本创建`;
    return fail(res, friendly, 400, { detail: msg });
  } finally {
    if (conn) {
      try { await conn.end(); } catch (_) {}
    }
  }
});

// ============ 路由：配置雨云 API Key（可跳过） ============
// 用户可在此步骤配置雨云上游 API Key，也可选择跳过（默认 MOCK 模式）
// 配置后写入 .env，重启后端服务后生效
app.post('/api/wizard/configure-api-key', async (req, res) => {
  const meta = readMeta();
  const appDir = meta.appDir || DEFAULT_APP_DIR;
  const serverDir = path.join(appDir, 'server');

  if (!fs.existsSync(serverDir)) {
    return fail(res, `服务器目录不存在: ${serverDir}`, 400);
  }

  const envPath = path.join(serverDir, '.env');
  if (!fs.existsSync(envPath)) {
    return fail(res, '.env 文件不存在，请先完成数据库配置', 400);
  }

  const apiKey = (req.body.apiKey || '').trim();
  const apiBase = (req.body.apiBase || 'https://api.v2.rainyun.com').trim();
  const skip = !!req.body.skip;

  if (skip) {
    // 用户选择跳过，保持 MOCK 模式
    try {
      writeEnvFile(appDir, {
        RAINYUN_API_KEY: '',
        RAINYUN_API_BASE: apiBase,
        RAINYUN_MOCK: 'true',
      });
    } catch (e) {
      return fail(res, `写入 .env 失败: ${e.message}`, 500);
    }
    return ok(res, { skipped: true, mode: 'MOCK' }, '已跳过 API Key 配置，使用 MOCK 模式（稍后可在管理后台配置）');
  }

  if (!apiKey) {
    return fail(res, '请输入 API Key 或选择跳过', 400);
  }
  if (apiKey.length < 16 || apiKey.length > 256) {
    return fail(res, 'API Key 长度异常（应为 16-256 个字符）', 400);
  }

  try {
    writeEnvFile(appDir, {
      RAINYUN_API_KEY: apiKey,
      RAINYUN_API_BASE: apiBase,
      RAINYUN_MOCK: 'false',
    });
  } catch (e) {
    return fail(res, `写入 .env 失败: ${e.message}`, 500);
  }

  // 写入部署元信息
  writeMeta({ rainyunApiKeyConfigured: true, rainyunApiBase: apiBase });

  ok(res, {
    configured: true,
    mode: 'LIVE',
    apiBase,
    apiKeyMasked: apiKey.slice(0, 8) + '****' + apiKey.slice(-4),
  }, '雨云 API Key 已配置，将在服务启动后生效');
});

// ============ 路由：执行数据库迁移 + Seed ============
app.post('/api/wizard/migrate-db', async (req, res) => {
  const meta = readMeta();
  const appDir = meta.appDir || DEFAULT_APP_DIR;
  const serverDir = path.join(appDir, 'server');

  if (!fs.existsSync(serverDir)) {
    return fail(res, `服务器目录不存在: ${serverDir}`, 400);
  }

  // 检查 .env 是否包含有效 DATABASE_URL
  const envPath = path.join(serverDir, '.env');
  if (!fs.existsSync(envPath)) {
    return fail(res, '.env 文件不存在，请先测试数据库连接', 400);
  }

  // 串行执行：prisma generate → prisma migrate deploy → prisma db seed
  const migrateRes = await execCmd(
    `cd "${serverDir}" && npx prisma generate && npx prisma migrate deploy && npx prisma db seed`,
    { timeout: 180000 },
  );

  if (!migrateRes.ok) {
    return fail(res, '数据库迁移失败', 500, {
      stdout: migrateRes.stdout.slice(-2000),
      stderr: migrateRes.stderr.slice(-2000),
    });
  }

  ok(res, {
    stdout: migrateRes.stdout.slice(-2000),
  }, '数据库迁移完成');
});

// ============ 路由：域名配置（二次） ============
app.post('/api/wizard/configure-domain', async (req, res) => {
  const meta = readMeta();
  const appDir = meta.appDir || DEFAULT_APP_DIR;

  const domain = (req.body.domain || '').trim();
  const sslMode = req.body.sslMode || 'none'; // none / existing / letsencrypt
  const sslCert = req.body.sslCert || '';
  const sslKey = req.body.sslKey || '';
  const skipCheck = !!req.body.skipCheck;

  if (!domain) {
    return fail(res, '请输入域名', 400);
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(domain) || domain.length > 253) {
    return fail(res, '域名格式不正确', 400);
  }

  // 检测域名是否解析到本机
  if (!skipCheck) {
    const localIps = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const it of ifaces[name]) {
        if (it.family === 'IPv4' && !it.internal) localIps.push(it.address);
      }
    }
    localIps.push('127.0.0.1');

    const dnsRes = await execCmd(`getent hosts "${domain}" || nslookup "${domain}" 2>/dev/null | grep -A1 -i name | tail -1`);
    const resolvedIp = (dnsRes.stdout || '').split(/\s+/).find((t) => /^\d+\.\d+\.\d+\.\d+$/.test(t)) || '';

    if (!resolvedIp) {
      return fail(res, `无法解析域名 ${domain}，请检查 DNS 是否已生效`, 400, { hint: '可勾选"跳过检测"强制保存' });
    }
    if (!localIps.includes(resolvedIp)) {
      return fail(res, `域名 ${domain} 解析到 ${resolvedIp}，但本机 IP 为 ${localIps.join('/')}`, 400, { hint: '可勾选"跳过检测"强制保存' });
    }
  }

  // 更新 .env（保留原 EPAY 路径，只替换 scheme + host）
  try {
    const scheme = sslMode === 'none' ? 'http' : 'https';
    const siteUrl = `${scheme}://${domain}`;
    const env = readEnvFile(appDir);
    const updates = { SITE_URL: siteUrl };
    // 保留原 EPAY 路径，只替换 scheme + host
    if (env.EPAY_NOTIFY_URL) {
      updates.EPAY_NOTIFY_URL = env.EPAY_NOTIFY_URL.replace(/^https?:\/\/[^/]+/, siteUrl);
    }
    if (env.EPAY_RETURN_URL) {
      updates.EPAY_RETURN_URL = env.EPAY_RETURN_URL.replace(/^https?:\/\/[^/]+/, siteUrl);
    }
    writeEnvFile(appDir, updates);
  } catch (e) {
    return fail(res, `更新 .env 失败: ${e.message}`, 500);
  }

  // 更新 Nginx 配置（若已安装）
  const nginxRes = await execCmd('command -v nginx');
  if (nginxRes.ok) {
    const nginxConf = '/etc/nginx/conf.d/rainyun-reseller.conf';
    const confBody = `# 由 setup-wizard 生成 - ${new Date().toISOString()}
server {
    listen 80;
    server_name ${domain};
    root ${appDir}/web/dist;
    index index.html;
    client_max_body_size 10m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
`;
    try {
      fs.writeFileSync(nginxConf, confBody);
      await execCmd('nginx -t && systemctl reload nginx || nginx -s reload');
    } catch (e) {
      // nginx 失败不致命
    }
  }

  // 更新 meta
  const newMeta = writeMeta({
    domain,
    sslMode,
    sslCert,
    sslKey,
    siteUrl: `${sslMode === 'none' ? 'http' : 'https'}://${domain}`,
  });

  ok(res, {
    domain,
    sslMode,
    siteUrl: newMeta.siteUrl,
    nginxUpdated: nginxRes.ok,
  }, '域名配置已保存');
});

// ============ 路由：配置超级管理员 ============
app.post('/api/wizard/setup-admin', async (req, res) => {
  const meta = readMeta();
  const appDir = meta.appDir || DEFAULT_APP_DIR;
  const serverDir = path.join(appDir, 'server');

  const username = (req.body.username || 'admin').trim();
  const password = req.body.password || '';
  const email = (req.body.email || '').trim();
  const nickname = (req.body.nickname || '超级管理员').trim();

  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    return fail(res, '用户名只能包含字母、数字、下划线、横线，长度 3-32', 400);
  }
  if (password.length < 8) {
    return fail(res, '密码长度至少 8 位', 400);
  }
  if (password.length > 64) {
    return fail(res, '密码长度不能超过 64 位', 400);
  }
  if (!/^[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    return fail(res, '密码必须以字母开头，且包含数字和特殊字符', 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) {
    return fail(res, '邮箱格式不正确', 400);
  }

  // 读取数据库连接信息
  let env;
  try {
    env = readEnvFile(appDir);
  } catch (e) {
    return fail(res, `读取 .env 失败: ${e.message}`, 500);
  }

  // 优先使用 body 中传入的数据库密码，其次使用内存缓存（步骤 2 输入过），最后从 DATABASE_URL 解析
  let dbHost, dbPort, dbUser, dbPass, dbName;
  const dbUrl = env.DATABASE_URL || '';
  try {
    // 使用 URL 类解析，能正确处理 URL 编码的密码
    const u = new URL(dbUrl);
    dbUser = decodeURIComponent(u.username);
    dbPass = req.body.dbPassword || cachedDbPassword || decodeURIComponent(u.password);
    dbHost = u.hostname;
    dbPort = parseInt(u.port, 10) || 3306;
    dbName = u.pathname.replace(/^\//, '');
  } catch (e) {
    return fail(res, 'DATABASE_URL 格式不正确，请先测试数据库连接', 400, { detail: e.message });
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPass,
      database: dbName,
      connectTimeout: 8000,
    });

    // 检查是否已有管理员
    const [existing] = await conn.execute('SELECT id, username FROM Admin LIMIT 1');
    const hasAdmin = existing.length > 0;

    // 检查同名管理员
    const [sameName] = await conn.execute('SELECT id FROM Admin WHERE username = ?', [username]);
    const sameExists = sameName.length > 0;

    if (hasAdmin && sameExists) {
      // 更新已有管理员
      const hash = await bcrypt.hash(password, 12);
      await conn.execute(
        'UPDATE Admin SET passwordHash = ?, email = ?, nickname = ?, role = ?, status = ?, updatedAt = NOW() WHERE username = ?',
        [hash, email || null, nickname, 'SUPER_ADMIN', 'ACTIVE', username],
      );
      return ok(res, { username, action: 'updated' }, '管理员密码已更新');
    }

    // 创建新管理员
    const hash = await bcrypt.hash(password, 12);
    await conn.execute(
      `INSERT INTO Admin (username, passwordHash, nickname, role, status, email, createdAt, updatedAt)
       VALUES (?, ?, ?, 'SUPER_ADMIN', 'ACTIVE', ?, NOW(), NOW())`,
      [username, hash, nickname, email || null],
    );

    ok(res, { username, action: 'created', isFirst: !hasAdmin }, '超级管理员创建成功');
  } catch (e) {
    const msg = String(e && e.message || e);
    let friendly = '管理员创建失败';
    if (/ER_DUP_ENTRY/i.test(msg) && /username/i.test(msg)) friendly = '用户名已存在';
    else if (/ER_DUP_ENTRY/i.test(msg) && /email/i.test(msg)) friendly = '邮箱已被使用';
    else if (/ER_NO_SUCH_TABLE/i.test(msg)) friendly = '管理员表不存在，请先执行数据库迁移';
    return fail(res, friendly, 400, { detail: msg });
  } finally {
    if (conn) {
      try { await conn.end(); } catch (_) {}
    }
  }
});

// ============ 路由：启动前后端服务 ============
app.post('/api/wizard/start-services', async (req, res) => {
  const meta = readMeta();
  const appDir = meta.appDir || DEFAULT_APP_DIR;
  const serverDir = path.join(appDir, 'server');

  if (!fs.existsSync(serverDir)) {
    return fail(res, `服务器目录不存在: ${serverDir}`, 400);
  }
  if (!fs.existsSync(path.join(serverDir, 'dist', 'main.js')) &&
      !fs.existsSync(path.join(serverDir, 'dist', 'src', 'main.js'))) {
    return fail(res, '后端尚未构建，请先执行部署脚本的构建步骤', 400);
  }
  const serverEntry = getServerEntry(serverDir);
  if (!fs.existsSync(path.join(appDir, 'web', 'dist', 'index.html'))) {
    return fail(res, '前端尚未构建，请先执行部署脚本的构建步骤', 400);
  }

  // PM2 启动后端
  const pm2Check = await execCmd('command -v pm2');
  if (!pm2Check.ok) {
    return fail(res, 'PM2 未安装', 500);
  }

  // 删除旧的（若有）
  await execCmd(`pm2 delete rainyun-api 2>/dev/null || true`);

  // 启动后端
  const startRes = await execCmd(
    `pm2 start "${serverEntry}" --name rainyun-api --cwd "${serverDir}"`,
  );
  if (!startRes.ok) {
    return fail(res, '启动后端失败', 500, { stdout: startRes.stdout, stderr: startRes.stderr });
  }

  // 保存 PM2 列表
  await execCmd('pm2 save 2>/dev/null || true');

  // 等待 3 秒让后端启动
  await new Promise((r) => setTimeout(r, 3000));

  // 健康检查（端点为 /api/health，后端端口 3001）
  const healthRes = await execCmd('curl -sS --max-time 5 http://127.0.0.1:3001/api/health || echo HEALTH_FAIL');
  const healthy = healthRes.ok && !healthRes.stdout.includes('HEALTH_FAIL') && healthRes.stdout.includes('"status":"ok"');

  // 标记向导完成
  fs.writeFileSync(DONE_FILE, JSON.stringify({
    completedAt: new Date().toISOString(),
    siteUrl: meta.siteUrl || '',
    domain: meta.domain || '',
  }, null, 2));

  ok(res, {
    backendStarted: true,
    backendHealthy: healthy,
    healthOutput: healthRes.stdout.slice(0, 500),
    pm2Saved: true,
    siteUrl: meta.siteUrl || `http://localhost`,
    wizardDone: true,
    wizardStopping: true,
  }, healthy ? '前后端启动成功，向导服务即将自动关闭' : '后端已启动但健康检查未通过，请查看 PM2 日志；向导服务即将自动关闭');

  // 响应已发送给客户端，3 秒后异步关闭向导进程（避免响应中断）
  // 通过 PM2 删除自身进程，达到彻底关闭向导服务的目的
  setTimeout(() => {
    console.log('[setup-wizard] 向导已完成，3 秒后自动关闭向导服务...');
    execCmd('pm2 delete rainyun-wizard 2>/dev/null || true')
      .then(() => {
        console.log('[setup-wizard] 向导服务已关闭');
        // 兜底：直接退出进程
        setTimeout(() => process.exit(0), 500);
      })
      .catch(() => {
        // PM2 删除失败时直接退出
        process.exit(0);
      });
  }, 3000);
});

// ============ 路由：服务状态查询 ============
app.get('/api/wizard/services', async (req, res) => {
  const pm2Res = await execCmd('pm2 jlist 2>/dev/null || echo "[]"');
  let list = [];
  try {
    list = JSON.parse(pm2Res.stdout || '[]');
  } catch (_) {
    list = [];
  }
  const apiProc = list.find((p) => p.name === 'rainyun-api');
  const wizardProc = list.find((p) => p.name === 'rainyun-wizard');

  // 后端健康检查（端点为 /api/health，端口 3001）
  const healthRes = await execCmd('curl -sS --max-time 3 http://127.0.0.1:3001/api/health || echo FAIL');
  const apiHealthy = healthRes.ok && !healthRes.stdout.includes('FAIL') && healthRes.stdout.includes('"status":"ok"');

  ok(res, {
    api: apiProc ? {
      pid: apiProc.pid,
      status: apiProc.pm2_env ? apiProc.pm2_env.status : 'unknown',
      uptime: apiProc.pm2_env ? apiProc.pm2_env.pm_uptime : 0,
      restarts: apiProc.pm2_env ? apiProc.pm2_env.restart_time : 0,
      healthy: apiHealthy,
    } : null,
    wizard: wizardProc ? {
      pid: wizardProc.pid,
      status: wizardProc.pm2_env ? wizardProc.pm2_env.status : 'unknown',
      uptime: wizardProc.pm2_env ? wizardProc.pm2_env.pm_uptime : 0,
    } : null,
  });
});

// ============ 健康检查端点 ============
app.get('/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ============ 错误处理 ============
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('[wizard error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: err.message || '内部错误' });
});

// ============ 启动 ============
app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[setup-wizard] listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[setup-wizard] app dir: ${readMeta().appDir || DEFAULT_APP_DIR}`);
});

// 优雅退出
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
