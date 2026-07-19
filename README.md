# KeYuCloud

> 基于雨云上游资源的云服务器二次售卖/分销平台。
>
> 前后端分离 + 一键部署 + 网页向导，开箱即用。

---

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [一键部署](#一键部署)
- [网页部署向导](#网页部署向导)
- [手动部署](#手动部署)
- [开发指南](#开发指南)
- [配置项说明](#配置项说明)
- [端口策略](#端口策略)
- [安全设计](#安全设计)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 项目简介

KeYuCloud 对接雨云上游 API，提供完整的云服务器分销能力：

- **前台门户**：商品浏览、区域筛选、在线下单、订单支付、工单支持
- **用户后台**：订单/产品管理、续费升级、工单、财务流水、通知中心
- **管理后台**：商品/订单/用户/工单/财务管理、SMTP/SMS 配置、审计日志

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | NestJS 10 · Prisma 5 · MySQL 8 · Redis 6 · Passport JWT · BullMQ |
| 前端 | Vue 3.5 · Vite 6 · Element Plus · Pinia · ECharts · SCSS |
| 部署 | Bash · PM2 · Nginx · Let's Encrypt |
| 向导 | Express · 原生 HTML/JS |

---

## 项目结构

```
KeYuCloud/
├── server/                      # 后端 NestJS
│   ├── src/
│   │   ├── common/              # 守卫、过滤器、拦截器、工具
│   │   ├── modules/             # auth / admin / product / order / payment
│   │   │                        # user-product / ticket / finance / mailer
│   │   │                        # notification / rainyun / sms / public
│   │   ├── app.module.ts
│   │   └── main.ts              # 入口（含生产环境密钥校验）
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   └── .env.example
├── web/                         # 前端 Vue 3
│   ├── src/
│   │   ├── api/                 # API 调用封装
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── views/
│   │   │   ├── portal/          # 前台门户
│   │   │   ├── dashboard/       # 用户后台
│   │   │   └── admin/           # 管理后台
│   │   ├── router/
│   │   └── stores/
│   └── vite.config.ts
├── deploy/
│   ├── deploy.sh                # 一键部署脚本
│   └── setup-wizard/            # 网页部署向导
│       ├── server.js
│       └── public/index.html
└── README.md
```

---

## 一键部署

适用于空白服务器到上线的全流程自动化。

### 支持系统

Ubuntu 20.04+ · Debian 11+ · CentOS 8+ / Rocky Linux / AlmaLinux · RHEL 9+

### 前置要求

- 一台 root 或 sudo 权限的服务器
- 已解析到该服务器的域名（可选，无域名可用 IP）
- 雨云 API Key（[获取地址](https://app.rainyun.com/dev/api)）

### 部署步骤

```bash
# 1. SSH 登录服务器，克隆仓库
sudo git clone https://github.com/KeKe0904/KeYuCloud.git /opt/rainyun-reseller
cd /opt/rainyun-reseller

# 2. 执行一键部署脚本
sudo chmod +x deploy/deploy.sh
sudo ./deploy/deploy.sh
```

### 脚本执行流程

| 步骤 | 说明 |
|---|---|
| 1. 环境准备 | 自动安装 Node.js 22 / PM2 / MySQL / Redis / Nginx / Git，**MySQL/Redis 自动改为非默认端口** |
| 2. 拉取代码 | 克隆或更新到 `/opt/rainyun-reseller` |
| 3. 数据库配置 | 通过本机 root（unix_socket）创建业务库+用户，**仅需填写业务库名/用户名/密码** |
| 4. 域名配置 | 自动 DNS 检测，未解析可重试或跳过 |
| 5. SSL 配置 | 三选一：跳过 / 使用已有证书 / 自动申请 Let's Encrypt |
| 6. 生成 .env | **强随机密钥**（JWT/AES/向导令牌），权限 600 |
| 7. 构建前后端 | prisma generate + nest build + vite build |
| 8. 配置 Nginx | 反向代理 + SPA 路由回退 + SSL |
| 9. 启动向导 | 启动网页向导并输出**向导访问令牌** |

### 数据库配置（无需 root 密码）

脚本通过 SSH 登录的 root/sudo 身份自动连接 MySQL（unix_socket 认证），**不需要输入 MySQL root 密码**：

- **业务库名**：默认 `rainyun_reseller`（可改）
- **业务库用户**：默认 `rainyun`（可改）
- **业务库密码**：**必须由用户手动填写**（≥ 8 位强密码）
- **数据库端口**：默认 `2009`（与 MySQL 配置同步）

### 部署完成输出

```
============================================================
  部署脚本执行完成！
============================================================

接下来请访问网页外部向导完成最后配置：

  👉 http://your-server-ip:7432

🔐 向导访问令牌（请妥善保管，访问向导时需要输入）：
  a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```

> **请妥善记录此令牌**，向导页面首次加载时必须输入，未输入正确令牌无法访问任何向导 API。

---

## 网页部署向导

部署脚本执行完后，最后 5 步配置通过网页向导完成。

### 访问方式

1. 浏览器打开脚本输出的向导地址（默认端口 `7432`）
2. 输入部署脚本控制台显示的**向导访问令牌**
3. 验证通过后进入向导

### 5 步流程

#### 步骤 1：环境检测
检测 Node.js / npm / PM2 / MySQL / Redis / Nginx / Git / 应用目录 / .env 文件是否就绪。

#### 步骤 2：连接数据库
- 预填：主机 `127.0.0.1`、端口 `2009`、用户 `rainyun`、库名 `rainyun_reseller`
- 密码必填，预填项可手动修改
- **自动测试连接，严禁自动创建数据库**：库不存在直接报错，提示回 SSH 执行部署脚本
- 测试成功后自动执行 `prisma migrate deploy` + `prisma db seed`

#### 步骤 3：域名配置（可二次填写）
- 自动检测 DNS 是否解析到本机，未生效可勾选「跳过检测」强制保存
- 自动更新 `.env` 与 Nginx 配置

#### 步骤 4：配置超级管理员
- 用户名：3-32 位字母数字下划线
- 密码：≥ 8 位，字母开头，含数字和特殊字符
- 邮箱：可选
- 密码以 bcrypt 12 轮哈希存储
- 同名管理员已存在则自动更新密码

#### 步骤 5：启动服务
- PM2 启动后端进程 `rainyun-api`
- 健康检查 `http://127.0.0.1:1001/api/health`
- **3 秒后自动关闭向导进程**（`pm2 delete rainyun-wizard`），外部无法再访问

### 向导 API

除 `status` / `services` / `verify-token` / `health` 外，所有 POST 接口必须携带 `x-wizard-token` 头部：

| API | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/health` | GET | 无 | 健康检查 |
| `/api/wizard/status` | GET | 无 | 读取部署元信息 + 完成标记 |
| `/api/wizard/services` | GET | 无 | 查询前后端运行状态 |
| `/api/wizard/verify-token` | POST | 无 | 验证向导令牌 |
| `/api/wizard/check-env` | POST | 令牌 | 环境检测 |
| `/api/wizard/test-db` | POST | 令牌 | 测试数据库连接（不自动建库） |
| `/api/wizard/migrate-db` | POST | 令牌 | 执行数据库迁移 + Seed |
| `/api/wizard/configure-domain` | POST | 令牌 | 二次域名配置 |
| `/api/wizard/setup-admin` | POST | 令牌 | 创建/更新超级管理员 |
| `/api/wizard/start-services` | POST | 令牌 | 启动服务（启动后自动关闭向导） |

### 重新配置

如需重新进入向导：

```bash
rm /opt/rainyun-reseller/deploy/.wizard-done
cd /opt/rainyun-reseller/deploy/setup-wizard
APP_DIR=/opt/rainyun-reseller WIZARD_PORT=7432 pm2 start server.js --name rainyun-wizard
# 重新访问 http://your-server-ip:7432，需再次输入向导令牌
```

---

## 手动部署

### 1. 安装依赖

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs mysql-server redis-server nginx git
sudo npm install -g pm2

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs mysql-server redis nginx git
sudo npm install -g pm2
```

### 2. 修改 MySQL / Redis 端口（推荐）

`/etc/mysql/mysql.conf.d/mysqld.cnf` 在 `[mysqld]` 段下：
```
port=2009
```

`/etc/redis/redis.conf`：
```
port 2008
```

```bash
sudo systemctl restart mysql redis
```

### 3. 创建数据库

```bash
sudo mysql <<'SQL'
CREATE DATABASE rainyun_reseller DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE rainyun_reseller_shadow DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rainyun'@'localhost' IDENTIFIED BY '你的强密码';
GRANT ALL PRIVILEGES ON rainyun_reseller.* TO 'rainyun'@'localhost';
GRANT ALL PRIVILEGES ON rainyun_reseller_shadow.* TO 'rainyun'@'localhost';
FLUSH PRIVILEGES;
SQL
```

### 4. 配置 .env

```bash
cd server
cp .env.example .env
# 编辑 .env，至少修改：
#   DATABASE_URL / SHADOW_DATABASE_URL（端口 2009 + 你的密码）
#   REDIS_PORT=2008
#   PORT=1001
#   JWT_SECRET / ADMIN_JWT_SECRET（openssl rand -hex 32，≥ 32 字节）
#   AES_SECRET（openssl rand -hex 16，恰好 32 字符）
#   RAINYUN_API_KEY
#   SITE_URL / CORS_ORIGIN
chmod 600 .env
```

### 5. 构建并初始化

```bash
cd server
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run build

cd ../web
npm install
npm run build
```

### 6. 启动服务

```bash
cd server
pm2 start dist/src/main.js --name rainyun-api
pm2 save
pm2 startup     # 开机自启
```

### 7. Nginx 配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /opt/rainyun-reseller/web/dist;
    index index.html;
    client_max_body_size 10m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:1001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 开发指南

### 后端

```bash
cd server
npm install
cp .env.example .env         # 编辑为本地配置
npx prisma generate
npx prisma migrate dev       # 开发模式迁移
npm run prisma:seed
npm run start:dev            # 热重载，http://localhost:1001
```

新增业务模块：
```bash
npx nest g module modules/your-module
npx nest g controller modules/your-module
npx nest g service modules/your-module
```

数据库 Schema 变更：
```bash
# 修改 prisma/schema.prisma
npx prisma migrate dev --name your-change-description
npx prisma generate
```

### 前端

```bash
cd web
npm install
npm run dev                  # http://localhost:5173，自动代理 /api 到 1001
npm run type-check           # TS 类型检查
npm run build                # 生产构建
```

项目约定：
- Composition API + `<script setup lang="ts">`
- Element Plus 按需自动导入
- 路由层级：`/`（门户）、`/dashboard`（用户后台）、`/admin`（管理后台）
- API 调用统一通过 `src/api/` 封装
- 全局状态用 Pinia store

### 默认管理员

执行 `npm run prisma:seed` 后自动创建：
- 用户名：`admin`
- 密码：见 `.env` 中的 `INIT_ADMIN_PASSWORD`

> **生产环境请登录后立即修改密码。**

---

## 配置项说明

### 必改环境变量（生产环境）

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | MySQL 连接串（端口 2009） | - |
| `SHADOW_DATABASE_URL` | 迁移用影子库 | - |
| `JWT_SECRET` | 用户端 JWT 密钥（≥ 32 字节强随机） | change-me |
| `ADMIN_JWT_SECRET` | 管理端 JWT 密钥（≥ 32 字节强随机） | change-me |
| `AES_SECRET` | 敏感字段加密密钥（**恰好 32 字节**） | change-me |
| `RAINYUN_API_KEY` | 雨云上游 API Key | 空（启用 MOCK） |
| `SITE_URL` | 站点访问 URL | - |
| `INIT_ADMIN_PASSWORD` | 初始管理员密码（≥ 8 位强密码） | change-me |
| `EPAY_KEY` | 易支付商户密钥 | - |
| `CORS_ORIGIN` | CORS 允许来源（你的域名） | localhost:5173 |

### 可选环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 后端监听端口 | 1001 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis 连接 | 127.0.0.1 / 2008 / 空 / 0 |
| `JWT_EXPIRES_IN` / `ADMIN_JWT_EXPIRES_IN` | Token 过期时间 | 7d / 1d |
| `RAINYUN_MOCK` | 雨云 MOCK 模式（生产环境告警） | false |
| `RAINYUN_API_BASE` | 雨云 API 地址 | https://api.v2.rainyun.com |
| `EPAY_PID` / `EPAY_API_URL` / `EPAY_NOTIFY_URL` / `EPAY_RETURN_URL` | 易支付配置 | - |
| `SITE_NAME` / `PANEL_URL` | 站点信息 | KeYuCloud / https://app.rainyun.com |
| `INIT_ADMIN_USERNAME` | 初始管理员用户名 | admin |
| `UPLOAD_DIR` / `UPLOAD_MAX_SIZE` | 上传配置 | ./uploads / 10MB |
| `HTTPS_PROXY` / `NO_PROXY` | HTTPS 代理（访问阿里云/雨云 API） | - |

### 密钥生成

```bash
openssl rand -hex 32      # JWT_SECRET / ADMIN_JWT_SECRET（64 字符 = 32 字节）
openssl rand -hex 16      # AES_SECRET（32 字符 = 32 字节）
```

---

## 端口策略

所有服务使用非默认端口，降低被扫描攻击风险：

| 服务 | 默认端口 | 本项目端口 |
|---|---|---|
| 后端 NestJS | 3000 | **1001** |
| 网页部署向导 | 8888 | **7432** |
| MySQL | 3306 | **2009** |
| Redis | 6379 | **2008** |
| Nginx HTTP / HTTPS | 80 / 443 | 80 / 443（必须） |

> 部署脚本会自动修改 MySQL / Redis 配置文件并重启服务以应用新端口。

---

## 安全设计

### 生产环境启动校验

启动时检测密钥强度，**致命问题拒绝启动**：

| 校验项 | 致命（拒绝启动） | 警告（允许启动） |
|---|---|---|
| `JWT_SECRET` | 含占位符 / 长度 < 32 字节 | - |
| `ADMIN_JWT_SECRET` | 含占位符 / 长度 < 32 字节 | - |
| `AES_SECRET` | 含占位符 / 长度 ≠ 32 字节 | - |
| `INIT_ADMIN_PASSWORD` | - | 含占位符 / 长度 < 8 |
| `RAINYUN_MOCK=true` | - | 未配置 `RAINYUN_API_KEY` |

### 向导安全机制

- **一次性令牌认证**：所有 POST 接口必须携带 `x-wizard-token` 头部，否则 401
- **向导完成后自动关闭**：启动服务成功后，向导进程通过 `pm2 delete rainyun-wizard` 自删除
- **写操作锁定**：`.wizard-done` 存在时，写操作 API 返回 403
- **数据库密码不落盘**：仅在内存中缓存（进程退出即清除）
- **不自动创建数据库**：测试连接时库不存在直接报错

### 其他安全措施

- **AES-256 加密**：SMTP 密码、短信 AccessKey 等敏感字段加密存储
- **bcrypt 12 轮**：用户与管理员密码哈希
- **JWT 双密钥**：用户端与管理端独立密钥
- **helmet 安全头**：CSP / X-Frame-Options / HSTS / X-Content-Type-Options
- **速率限制**：登录/注册等敏感接口独立限流，全局默认 60 次/分钟
- **日志脱敏**：日志与错误响应自动脱敏 URL 中的 `password` / `token` / `secret` 等参数
- **审计日志**：管理员关键操作全记录
- **.env 权限 600**：仅所有者可读写

---

## 常见问题

### Q：启动后端报「生产环境密钥校验未通过，服务拒绝启动」？
A：`.env` 中的 `JWT_SECRET` / `ADMIN_JWT_SECRET` / `AES_SECRET` 仍是 `change-me` 占位符或长度不达标。用 `openssl rand -hex 32`（JWT）和 `openssl rand -hex 16`（AES）生成强随机密钥替换。重新执行 `deploy.sh` 会自动生成。

### Q：忘记向导访问令牌？
A：查看 `/opt/rainyun-reseller/deploy/.deploy-meta.json` 中的 `wizardToken` 字段。

### Q：向导已完成，想重新配置？
A：见上文 [重新配置](#重新配置) 章节。

### Q：端口被占用？
A：本项目使用非默认端口（1001/7432/2009/2008）。如某端口已被占用，修改对应配置文件：
- 后端：`server/.env` 的 `PORT`
- 向导：`deploy.sh` 的 `WIZARD_PORT`
- MySQL：`/etc/mysql/mysql.conf.d/mysqld.cnf` 的 `port`
- Redis：`/etc/redis/redis.conf` 的 `port`

### Q：前端能访问但 API 502？
A：检查 Nginx 反向代理是否指向 `http://127.0.0.1:1001`（非默认 3000）：
```bash
pm2 status                   # 确认 rainyun-api 在运行
curl http://127.0.0.1:1001/api/health   # 健康检查
```

### Q：雨云 API 报 MOCK 模式？
A：`.env` 中 `RAINYUN_API_KEY` 为空时自动启用 MOCK 模式（所有上游操作本地模拟）。生产环境请在 [雨云控制台](https://app.rainyun.com/dev/api) 获取 API Key 后填入。

### Q：prisma migrate 报影子库错误？
A：需配置 `SHADOW_DATABASE_URL`（指向一个已创建的影子库），且业务库用户对该库有 CREATE 权限。一键部署脚本会自动创建影子库 `rainyun_reseller_shadow`。

---

## 许可证

MIT License © 2026 KeYuCloud
