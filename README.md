# KeYuCloud

> 基于雨云上游 API 的云服务器分销平台（白标 resale 系统）。
>
> 前后端分离 · 一键部署 · 网页向导 · 开箱即用 · 生产就绪

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.x-green.svg)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/nestjs-10.x-red.svg)](https://nestjs.com/)
[![Vue](https://img.shields.io/badge/vue-3.5-42b883.svg)](https://vuejs.org/)
[![Prisma](https://img.shields.io/badge/prisma-5.x-2d3748.svg)](https://www.prisma.io/)

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [功能模块](#功能模块)
- [一键部署](#一键部署)
- [网页部署向导](#网页部署向导)
- [手动部署](#手动部署)
- [开发指南](#开发指南)
- [API 概览](#api-概览)
- [数据模型](#数据模型)
- [配置项说明](#配置项说明)
- [端口策略](#端口策略)
- [安全设计](#安全设计)
- [测试与质量保证](#测试与质量保证)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 项目简介

KeYuCloud 是一套面向雨云（rainyun.com）上游 API 的二次售卖/分销系统，提供完整的：

- **前台门户**：商品浏览、区域筛选、在线下单、订单支付、工单支持
- **用户后台**：订单/产品管理、续费升级、工单、财务流水、通知中心
- **管理后台**：商品/订单/用户/工单/财务管理、SMTP/SMS 配置、审计日志、管理员 RBAC

系统设计目标：
- **开箱即用**：从空白服务器到上线，单脚本 + 网页向导完成全流程
- **生产就绪**：内置安全校验、密钥强度检查、速率限制、日志脱敏
- **白标支持**：通过雨云 `panel_user` API 自动开通白标面板
- **多角色管理**：6 种管理员角色，细粒度权限控制

---

## 核心特性

### 业务能力

- **商品体系**：上游套餐同步、周期定价（1/3/6/12 月折扣）、区域/系统模板筛选
- **订单流程**：创建 → 余额支付 / 易支付 → 自动开通 → 续费 / 升级 / 退款
- **工单系统**：本站工单 + 雨云官方工单双通道，支持评分、紧急度、分配
- **用户产品**：对接雨云 `user_product`，支持开关机、重启、重装、改密码等运维操作
- **财务流水**：充值、消费、退款、人工调整全记录，月度报表可视化
- **通知中心**：站内通知、邮件（SMTP）、短信（阿里云 PNVS）三通道

### 工程能力

- **MOCK 模式**：未配置雨云 API Key 时所有上游操作本地模拟，便于开发与演示
- **审计日志**：管理员关键操作（登录、改用户余额、改商品价格、退款等）全记录
- **优雅降级**：上游 API 异常时返回脱敏错误，不泄露内部细节
- **热更新**：开发模式 nest watch + vite HMR，秒级反馈
- **进程管理**：PM2 托管后端，开机自启、崩溃重启

---

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 后端框架 | NestJS | 10.x |
| ORM | Prisma | 5.x |
| 数据库 | MySQL | 8.x |
| 缓存 | Redis | 6.x+ |
| 认证 | Passport JWT + 双密钥 | - |
| 速率限制 | @nestjs/throttler | 5.x |
| 安全头 | helmet | 7.x |
| 密码哈希 | bcryptjs（12 轮） | - |
| 加密 | AES-256-CTR（crypto） | - |
| 前端框架 | Vue | 3.5 |
| 构建工具 | Vite | 6.x |
| UI 库 | Element Plus | 自动按需导入 |
| 状态管理 | Pinia | - |
| 图表 | ECharts | 6.1.x |
| CSS 预处理 | SCSS | - |
| 部署脚本 | Bash | - |
| 进程管理 | PM2 | 5.x |
| Web 服务器 | Nginx | - |
| SSL 证书 | Let's Encrypt（certbot） | - |

---

## 项目结构

```
KeYuCloud/
├── server/                          # 后端 NestJS
│   ├── src/
│   │   ├── common/                  # 公共模块
│   │   │   ├── decorators/          # @Public / @CurrentUser / @CurrentAdmin
│   │   │   ├── filters/             # 全局异常过滤器（含脱敏）
│   │   │   ├── guards/              # JwtAuthGuard / AdminAuthGuard
│   │   │   ├── interceptors/        # 全局日志拦截器
│   │   │   ├── api-response.ts      # 统一响应封装
│   │   │   ├── crypto.util.ts       # AES-256 加解密
│   │   │   ├── prisma.service.ts    # Prisma 客户端
│   │   │   ├── redis.service.ts     # Redis 客户端
│   │   │   └── sanitize.util.ts     # XSS 清洗 / URL 脱敏
│   │   ├── modules/                 # 业务模块
│   │   │   ├── auth/                # 用户认证（注册/登录/改密/资料）
│   │   │   ├── admin/               # 管理后台（综合服务）
│   │   │   ├── product/             # 商品查询
│   │   │   ├── order/               # 订单管理
│   │   │   ├── payment/             # 支付（余额/易支付）
│   │   │   ├── user-product/        # 用户产品（运维操作）
│   │   │   ├── ticket/              # 工单
│   │   │   ├── finance/             # 财务流水
│   │   │   ├── mailer/              # 邮件服务
│   │   │   ├── sms/                 # 短信服务（阿里云 PNVS）
│   │   │   ├── notification/        # 站内通知
│   │   │   ├── rainyun/             # 雨云上游 API 封装
│   │   │   └── public/              # 公开接口（站点信息/公告/推荐）
│   │   ├── app.module.ts            # 根模块（全局守卫注册）
│   │   ├── app.controller.ts        # 健康检查端点
│   │   └── main.ts                  # 入口（helmet/CORS/校验/trust proxy）
│   ├── prisma/
│   │   ├── schema.prisma            # 数据模型
│   │   ├── migrations/              # 数据库迁移
│   │   └── seed.ts                  # 初始数据（默认管理员）
│   ├── test/                        # 单元测试
│   └── .env.example
│
├── web/                             # 前端 Vue 3
│   ├── src/
│   │   ├── api/                     # API 调用封装（按模块）
│   │   ├── components/              # 通用组件
│   │   │   └── icons/               # 装饰图标（樱花、Logo、主题切换等）
│   │   ├── composables/             # 组合式函数（响应式等）
│   │   ├── layouts/                 # 布局
│   │   │   ├── PortalLayout.vue     # 前台门户
│   │   │   ├── DashboardLayout.vue  # 用户后台
│   │   │   └── AdminLayout.vue      # 管理后台
│   │   ├── views/
│   │   │   ├── portal/              # 前台页面（首页/商品/登录/注册）
│   │   │   ├── dashboard/           # 用户后台页面
│   │   │   └── admin/               # 管理后台页面
│   │   ├── router/                  # 路由配置
│   │   ├── stores/                  # Pinia 状态（auth/admin/theme）
│   │   └── styles/                  # 全局样式（变量/响应式/Element 覆盖）
│   └── vite.config.ts
│
├── deploy/
│   ├── deploy.sh                    # 一键部署脚本
│   ├── update.sh                    # 在线更新脚本
│   └── setup-wizard/                # 网页部署向导
│       ├── server.js                # 向导后端
│       └── public/index.html        # 向导前端
│
└── README.md
```

---

## 功能模块

### 前台门户（公开访问）

| 页面 | 路由 | 功能 |
|---|---|---|
| 首页 | `/` | Hero、商品推荐、特性介绍、公告 |
| 商品列表 | `/products` | 全部商品、区域/价格筛选 |
| 区域详情 | `/products/zone/:zone` | 按区域查看商品 |
| 商品详情 | `/products/:id` | 商品参数、周期价格、配置选项 |
| 登录 | `/login` | 手机号 + 密码登录 |
| 注册 | `/register` | 手机号 + 短信验证码 + 密码注册 |
| 支付结果 | `/payment/result` | 易支付完成后的回调页 |

### 用户后台（需登录）

| 页面 | 路由 | 功能 |
|---|---|---|
| 概览 | `/dashboard` | 余额、订单/产品/工单概览 |
| 订单列表 | `/dashboard/orders` | 订单查询、状态筛选 |
| 订单详情 | `/dashboard/orders/:id` | 订单信息、支付/取消操作 |
| 我的产品 | `/dashboard/products` | 已开通的云服务器列表 |
| 产品详情 | `/dashboard/products/:id` | 产品信息、运维操作（开关机/重装等） |
| 工单列表 | `/dashboard/tickets` | 工单查询 |
| 新建工单 | `/dashboard/tickets/new` | 提交工单（本站/官方双通道） |
| 工单详情 | `/dashboard/tickets/:id` | 工单对话、回复、评分 |
| 财务流水 | `/dashboard/finance` | 充值/消费/退款记录 |
| 个人资料 | `/dashboard/profile` | 改密码、改资料、邀请码 |
| 通知中心 | `/dashboard/notifications` | 站内通知列表 |

### 管理后台（需管理员登录）

| 页面 | 路由 | 功能 |
|---|---|---|
| 管理员登录 | `/admin/login` | 管理员独立登录入口 |
| 仪表盘 | `/admin` | 销售额、用户数、订单数等图表 |
| 用户管理 | `/admin/users` | 用户列表、封禁/解封、余额调整 |
| 用户详情 | `/admin/users/:id` | 用户信息、订单/产品/工单/流水 |
| 商品管理 | `/admin/products` | 商品列表、价格配置、上下架、同步上游 |
| 订单管理 | `/admin/orders` | 全部订单、退款 |
| 订单详情 | `/admin/orders/:id` | 订单详情、开通状态、退款 |
| 用户产品 | `/admin/user-products` | 所有用户产品、运维操作 |
| 工单管理 | `/admin/tickets` | 工单列表、分配、回复 |
| 工单详情 | `/admin/tickets/:id` | 工单对话、回复、关闭 |
| 财务管理 | `/admin/finance` | 收支趋势、分类饼图、明细 |
| 上游配置 | `/admin/upstream` | 雨云 API Key、白标面板配置 |
| SMTP 配置 | `/admin/smtp` | 邮件服务器配置 |
| SMTP 模板 | `/admin/smtp/templates` | 邮件模板管理 |
| SMTP 日志 | `/admin/smtp/logs` | 邮件发送日志 |
| 短信配置 | `/admin/sms` | 阿里云 PNVS 配置 |
| 优惠券 | `/admin/coupons` | 优惠券创建/管理 |
| 公告 | `/admin/announcements` | 公告发布/管理 |
| 系统配置 | `/admin/system` | 站点信息、版本检测、在线更新 |
| 管理员列表 | `/admin/admins` | 管理员账号、角色分配 |
| 个人资料 | `/admin/profile` | 管理员改密码、改资料 |
| 审计日志 | `/admin/audit-logs` | 管理员操作审计 |

### 管理员角色（RBAC）

| 角色 | 权限范围 |
|---|---|
| `SUPER_ADMIN` | 全部权限 |
| `ADMIN` | 除管理员管理外的全部权限 |
| `OPERATOR` | 运营类：商品、订单、工单、用户产品 |
| `FINANCE` | 财务类：用户余额、订单退款、财务报表 |
| `SUPPORT` | 工单类：工单查看与回复 |
| `TECH` | 工单类：工单查看与回复 |

---

## 一键部署

适用于空白服务器到上线的全流程自动化。

### 支持系统

- Ubuntu 20.04+
- Debian 11+
- CentOS 8+ / Rocky Linux / AlmaLinux
- RHEL 9+

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
| 1. 环境准备 | 自动安装 Node.js 22 / PM2 / MySQL / Redis / Nginx / Git |
| 2. 拉取代码 | 克隆或更新到 `/opt/rainyun-reseller` |
| 3. 数据库配置 | 通过本机 root（unix_socket）创建业务库+用户 |
| 4. 域名配置 | 自动 DNS 检测，未解析可重试或跳过 |
| 5. SSL 配置 | 三选一：跳过 / 使用已有证书 / 自动申请 Let's Encrypt |
| 6. 生成 .env | 强随机密钥（JWT/AES/向导令牌），权限 600 |
| 7. 构建前后端 | prisma generate + nest build + vite build |
| 8. 配置 Nginx | 反向代理 + SPA 路由回退 + SSL |
| 9. 启动向导 | 启动网页向导并输出向导访问令牌 |

### 数据库配置（无需 root 密码）

脚本通过 SSH 登录的 root/sudo 身份自动连接 MySQL（unix_socket 认证），**不需要输入 MySQL root 密码**：

- **业务库名**：默认 `rainyun_reseller`（可改）
- **业务库用户**：默认 `rainyun`（可改）
- **业务库密码**：**必须由用户手动填写**（≥ 8 位强密码）
- **数据库端口**：默认 `3306`（MySQL 软件默认端口）

### 部署完成输出

```
============================================================
  部署脚本执行完成！
============================================================

接下来请访问网页外部向导完成最后配置：

  👉 http://your-server-ip/setup-wizard/

🔐 向导访问令牌（请妥善保管，访问向导时需要输入）：
  a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```

> **请妥善记录此令牌**，向导页面首次加载时必须输入，未输入正确令牌无法访问任何向导 API。

---

## 网页部署向导

部署脚本执行完后，最后 5 步配置通过网页向导完成。

### 访问方式

1. 浏览器打开脚本输出的向导地址（通过主站 `/setup-wizard/` 路径访问）
2. 输入部署脚本控制台显示的**向导访问令牌**
3. 验证通过后进入向导

### 5 步流程

#### 步骤 1：环境检测

检测 Node.js / npm / PM2 / MySQL / Redis / Nginx / Git / 应用目录 / .env 文件是否就绪。

#### 步骤 2：连接数据库

- 预填：主机 `127.0.0.1`、端口 `3306`、用户 `rainyun`、库名 `rainyun_reseller`
- 密码必填，预填项可手动修改
- **自动测试连接，严禁自动创建数据库**：库不存在直接报错，提示回 SSH 执行部署脚本
- 测试成功后自动执行 `prisma migrate deploy` + `prisma db seed`

#### 步骤 3：域名配置（可二次填写）

- 自动检测 DNS 是否解析到本机，未生效可勾选「跳过检测」强制保存
- 自动更新 `.env` 与 Nginx 配置

#### 步骤 4：配置超级管理员

- 用户名：3-32 位字母数字下划线
- 密码：≥ 8 位，**必须同时包含字母和数字**
- 邮箱：可选
- 密码以 bcrypt 12 轮哈希存储
- 同名管理员已存在则自动更新密码

#### 步骤 5：启动服务

- PM2 启动后端进程 `rainyun-api`
- 健康检查 `http://127.0.0.1:3001/api/health`
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
APP_DIR=/opt/rainyun-reseller WIZARD_PORT=8888 pm2 start server.js --name rainyun-wizard
# 重新访问 http://your-server-ip/setup-wizard/，需再次输入向导令牌
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

### 2. 配置 MySQL / Redis（默认端口即可）

`/etc/mysql/mysql.conf.d/mysqld.cnf` 在 `[mysqld]` 段下（默认即 3306，通常无需修改）：
```
port=3306
```

`/etc/redis/redis.conf`（默认即 6379，通常无需修改）：
```
port 6379
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
#   DATABASE_URL / SHADOW_DATABASE_URL（端口 3306 + 你的密码）
#   REDIS_PORT=6379
#   PORT=3001
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
        proxy_pass http://127.0.0.1:3001;
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

### 后端开发

```bash
cd server
npm install
cp .env.example .env         # 编辑为本地配置
npx prisma generate
npx prisma migrate dev       # 开发模式迁移
npm run prisma:seed
npm run start:dev            # 热重载，http://localhost:3001
```

#### 新增业务模块

```bash
npx nest g module modules/your-module
npx nest g controller modules/your-module
npx nest g service modules/your-module
```

新增的 controller 默认会被全局 JwtAuthGuard 守护。若需要公开访问，在方法或类上加 `@Public()` 装饰器。

#### 数据库 Schema 变更

```bash
# 修改 prisma/schema.prisma
npx prisma migrate dev --name your-change-description
npx prisma generate
```

#### 代码规范

- 所有 API 响应统一通过 `ApiResponse.success()` / `ApiResponse.paged()` 包装
- 业务异常抛 `BizError`，含 code / message / status / details
- 用户输入文本（昵称、工单标题/内容、公告等）入库前调用 `sanitizeText()` 清洗
- 敏感字段（SMTP 密码、AccessKey 等）入库前用 `CryptoUtil.encrypt()` 加密
- 日志中 URL 通过 `sanitizeUrl()` 脱敏，避免泄露 query 中的 password / token 等参数

### 前端开发

```bash
cd web
npm install
npm run dev                  # http://localhost:5173，自动代理 /api 到 3001
npm run type-check           # TS 类型检查
npm run build                # 生产构建
```

#### 项目约定

- Composition API + `<script setup lang="ts">`
- Element Plus 按需自动导入（无需手动 import）
- 路由层级：
  - `/`（门户）：公开访问
  - `/dashboard`（用户后台）：路由守卫检查 `localStorage.token`
  - `/admin`（管理后台）：路由守卫检查 `localStorage.adminToken`
- API 调用统一通过 `src/api/` 下的模块封装
- 全局状态用 Pinia store（auth / admin / theme）
- 样式变量集中在 `src/styles/variables.scss`

### 默认管理员

执行 `npm run prisma:seed` 后自动创建：

- 用户名：`admin`
- 密码：见 `.env` 中的 `INIT_ADMIN_PASSWORD`

> **生产环境请登录后立即修改密码。**

---

## API 概览

### 公开接口（无需登录）

| 模块 | 路由前缀 | 主要端点 |
|---|---|---|
| 健康检查 | `/api/health` | `GET /` 服务健康状态 |
| 公开信息 | `/api/public` | `GET /site-info` / `/announcements` / `/configs` / `/products/recommended` |
| 商品 | `/api/products` | `GET /` 商品列表 / `GET /:id` 商品详情 / `GET /meta/os` OS 模板 / `GET /meta/zones` 区域列表 |
| 用户认证 | `/api/auth` | `POST /register` 注册 / `POST /login` 登录 / `POST /sms-code` 发送短信 |
| 支付回调 | `/api/payment` | `POST /epay/notify` 易支付异步通知 / `GET /epay/mock-pay` MOCK 模式触发 |

### 用户接口（需 Bearer Token）

| 模块 | 路由前缀 | 主要端点 |
|---|---|---|
| 用户资料 | `/api/auth` | `GET /profile` / `PUT /profile` / `POST /change-password` |
| 订单 | `/api/orders` | `POST /` 创建 / `GET /` 列表 / `GET /:id` 详情 / `POST /:id/pay/balance` 余额支付 / `POST /:id/pay/epay` 易支付 / `POST /:id/cancel` 取消 |
| 用户产品 | `/api/user-products` | `GET /` 列表 / `GET /:id` 详情 / `POST /:id/operate` 运维操作（开关机/重启/重装等） |
| 工单 | `/api/tickets` | `POST /` 创建 / `GET /` 列表 / `GET /:id` 详情 / `POST /:id/reply` 回复 / `POST /:id/rate` 评分 |
| 财务 | `/api/finance` | `GET /transactions` 流水 / `GET /summary` 汇总 |
| 通知 | `/api/notifications` | `GET /` 列表 / `PUT /:id/read` 标记已读 |

### 管理员接口（需 x-admin-token 或 Bearer Token）

路由前缀统一为 `/api/admin`，主要分组：

- **认证**：`POST /auth/login` / `GET /auth/profile` / `PUT /auth/profile` / `POST /auth/change-password`
- **仪表盘**：`GET /dashboard` 销售/用户/订单统计
- **用户管理**：`GET /users` / `GET /users/:id` / `PUT /users/:id/status` / `POST /users/:id/balance` / `POST /users/:id/reset-password`
- **商品管理**：`GET /products` / `POST /products` / `PUT /products/:id` / `POST /products/:id/sync-upstream`
- **订单管理**：`GET /orders` / `GET /orders/:id` / `POST /orders/:id/refund`
- **用户产品**：`GET /user-products` / `POST /user-products/:id/operate`
- **工单管理**：`GET /tickets` / `GET /tickets/:id` / `POST /tickets/:id/assign` / `POST /tickets/:id/reply` / `POST /tickets/:id/close`
- **财务管理**：`GET /finance/dashboard` / `GET /finance/transactions`
- **上游配置**：`GET /upstream/config` / `PUT /upstream/config` / `POST /upstream/test-connection`
- **SMTP**：`GET /smtp/config` / `PUT /smtp/config` / `POST /smtp/test` / `GET /smtp/templates` / `POST /smtp/templates` / `GET /smtp/logs`
- **短信**：`GET /sms/config` / `PUT /sms/config` / `POST /sms/test`
- **优惠券**：`GET /coupons` / `POST /coupons` / `PUT /coupons/:id` / `DELETE /coupons/:id`
- **公告**：`GET /announcements` / `POST /announcements` / `PUT /announcements/:id` / `DELETE /announcements/:id`
- **系统**：`GET /system/env-info` / `GET /system/version-check` / `POST /system/force-update` / `GET /system/update-status`
- **管理员管理**：`GET /admins` / `POST /admins` / `PUT /admins/:id` / `DELETE /admins/:id`
- **审计日志**：`GET /audit-logs`

---

## 数据模型

主要数据表（详见 `server/prisma/schema.prisma`）：

| 表名 | 说明 |
|---|---|
| `User` | 用户（手机号、密码哈希、余额、邀请关系、面板账号关联） |
| `Admin` | 管理员（用户名、密码哈希、角色、状态） |
| `Product` | 商品（上游套餐 ID、周期价格 JSON、规格、上下架） |
| `Order` | 订单（金额、状态、支付方式、周期、关联商品） |
| `UserProduct` | 用户已开通产品（关联雨云 user_product id、运维状态） |
| `Ticket` | 工单（类型、紧急度、状态、来源 local/official） |
| `TicketReply` | 工单回复（管理员/用户、内容） |
| `Transaction` | 财务流水（充值/消费/退款/调整） |
| `Coupon` | 优惠券（折扣类型、金额、有效期、使用次数） |
| `Announcement` | 公告（标题、内容、生效时间） |
| `Notification` | 站内通知（用户维度） |
| `AuditLog` | 审计日志（管理员操作） |
| `SmtpTemplate` | 邮件模板 |
| `SmtpLog` | 邮件发送日志 |
| `Config` | 站点配置（KV 表） |
| `OsTemplate` | 操作系统模板（缓存上游） |
| `Zone` | 区域信息 |

---

## 配置项说明

### 必改环境变量（生产环境）

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | MySQL 连接串（端口 3306） | - |
| `SHADOW_DATABASE_URL` | 迁移用影子库 | - |
| `JWT_SECRET` | 用户端 JWT 密钥（≥ 32 字节强随机） | change-me |
| `ADMIN_JWT_SECRET` | 管理端 JWT 密钥（≥ 32 字节强随机） | change-me |
| `AES_SECRET` | 敏感字段加密密钥（**恰好 32 字节**） | change-me |
| `RAINYUN_API_KEY` | 雨云上游 API Key | 空（启用 MOCK） |
| `SITE_URL` | 站点访问 URL | - |
| `INIT_ADMIN_PASSWORD` | 初始管理员密码（≥ 8 位，字母+数字） | change-me |
| `EPAY_KEY` | 易支付商户密钥 | - |
| `CORS_ORIGIN` | CORS 允许来源（你的域名） | localhost:5173 |

### 可选环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `NODE_ENV` | 运行环境（production 时启用密钥校验、trust proxy、HSTS） | development |
| `PORT` | 后端监听端口 | 3001 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis 连接 | 127.0.0.1 / 6379 / 空 / 0 |
| `JWT_EXPIRES_IN` / `ADMIN_JWT_EXPIRES_IN` | Token 过期时间 | 7d / 1d |
| `RAINYUN_MOCK` | 雨云 MOCK 模式（生产环境告警） | false |
| `RAINYUN_API_BASE` | 雨云 API 地址 | https://api.v2.rainyun.com |
| `EPAY_PID` / `EPAY_API_URL` / `EPAY_NOTIFY_URL` / `EPAY_RETURN_URL` | 易支付配置 | - |
| `SITE_NAME` / `PANEL_URL` | 站点信息 | KeYuCloud / https://app.rainyun.com |
| `INIT_ADMIN_USERNAME` | 初始管理员用户名 | admin |
| `UPLOAD_DIR` / `UPLOAD_MAX_SIZE` | 上传配置 | ./uploads / 10MB |
| `HTTPS_PROXY` / `NO_PROXY` | HTTPS 代理（访问阿里云/雨云 API） | - |
| `UPDATE_REPO` | 在线更新检测的 GitHub 仓库 | KeKe0904/KeYuCloud |

### 密钥生成

```bash
openssl rand -hex 32      # JWT_SECRET / ADMIN_JWT_SECRET（64 字符 = 32 字节）
openssl rand -hex 16      # AES_SECRET（32 字符 = 32 字节）
```

---

## 端口策略

所有服务使用软件默认端口，便于部署与维护：

| 服务 | 端口 | 监听地址 | 说明 |
|---|---|---|---|
| 后端 NestJS | 3001 | 0.0.0.0（生产建议改 127.0.0.1） | 由 Nginx 反代 /api/ |
| 网页部署向导 | 8888 | 127.0.0.1 | 由 Nginx 反代 /setup-wizard/，无需开放公网 |
| MySQL | 3306 | 127.0.0.1（建议） | 软件默认端口 |
| Redis | 6379 | 127.0.0.1（建议） | 软件默认端口 |
| Nginx HTTP / HTTPS | 80 / 443 | 0.0.0.0 | 前端入口，必须 |
| Chrome DevTools（仅开发） | 9222 | 127.0.0.1 | 仅本地前端自动化测试用 |

> 向导服务仅监听 127.0.0.1，通过 Nginx 的 /setup-wizard/ 路径反代访问，无需开放 8888 端口到公网。

---

## 安全设计

### 1. 生产环境启动校验

启动时检测密钥强度，**致命问题拒绝启动**：

| 校验项 | 致命（拒绝启动） | 警告（允许启动） |
|---|---|---|
| `JWT_SECRET` | 含占位符 / 长度 < 32 字节 | - |
| `ADMIN_JWT_SECRET` | 含占位符 / 长度 < 32 字节 | - |
| `AES_SECRET` | 含占位符 / 长度 ≠ 32 字节 | - |
| `INIT_ADMIN_PASSWORD` | - | 含占位符 / 长度 < 8 |
| `RAINYUN_MOCK=true` | - | 未配置 `RAINYUN_API_KEY` |

### 2. 密码安全

- **bcrypt 12 轮哈希**：用户与管理员密码均使用 bcryptjs（cost=12）加密存储
- **密码复杂度要求**：注册 / 改密 / 重置密码均要求 8-32 位且**必须同时包含字母和数字**
- **独立面板密码**：雨云白标面板密码随机生成（`crypto.randomBytes`），与平台登录密码解耦
- **密码修改通知**：用户改密后自动发送站内通知

### 3. JWT 双密钥认证

- **用户 JWT**：使用 `JWT_SECRET`，有效期 7d
- **管理员 JWT**：使用独立的 `ADMIN_JWT_SECRET`，有效期 1d
- 两套密钥完全独立，互不影响
- 通过 `x-admin-token` 头部或 `Authorization: Bearer` 传递

### 4. HTTP 安全头（helmet）

启用 helmet 中间件，自动设置：

- `Content-Security-Policy`：限制资源加载来源
- `X-Frame-Options: DENY`：禁止点击劫持
- `X-Content-Type-Options: nosniff`：禁止 MIME 嗅探
- `Referrer-Policy: no-referrer`：不泄露 Referrer
- `HSTS`：生产环境强制 HTTPS
- `X-Permitted-Cross-Domain-Policies: none`：禁止跨域策略文件
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: cross-origin`（允许跨域加载图片）

### 5. 速率限制（ThrottlerGuard）

| 端点 | 限制 |
|---|---|
| 全局默认 | 60 次/分钟 |
| 用户登录 `/api/auth/login` | 5 次/分钟 |
| 用户注册 `/api/auth/register` | 5 次/分钟 |
| 发送短信 `/api/auth/sms-code` | 3 次/分钟 |
| 改密码 `/api/auth/change-password` | 5 次/分钟 |
| 管理员登录 `/api/admin/auth/login` | 5 次/分钟 |
| 余额支付 `/api/orders/:id/pay/balance` | 5 次/分钟 |
| 易支付回调 `/api/payment/epay/notify` | 60 次/分钟 |
| Mock 支付 `/api/payment/epay/mock-pay` | 30 次/分钟 |

> 生产环境启用 `trust proxy`，确保速率限制按真实客户端 IP 计算（不会被 Nginx 反代合并为同一 IP）。

### 6. 输入验证与 XSS 防护

- **ValidationPipe**：全局管道，`whitelist: true` 自动剥离未声明字段，`transform: true` 自动类型转换
- **DTO 装饰器**：所有入参用 class-validator 装饰器声明约束（`@IsInt` / `@Matches` / `@MinLength` / `@MaxLength` / `@IsIn` 等）
- **XSS 清洗**：用户输入文本（昵称、工单标题/内容、公告等）入库前调用 `sanitizeText()`，剥离所有 HTML 标签 + 转义特殊字符
- **URL 长度限制**：头像 URL 限制 500 字符，工单内容限制 500000 字符

### 7. SQL 注入防护

- 全部数据库操作通过 Prisma ORM 参数化查询
- 项目中**无任何 `$queryRaw` / `$executeRaw` 原生 SQL 调用**
- 用户输入不会拼接进 SQL

### 8. 错误响应脱敏

全局异常过滤器 `HttpExceptionFilter` 对所有错误响应脱敏：

- **4xx 业务异常**：若 message 含 `Prisma` / `rainyun` / `stack` / `node_modules` / `ECONNREFUSED` 等内部细节，自动替换为通用提示
- **5xx 服务器异常**：对外只返回 `服务器内部错误，请稍后重试`，堆栈仅记录到服务端日志
- **429 限流**：替换为友好提示 `请求过于频繁，请稍后再试`，不暴露 ThrottlerException 类名
- **URL 脱敏**：日志和响应中的 URL，`password` / `token` / `secret` / `apikey` 等敏感 query 参数值替换为 `***`

### 9. CORS 限制

```typescript
app.enableCors({
  origin: config.get('CORS_ORIGIN', 'http://localhost:5173').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token'],
});
```

- 仅允许 `CORS_ORIGIN` 环境变量显式声明的来源
- 生产环境必须配置为你的域名
- 不使用 `origin: '*'`

### 10. 向导安全机制

- **一次性令牌认证**：所有 POST 接口必须携带 `x-wizard-token` 头部，否则 401
- **向导完成后自动关闭**：启动服务成功后，向导进程通过 `pm2 delete rainyun-wizard` 自删除
- **写操作锁定**：`.wizard-done` 存在时，写操作 API 返回 403
- **数据库密码不落盘**：仅在内存中缓存（进程退出即清除）
- **不自动创建数据库**：测试连接时库不存在直接报错

### 11. AES-256 加密

敏感字段加密存储：

- SMTP 密码
- 短信 AccessKeySecret
- 雨云 API Key（可选）
- 易支付商户密钥

加密方式：AES-256-CTR，密钥为 `AES_SECRET`（恰好 32 字节）。

### 12. 审计日志

管理员关键操作全记录，包括：

- 登录 / 登出
- 修改用户余额 / 状态
- 创建 / 修改 / 删除商品
- 订单退款
- 工单分配 / 回复 / 关闭
- 修改 SMTP / SMS 配置
- 创建 / 修改管理员账号
- 系统配置变更

每条审计日志包含：操作人、操作类型、目标对象、新旧值、IP、User-Agent、时间戳。

### 13. .env 权限

部署脚本自动设置 `chmod 600 .env`，仅文件所有者可读写。

---

## 测试与质量保证

### 测试覆盖

本项目在交付前已通过完整的本地部署测试，包括：

#### API 功能测试

| 测试项 | 数量 | 覆盖范围 |
|---|---|---|
| 健康检查 | 1 | `/api/health` 状态、版本、上游模式 |
| 公开 API | 5 | 站点信息、公告、商品列表/详情、推荐 |
| 用户认证 | 4 | 注册、登录、profile 查询/修改、改密码 |
| 管理员认证 | 3 | 登录、profile、改密码 |
| 商品管理 | 4 | 列表、详情、创建、更新 |
| 订单管理 | 5 | 创建、列表、详情、余额支付、取消 |
| 工单管理 | 4 | 创建、列表、详情、回复、评分 |
| 用户管理 | 3 | 列表、详情、状态变更、余额调整 |
| 财务管理 | 2 | 仪表盘、流水 |
| SMTP/SMS | 4 | 配置查询/更新、模板、日志 |
| 公告/优惠券 | 3 | 公告 CRUD、优惠券 CRUD |
| 管理员管理 | 2 | 列表、创建 |
| 用户产品 | 2 | 列表、详情 |

#### 安全测试

| 测试项 | 验证内容 |
|---|---|
| 未授权访问 | 无 token 访问受保护接口返回 401 |
| 错误 token | 篡改/过期 token 返回 401 |
| SQL 注入 | 关键参数注入 `' OR 1=1--` 等无效果（Prisma 参数化） |
| XSS 注入 | 标题/内容含 `<script>` 入库后被剥离 |
| 弱密码 | 注册纯数字密码被拒绝（要求字母+数字） |
| 越权访问 | 用户 A 访问用户 B 的订单/工单返回 404 |
| 路径遍历 | `../../etc/passwd` 等参数无效果 |
| 大 payload | 超长字符串触发 413 / 400 |
| 频率限制 | 连续 6 次错误登录触发 429 |

#### 前端页面测试

使用 Playwright + Chrome DevTools Protocol 自动化测试，覆盖**全部 40 个前端页面**：

- 7 个公开页面（首页、商品、登录、注册等）
- 11 个用户后台页面（订单、产品、工单、财务等）
- 22 个管理后台页面（用户、商品、订单、SMTP、SMS 等）

每个页面验证：
- HTTP 200 可访问
- 页面有内容渲染（body 长度 > 50）
- 无控制台 JS 错误
- 截图保存到 `.test-shots/pages/`

### 测试脚本

测试脚本位于 `.test-shots/` 目录（不提交到仓库）：

- `api_test_v2.py`：API 功能测试（42 项）
- `api_test_v3.py`：下单 + 工单创建修复测试
- `api_test_v4.py`：精确状态码验证
- `frontend_test.py`：前端页面访问测试（40 项）
- `e2e_test.py`：端到端测试（API + 前端）

### 依赖安全审计

定期运行 `npm audit` 检查依赖漏洞：

```bash
cd server && npm audit
cd web && npm audit
```

已修复：
- `echarts` 升级到 6.1.0+（修复 XSS 漏洞 [GHSA-fgmj-fm8m-jvvx](https://github.com/advisories/GHSA-fgmj-fm8m-jvvx)）
- `vue-echarts` 升级到 8.0.1（兼容 echarts 6）

后端剩余漏洞主要为 `@nestjs/cli` 及其传递依赖（开发依赖，不影响运行时），升级需要 NestJS 11（破坏性变更），暂缓。

---

## 常见问题

### Q：启动后端报「生产环境密钥校验未通过，服务拒绝启动」？

A：`.env` 中的 `JWT_SECRET` / `ADMIN_JWT_SECRET` / `AES_SECRET` 仍是 `change-me` 占位符或长度不达标。用 `openssl rand -hex 32`（JWT）和 `openssl rand -hex 16`（AES）生成强随机密钥替换。重新执行 `deploy.sh` 会自动生成。

### Q：忘记向导访问令牌？

A：查看 `/opt/rainyun-reseller/deploy/.deploy-meta.json` 中的 `wizardToken` 字段。

### Q：向导已完成，想重新配置？

A：见上文 [重新配置](#重新配置) 章节。

### Q：端口被占用？

A：本项目使用软件默认端口（后端 3001 / 向导 8888 / MySQL 3306 / Redis 6379）。如某端口已被占用，修改对应配置文件：
- 后端：`server/.env` 的 `PORT`
- 向导：`deploy.sh` 的 `WIZARD_PORT`
- MySQL：`/etc/mysql/mysql.conf.d/mysqld.cnf` 的 `port`
- Redis：`/etc/redis/redis.conf` 的 `port`

### Q：前端能访问但 API 502？

A：检查 Nginx 反向代理是否指向 `http://127.0.0.1:3001`：
```bash
pm2 status                   # 确认 rainyun-api 在运行
curl http://127.0.0.1:3001/api/health   # 健康检查
pm2 logs rainyun-api --lines 50         # 查看后端日志
```

### Q：雨云 API 报 MOCK 模式？

A：`.env` 中 `RAINYUN_API_KEY` 为空时自动启用 MOCK 模式（所有上游操作本地模拟）。生产环境请在 [雨云控制台](https://app.rainyun.com/dev/api) 获取 API Key 后填入。

### Q：prisma migrate 报影子库错误？

A：需配置 `SHADOW_DATABASE_URL`（指向一个已创建的影子库），且业务库用户对该库有 CREATE 权限。一键部署脚本会自动创建影子库 `rainyun_reseller_shadow`。

### Q：注册时报「密码必须同时包含字母和数字」？

A：系统要求密码 8-32 位且**必须同时包含字母和数字**（防纯数字/纯字母弱口令）。例如 `Test@2026`、`MyPass123` 均合规，`12345678`、`password` 不合规。

### Q：登录频繁失败后无法登录？

A：触发速率限制（5 次/分钟）。等待 60 秒后重试，或检查密码是否正确。

### Q：如何查看管理员操作日志？

A：管理后台 → 审计日志（`/admin/audit-logs`），可按操作人/操作类型/时间范围筛选。

### Q：如何修改站点名称、Logo 等信息？

A：管理后台 → 系统配置（`/admin/system`）修改站点信息。部分配置（如域名）需同步修改 `.env` 后重启服务。

### Q：邮件发送失败？

A：检查管理后台 → SMTP 配置（`/admin/smtp`）：
1. SMTP 服务器地址、端口、加密方式是否正确
2. 发件人邮箱、用户名、密码是否正确
3. 查看 SMTP 日志（`/admin/smtp/logs`）获取详细错误
4. 测试发送功能验证配置

### Q：短信验证码发送失败？

A：检查管理后台 → 短信配置（`/admin/sms`）：
1. 阿里云 AccessKey ID / Secret 是否正确
2. 是否已开通号码认证服务（PNVS）
3. 模板 ID / 签名名称是否匹配
4. 测试发送功能验证配置

---

## 许可证

MIT License © 2026 KeYuCloud
