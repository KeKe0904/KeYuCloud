#!/usr/bin/env bash
# ============================================================================
# 雨云服务器分销平台 - 一键部署脚本 (v2.0.0)
# ----------------------------------------------------------------------------
# 功能：在终端完成全部部署，无需任何网页向导
#   1. 检测/安装/升级环境依赖（Node.js LTS / MySQL / Redis / Nginx / PM2 / Git）
#   2. 自动拉取/更新仓库代码
#   3. 交互式数据库配置（建库 → 直接用于本项目，无需任何后续连接配置）
#   4. 雨云 API Key 配置（可跳过，使用 MOCK 模式）
#   5. 域名配置（自动检测连通性，可重试/跳过）
#   6. SSL 配置（跳过 / 已有证书 / 自动申请 Let's Encrypt）
#   7. 生成 .env（一次性写入所有收集的配置，包括 DATABASE_URL）
#   8. 构建前后端
#   9. 数据库迁移（prisma migrate deploy + db seed）
#  10. 配置超级管理员账号（在终端交互输入）
#  11. 配置 Nginx 反向代理（前端静态 + /api/ 反代）
#  12. 启动 PM2 后端进程 + 健康检查
#  13. 部署完成提示 + 防火墙放行
#
# 用法：
#   chmod +x deploy.sh && ./deploy.sh                              # 交互式
#   DEPLOY_NONINTERACTIVE=1 DB_PASS=... ADMIN_PASSWORD=... ./deploy.sh   # 非交互式（CI）
#
# 非交互式环境变量（DEPLOY_NONINTERACTIVE=1 时生效）：
#   DB_NAME              数据库名（默认 rainyun_reseller）
#   DB_USER              数据库用户（默认 rainyun）
#   DB_PASS              数据库密码（必填）
#   DB_HOST              数据库主机（默认 127.0.0.1）
#   DB_PORT              数据库端口（默认 3306）
#   RAINYUN_API_KEY      雨云 API Key（可留空，使用 MOCK）
#   DOMAIN               站点域名（可留空）
#   SSL_MODE             SSL 模式（none/custom/letsencrypt，默认 none）
#   ADMIN_USERNAME       管理员用户名（默认 admin）
#   ADMIN_PASSWORD       管理员密码（必填）
#   ADMIN_EMAIL          管理员邮箱（可留空）
#   REPO_URL             Git 仓库 URL
#   REPO_BRANCH          Git 分支（默认 main）
#   APP_DIR              应用目录（默认 /opt/rainyun-reseller）
#
# 支持系统：Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / RHEL 9+
# ============================================================================

set -euo pipefail

# 非交互模式标志
DEPLOY_NONINTERACTIVE="${DEPLOY_NONINTERACTIVE:-0}"

# ---------- 全局变量 ----------
APP_DIR="${APP_DIR:-/opt/rainyun-reseller}"
REPO_URL="${REPO_URL:-https://github.com/your-org/rainyun-reseller.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
# 端口策略（全部使用软件默认端口）：
#   - 前端（Nginx）：80（HTTP）/ 443（HTTPS，如配置 SSL）
#   - 后端（NestJS）：3001（仅 127.0.0.1，由 Nginx 反代）
#   - MySQL：3306 / Redis：6379（软件默认端口）
LOG_FILE="/var/log/rainyun-deploy.log"

# 颜色（仅在交互式时启用）
# 关键：用 $'...' ANSI-C quoting，让变量值是真正的 ANSI 转义符（ESC 字符），
# 而不是字面字符串 "\033[..."。这样在 cat <<EOF heredoc 中也能正确显示颜色。
if [[ -t 1 && "$DEPLOY_NONINTERACTIVE" != "1" ]]; then
  C_RED=$'\033[0;31m'; C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[0;33m'
  C_BLUE=$'\033[0;34m'; C_CYAN=$'\033[0;36m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_CYAN=''; C_BOLD=''; C_RESET=''
fi

# ---------- 工具函数 ----------
log()   { echo -e "${C_GREEN}[$(date +%H:%M:%S)]${C_RESET} $*" | tee -a "$LOG_FILE"; }
warn()  { echo -e "${C_YELLOW}[$(date +%H:%M:%S)] WARN:${C_RESET} $*" | tee -a "$LOG_FILE"; }
err()   { echo -e "${C_RED}[$(date +%H:%M:%S)] ERROR:${C_RESET} $*" | tee -a "$LOG_FILE"; }
info()  { echo -e "${C_CYAN}[$(date +%H:%M:%S)]${C_RESET} $*" | tee -a "$LOG_FILE"; }
step()  { echo -e "\n${C_BOLD}${C_BLUE}========== $* ==========${C_RESET}\n"; }

# 检测命令是否存在
has_cmd() { command -v "$1" >/dev/null 2>&1; }

# 检测 Linux 发行版
detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS_ID="$ID"
    OS_VERSION="$VERSION_ID"
  else
    err "无法识别操作系统（缺少 /etc/os-release），仅支持 Ubuntu/Debian/CentOS/RHEL"
    exit 1
  fi
}

# 包管理器封装
pkg_install() {
  case "$OS_ID" in
    ubuntu|debian|linuxmint)
      DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" >/dev/null 2>&1
      ;;
    centos|rhel|fedora|rocky|almalinux)
      if has_cmd dnf; then
        dnf install -y "$@" >/dev/null 2>&1
      else
        yum install -y "$@" >/dev/null 2>&1
      fi
      ;;
    *)
      err "不支持的发行版: $OS_ID"
      exit 1
      ;;
  esac
}

pkg_update() {
  case "$OS_ID" in
    ubuntu|debian|linuxmint)
      DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null 2>&1
      ;;
    centos|rhel|fedora|rocky|almalinux)
      if has_cmd dnf; then dnf makecache >/dev/null 2>&1; else yum makecache >/dev/null 2>&1; fi
      ;;
  esac
}

# 提示输入（带默认值）
# 非交互模式下从同名环境变量读取，若未设置则使用默认值
prompt() {
  local msg="$1" default="${2:-}" var
  if [[ -n "$default" ]]; then
    read -rp "$(echo -e "${C_CYAN}${msg}${C_RESET} [${default}]: ")" var
    echo "${var:-$default}"
  else
    read -rp "$(echo -e "${C_CYAN}${msg}${C_RESET}: ")" var
    echo "$var"
  fi
}

# 非交互模式下从环境变量读取值（带默认值）
# 用法：env_or_prompt "DB_NAME" "数据库名" "rainyun_reseller"
env_or_prompt() {
  local env_name="$1" msg="$2" default="${3:-}"
  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    local val="${!env_name:-$default}"
    echo "$val"
  else
    prompt "$msg" "$default"
  fi
}

# 提示密码（不回显）
# 用法：prompt_password "消息" [环境变量名] [--confirm]
# --confirm: 双重输入确认（适用于首次设置密码，避免输错）
prompt_password() {
  local msg="$1" env_name="${2:-}" confirm=0
  # 解析 --confirm 标志
  for arg in "${@:2}"; do
    [[ "$arg" == "--confirm" ]] && confirm=1
  done

  if [[ "$DEPLOY_NONINTERACTIVE" == "1" && -n "$env_name" ]]; then
    local val="${!env_name:-}"
    if [[ -z "$val" ]]; then
      err "非交互模式下 $env_name 环境变量必填"
      exit 1
    fi
    echo "$val"
    return
  fi

  local pwd1 pwd2
  while true; do
    read -rsp "$(echo -e "${C_CYAN}${msg}${C_RESET}: ")" pwd1
    echo
    [[ -n "$pwd1" ]] || { echo -e "${C_RED}密码不能为空${C_RESET}"; continue; }

    if [[ $confirm -eq 1 ]]; then
      read -rsp "$(echo -e "${C_CYAN}再次输入以确认${C_RESET}: ")" pwd2
      echo
      if [[ "$pwd1" != "$pwd2" ]]; then
        echo -e "${C_RED}两次输入的密码不一致，请重新输入${C_RESET}"
        continue
      fi
    fi
    break
  done
  # 关键：去掉所有换行符和回车符，防止密码（粘贴时混入换行）污染 heredoc / .env
  # 历史教训：用户粘贴密码时若剪贴板含换行，会导致 DATABASE_URL 跨行、dotenv 解析出含 \n 的密码
  printf '%s' "$pwd1" | tr -d '\r\n'
}

# 确认
confirm() {
  local msg="$1" default="${2:-y}"
  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    # 非交互模式总是返回默认值
    [[ "$default" =~ ^[Yy]$ ]]
    return
  fi
  read -rp "$(echo -e "${C_CYAN}${msg}${C_RESET} [${default}/n]: ")" ans
  [[ "${ans:-$default}" =~ ^[Yy]$ ]]
}

# URL 编码（RFC 3986）
# 用于把数据库密码里的特殊字符（@ # / : ? & = + " 等）编码为 %XX，
# 防止这些字符破坏 DATABASE_URL 的解析或 .env 的双引号配对。
# 解码由 Prisma / mysql2 驱动自动完成。
url_encode() {
  local string="$1" i char encoded=""
  for (( i=0; i<${#string}; i++ )); do
    char="${string:$i:1}"
    case "$char" in
      [a-zA-Z0-9.~_-]) encoded+="$char" ;;
      *) printf -v hex '%%%02X' "'$char"
         encoded+="$hex"
         ;;
    esac
  done
  printf '%s' "$encoded"
}

# ============================================================================
# 步骤 1：环境与依赖检测/安装/升级
# ============================================================================
install_deps() {
  step "步骤 1：检测与安装环境依赖"

  detect_os
  info "检测到系统: $OS_ID $OS_VERSION"

  # ----- 基础工具 -----
  pkg_update
  pkg_install curl wget ca-certificates gnupg lsb-release sudo tar unzip git >/dev/null 2>&1 || true

  # ----- Node.js LTS -----
  local need_node=1
  if has_cmd node; then
    local node_ver
    node_ver="$(node -v | sed 's/v//')"
    local node_major="${node_ver%%.*}"
    if (( node_major >= 20 )); then
      info "Node.js 已安装: $node_ver (满足 LTS 要求)"
      need_node=0
    else
      warn "Node.js 版本 $node_ver 过低（需 20+），将升级到 LTS"
    fi
  fi

  if (( need_node )); then
    info "安装 Node.js 22.x LTS (NodeSource)..."
    if [[ "$OS_ID" == "centos" || "$OS_ID" == "rhel" || "$OS_ID" == "rocky" || "$OS_ID" == "almalinux" || "$OS_ID" == "fedora" ]]; then
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
      pkg_install nodejs
    else
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
      pkg_install nodejs
    fi
    info "Node.js 已安装: $(node -v)"
  fi

  # ----- PM2 -----
  if has_cmd pm2; then
    info "PM2 已安装: $(pm2 -v)"
  else
    info "安装 PM2..."
    npm install -g pm2 >/dev/null 2>&1
    info "PM2 已安装: $(pm2 -v)"
  fi

  # ----- MySQL 8 -----
  if has_cmd mysql; then
    info "MySQL 已安装: $(mysql --version)"
  else
    info "安装 MySQL 8..."
    case "$OS_ID" in
      ubuntu|debian|linuxmint)
        pkg_install mysql-server >/dev/null 2>&1 || {
          warn "apt 安装 mysql-server 失败，尝试 MySQL 官方源..."
          curl -fsSL https://repo.mysql.com/mysql-apt-config.deb -o /tmp/mysql-config.deb
          DEBIAN_FRONTEND=noninteractive dpkg -i /tmp/mysql-config.deb >/dev/null 2>&1 || true
          apt-get update -y >/dev/null 2>&1
          DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-community-server >/dev/null 2>&1 || pkg_install mysql-server
        }
        ;;
      *)
        pkg_install mysql-server >/dev/null 2>&1 || warn "MySQL 自动安装失败，请手动安装 MySQL 8 后重跑脚本"
        ;;
    esac
    has_cmd mysql && info "MySQL 已安装: $(mysql --version)" || warn "MySQL 未安装成功"
  fi

  # 启动 MySQL 服务
  if has_cmd systemctl && has_cmd mysql; then
    systemctl start mysql 2>/dev/null || systemctl start mysqld 2>/dev/null || true
    systemctl enable mysql 2>/dev/null || systemctl enable mysqld 2>/dev/null || true
  fi

  # ----- Redis -----
  if has_cmd redis-cli; then
    info "Redis 已安装: $(redis-cli --version)"
  else
    info "安装 Redis..."
    pkg_install redis >/dev/null 2>&1 || pkg_install redis-server >/dev/null 2>&1 || warn "Redis 自动安装失败"
    has_cmd redis-cli && info "Redis 已安装: $(redis-cli --version)" || warn "Redis 未安装成功"
  fi

  if has_cmd systemctl && has_cmd redis-cli; then
    systemctl start redis 2>/dev/null || systemctl start redis-server 2>/dev/null || true
    systemctl enable redis 2>/dev/null || systemctl enable redis-server 2>/dev/null || true
  fi

  # ----- Nginx -----
  if has_cmd nginx; then
    info "Nginx 已安装: $(nginx -v 2>&1)"
  else
    info "安装 Nginx..."
    pkg_install nginx
    has_cmd nginx && info "Nginx 已安装: $(nginx -v 2>&1)" || warn "Nginx 未安装成功"
  fi

  if has_cmd systemctl && has_cmd nginx; then
    systemctl start nginx 2>/dev/null || true
    systemctl enable nginx 2>/dev/null || true
  fi

  # ----- 检测服务端口（使用软件默认端口：MySQL 3306 / Redis 6379）-----
  if has_cmd mysql; then
    local cur_port
    cur_port="$(mysql -uroot -N -e 'SHOW VARIABLES LIKE "port";' 2>/dev/null | awk '{print $2}')"
    if [[ -n "$cur_port" ]]; then
      info "MySQL 当前监听端口: $cur_port（软件默认 3306）"
    else
      warn "无法读取 MySQL 端口，请确认 MySQL 服务已启动"
    fi
  fi
  if has_cmd redis-cli; then
    if redis-cli -p 6379 ping 2>/dev/null | grep -q PONG; then
      info "Redis 监听端口: 6379（软件默认）"
    else
      warn "Redis 6379 端口未响应，请确认 Redis 服务已启动"
    fi
  fi

  log "依赖检测与安装完成"
}

# ============================================================================
# 步骤 2：拉取/更新仓库
# ============================================================================
pull_repo() {
  step "步骤 2：拉取/更新仓库代码"

  mkdir -p "$(dirname "$APP_DIR")"

  if [[ -d "$APP_DIR/.git" ]]; then
    info "仓库已存在，检查更新..."
    cd "$APP_DIR"
    git fetch origin "$REPO_BRANCH" >/dev/null 2>&1
    local local_commit remote_commit
    local_commit="$(git rev-parse HEAD)"
    remote_commit="$(git rev-parse "origin/$REPO_BRANCH")"
    if [[ "$local_commit" == "$remote_commit" ]]; then
      info "代码已是最新 ($local_commit)"
    else
      info "发现更新，拉取最新代码..."
      git reset --hard "origin/$REPO_BRANCH" >/dev/null 2>&1
      git pull origin "$REPO_BRANCH" >/dev/null 2>&1
      info "代码已更新到 $remote_commit"
    fi
  else
    info "克隆仓库到 $APP_DIR ..."
    git clone -b "$REPO_BRANCH" "$REPO_URL" "$APP_DIR" 2>&1 | tail -5
    cd "$APP_DIR"
  fi

  # 安装依赖（必须含 devDependencies：构建需要 @nestjs/cli/prisma/typescript）
  # 注意：不能用 --omit=dev，否则 nest build 会报 "nest: not found"
  if [[ -f "$APP_DIR/server/package.json" ]]; then
    info "安装后端依赖（含 devDependencies）..."
    if ! (cd "$APP_DIR/server" && npm ci 2>/dev/null); then
      warn "npm ci 失败（可能 package-lock.json 不一致），回退到 npm install..."
      (cd "$APP_DIR/server" && npm install) || {
        err "后端依赖安装失败"
        exit 1
      }
    fi
  fi
  if [[ -f "$APP_DIR/web/package.json" ]]; then
    info "安装前端依赖..."
    if ! (cd "$APP_DIR/web" && npm ci 2>/dev/null); then
      warn "前端 npm ci 失败，回退到 npm install..."
      (cd "$APP_DIR/web" && npm install) || {
        err "前端依赖安装失败"
        exit 1
      }
    fi
  fi

  # Prisma generate
  if [[ -f "$APP_DIR/server/prisma/schema.prisma" ]]; then
    info "生成 Prisma Client..."
    (cd "$APP_DIR/server" && npx prisma generate 2>/dev/null)
  fi

  log "仓库代码就绪"
}

# ============================================================================
# 步骤 3：数据库配置（建库后直接用于本项目，无需任何后续连接配置）
# ============================================================================
configure_db() {
  step "步骤 3：数据库配置（建库即用于本项目）"

  if ! has_cmd mysql; then
    err "MySQL 未安装，无法继续。请先安装 MySQL 8"
    exit 1
  fi

  # 检测是否能通过本机 root（无密码/sudo）连接 MySQL
  # 部署脚本本身已通过 SSH 以 root/sudo 身份运行，MySQL 也由本脚本安装，
  # root 权限由执行身份保证，不再要求用户单独输入 MySQL root 密码。
  local mysql_admin_cmd
  if mysql -uroot -e "SELECT 1" >/dev/null 2>&1; then
    mysql_admin_cmd=(mysql -uroot)
    info "已通过本机 root 账户连接 MySQL（无需密码）"
  elif sudo mysql -uroot -e "SELECT 1" >/dev/null 2>&1; then
    mysql_admin_cmd=(sudo mysql -uroot)
    info "已通过 sudo + root 连接 MySQL"
  else
    err "无法通过 root 连接 MySQL。请确认 MySQL 已启动且 root 可通过 unix_socket 登录。"
    warn "若 MySQL 已设置 root 密码，请先执行："
    warn "  sudo mysql -uroot -p -e \"ALTER USER 'root'@'localhost' IDENTIFIED WITH auth_socket;\""
    warn "或手动执行一次 mysql_secure_installation 后重新运行本脚本"
    exit 1
  fi

  echo -e "${C_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "${C_BOLD}${C_YELLOW}📌 数据库配置说明${C_RESET}"
  echo -e "${C_CYAN}本步骤将创建一个新的 MySQL 数据库和用户。${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}创建完成后将直接用于本项目（自动写入 .env 的 DATABASE_URL）${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}无需任何后续网页或终端再次配置数据库连接${C_RESET}"
  echo -e "${C_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"

  # 业务数据库配置
  local db_name db_user db_pwd db_host db_port
  db_name="$(env_or_prompt 'DB_NAME' '数据库名' 'rainyun_reseller')"
  db_user="$(env_or_prompt 'DB_USER' '数据库用户' 'rainyun')"
  db_host="$(env_or_prompt 'DB_HOST' '数据库主机' '127.0.0.1')"
  db_port="$(env_or_prompt 'DB_PORT' '数据库端口' '3306')"

  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    db_pwd="${DB_PASS:-}"
    if [[ -z "$db_pwd" ]]; then
      err "非交互模式下 DB_PASS 环境变量必填"
      exit 1
    fi
    info "非交互模式：从 DB_PASS 环境变量读取数据库密码"
  else
    echo -e "${C_CYAN}请为业务数据库用户 ${db_user} 设置密码（必须手动填写，建议 16 位以上强密码）${C_RESET}"
    echo -e "${C_YELLOW}该密码将作为本项目数据库连接密码（写入 .env 的 DATABASE_URL）${C_RESET}"
    echo -e "${C_YELLOW}为避免输入错误，需要输入两次确认${C_RESET}"
    db_pwd="$(prompt_password "$db_user 密码" "" --confirm)"
  fi

  # 简单强度校验
  if [[ ${#db_pwd} -lt 8 ]]; then
    err "数据库密码长度不足 8 位，请使用更强的密码"
    exit 1
  fi

  # 创建数据库和用户（使用 root 身份）
  info "创建数据库 $db_name 和用户 $db_user ..."
  "${mysql_admin_cmd[@]}" <<SQL >/dev/null 2>&1
CREATE DATABASE IF NOT EXISTS \`$db_name\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$db_user'@'%' IDENTIFIED BY '$db_pwd';
CREATE USER IF NOT EXISTS '$db_user'@'localhost' IDENTIFIED BY '$db_pwd';
ALTER USER '$db_user'@'%' IDENTIFIED BY '$db_pwd';
ALTER USER '$db_user'@'localhost' IDENTIFIED BY '$db_pwd';
GRANT ALL PRIVILEGES ON \`$db_name\`.* TO '$db_user'@'%';
GRANT ALL PRIVILEGES ON \`$db_name\`.* TO '$db_user'@'localhost';
FLUSH PRIVILEGES;
SQL

  # shadow 数据库（prisma migrate 需要）
  "${mysql_admin_cmd[@]}" -e "CREATE DATABASE IF NOT EXISTS \`${db_name}_shadow\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`${db_name}_shadow\`.* TO '$db_user'@'%'; GRANT ALL PRIVILEGES ON \`${db_name}_shadow\`.* TO '$db_user'@'localhost'; FLUSH PRIVILEGES;" >/dev/null 2>&1

  log "✓ 数据库 \`$db_name\` 与用户 \`$db_user\` 创建成功"

  # 测试业务用户连接
  if ! mysql -h"$db_host" -P"$db_port" -u"$db_user" -p"$db_pwd" -e "USE \`$db_name\`; SELECT 1;" >/dev/null 2>&1; then
    err "业务用户连接失败，请检查配置"
    exit 1
  fi
  log "✓ 业务用户连接验证成功"

  echo -e "${C_BOLD}${C_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}✅ 数据库已就绪${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}   该数据库将作为本项目唯一数据库，自动写入 .env${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}   DATABASE_URL=mysql://${db_user}:***@${db_host}:${db_port}/${db_name}${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}   无需再在任何地方二次配置数据库连接${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"

  # 保存到全局变量（供 generate_env 使用）
  DB_NAME="$db_name"; DB_USER="$db_user"; DB_PWD="$db_pwd"
  DB_HOST="$db_host"; DB_PORT="$db_port"

  log "数据库配置完成"
}

# ============================================================================
# 步骤 4：雨云 API Key 配置（可跳过，跳过则使用 MOCK 模式）
# ============================================================================
configure_api_key() {
  step "步骤 4：雨云 API Key 配置"

  RAINYUN_API_KEY=""
  RAINYUN_API_BASE="https://api.v2.rainyun.com"
  RAINYUN_MOCK="true"

  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    if [[ -n "${RAINYUN_API_KEY:-}" ]]; then
      RAINYUN_API_KEY="$RAINYUN_API_KEY"
      RAINYUN_MOCK="false"
      info "非交互模式：从 RAINYUN_API_KEY 读取 API Key"
    else
      info "非交互模式：未配置 API Key，使用 MOCK 模式"
    fi
    return
  fi

  echo -e "${C_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "${C_BOLD}${C_YELLOW}📌 雨云 API Key 配置${C_RESET}"
  echo -e "${C_CYAN}本平台通过雨云官方 API 对接上游服务（服务器/NAT 等）${C_RESET}"
  echo -e "${C_CYAN}需要填写雨云官方 API Key 才能正常运营${C_RESET}"
  echo -e "${C_CYAN}可在 https://app.rainyun.com/account/api 获取${C_RESET}"
  echo -e "${C_YELLOW}若暂时跳过，将使用 MOCK 模式（仅用于测试，无法实际对接上游）${C_RESET}"
  echo -e "${C_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"

  if confirm "是否现在配置雨云 API Key？" "y"; then
    local api_key api_base
    # 直接读取（不回显，使用 prompt_password 的不回显机制，但不需要确认）
    api_key="$(prompt_password "请输入雨云 API Key（16-256 字符）" "")"

    if [[ ${#api_key} -lt 16 ]]; then
      warn "API Key 长度不足 16 字符，疑似无效，将使用 MOCK 模式"
      return
    fi

    api_base="$(prompt '雨云 API Base URL' 'https://api.v2.rainyun.com')"

    RAINYUN_API_KEY="$api_key"
    RAINYUN_API_BASE="$api_base"
    RAINYUN_MOCK="false"
    log "✓ API Key 已配置（${#api_key} 字符），将在生成 .env 时写入"
  else
    log "已跳过 API Key 配置，使用 MOCK 模式（仅用于测试）"
  fi
}

# ============================================================================
# 步骤 5：域名配置
# ============================================================================
configure_domain() {
  step "步骤 5：域名配置"

  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    DOMAIN="${DOMAIN:-}"
    if [[ -z "$DOMAIN" ]]; then
      warn "非交互模式：未配置 DOMAIN，将使用服务器 IP 访问"
    else
      info "非交互模式：使用 DOMAIN=$DOMAIN"
    fi
    log "域名配置完成: ${DOMAIN:-（未配置，使用 IP）}"
    return
  fi

  while true; do
    local domain
    domain="$(prompt '请输入域名（如 www.example.com，留空跳过使用 IP）' '')"

    if [[ -z "$domain" ]]; then
      warn "未配置域名，将使用服务器 IP 访问"
      DOMAIN=""
      break
    fi

    info "检测域名 $domain 是否解析到本服务器..."
    local server_ip domain_ip
    server_ip="$(curl -sS --max-time 5 ifconfig.me 2>/dev/null || curl -sS --max-time 5 ipinfo.io/ip 2>/dev/null || echo '')"
    domain_ip="$(getent hosts "$domain" 2>/dev/null | awk '{print $1}' | head -1)"

    if [[ -z "$server_ip" ]]; then
      warn "无法获取本服务器公网 IP，跳过连通性检测"
      DOMAIN="$domain"
      break
    fi

    if [[ -z "$domain_ip" ]]; then
      warn "无法解析域名 $domain（DNS 未生效或未配置）"
    else
      info "本机公网 IP: $server_ip"
      info "域名解析 IP: $domain_ip"
      if [[ "$server_ip" == "$domain_ip" ]]; then
        log "域名 $domain 已正确解析到本服务器"
        DOMAIN="$domain"
        break
      else
        warn "域名解析 IP ($domain_ip) 与本机 IP ($server_ip) 不一致"
      fi
    fi

    if confirm "域名未连通，是否重试？" "y"; then
      continue
    else
      if confirm "是否仍使用该域名继续（已配置 DNS 但本机检测不到时可选）？" "y"; then
        DOMAIN="$domain"
        break
      else
        DOMAIN=""
        break
      fi
    fi
  done

  log "域名配置完成: ${DOMAIN:-（未配置，使用 IP）}"
}

# ============================================================================
# 步骤 6：SSL 配置
# ============================================================================
configure_ssl() {
  step "步骤 6：SSL 配置"

  SSL_MODE="none"
  SSL_CERT=""
  SSL_KEY=""

  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    SSL_MODE="${SSL_MODE:-none}"
    info "非交互模式：使用 SSL_MODE=$SSL_MODE"
    log "SSL 配置完成: $SSL_MODE"
    return
  fi

  if [[ -z "$DOMAIN" ]]; then
    warn "未配置域名，跳过 SSL（SSL 需要域名）"
    return
  fi

  echo "请选择 SSL 配置方式："
  echo "  1) 跳过（使用 HTTP）"
  echo "  2) 使用已有证书"
  echo "  3) 自动申请免费 Let's Encrypt 证书"
  local choice
  choice="$(prompt '选择 [1-3]' '3')"

  case "$choice" in
    1)
      SSL_MODE="none"
      info "已选择跳过 SSL"
      ;;
    2)
      SSL_MODE="custom"
      SSL_CERT="$(prompt '证书文件路径 (fullchain.pem)' "/etc/ssl/certs/$DOMAIN.pem")"
      SSL_KEY="$(prompt '私钥文件路径 (privkey.pem)' "/etc/ssl/private/$DOMAIN.key")"
      if [[ ! -f "$SSL_CERT" || ! -f "$SSL_KEY" ]]; then
        warn "证书或私钥文件不存在，SSL 将降级为 HTTP"
        SSL_MODE="none"
      else
        info "已配置自定义证书: $SSL_CERT"
      fi
      ;;
    3)
      SSL_MODE="letsencrypt"
      info "将使用 certbot 申请 Let's Encrypt 免费证书"
      if ! has_cmd certbot; then
        info "安装 certbot..."
        pkg_install certbot python3-certbot-nginx >/dev/null 2>&1 || warn "certbot 安装失败，SSL 将降级为 HTTP"
      fi
      if ! has_cmd certbot; then
        SSL_MODE="none"
      fi
      ;;
    *)
      warn "无效选择，跳过 SSL"
      SSL_MODE="none"
      ;;
  esac

  log "SSL 配置完成: $SSL_MODE"
}

# ============================================================================
# 步骤 7：生成 .env（一次性写入所有收集的配置）
# ============================================================================
generate_env() {
  step "步骤 7：生成配置文件 .env"

  cd "$APP_DIR/server"

  # 生成强随机密钥
  local jwt_secret admin_jwt_secret aes_secret
  jwt_secret="$(openssl rand -hex 32)"
  admin_jwt_secret="$(openssl rand -hex 32)"
  # AES_SECRET 要求恰好 32 字节（32 个字符），用 openssl rand -hex 16 生成 32 个 hex 字符
  aes_secret="$(openssl rand -hex 16)"

  # 预先计算 UPDATE_REPO（owner/repo 格式）
  local git_remote_url=""
  git_remote_url="$(cd "$APP_DIR" && git remote get-url origin 2>/dev/null || echo "")"
  if [[ -z "$git_remote_url" ]]; then
    git_remote_url="$REPO_URL"
  fi
  local update_repo="${git_remote_url#https://github.com/}"
  update_repo="${update_repo%.git}"
  update_repo="${update_repo#git@github.com:}"

  # site_url 使用默认端口（80 HTTP / 443 HTTPS，不在 URL 中显示端口号）
  local site_url
  if [[ -n "$DOMAIN" ]]; then
    if [[ "$SSL_MODE" == "letsencrypt" || "$SSL_MODE" == "custom" ]]; then
      site_url="https://$DOMAIN"
    else
      site_url="http://$DOMAIN"
    fi
  else
    local server_ip
    server_ip="$(curl -sS --max-time 5 ifconfig.me 2>/dev/null || echo 'localhost')"
    site_url="http://$server_ip"
  fi

  # 关键：对数据库密码做 URL 编码，防止密码里的特殊字符（@ # / : ? & = + " 等）
  # 破坏 DATABASE_URL 的解析或 .env 的双引号配对。
  # Prisma / mysql2 驱动会自动 URL 解码，因此 MySQL 端的密码仍是原始值。
  local db_pwd_enc
  db_pwd_enc="$(url_encode "$DB_PWD")"

  cat > .env <<EOF
# ===========================================
# 雨云服务器分销平台 v2.0.0 - 生产配置
# 由 deploy.sh 自动生成于 $(date)
# ===========================================

# ===== 应用 =====
NODE_ENV=production
PORT=3001
CORS_ORIGIN=${site_url}

# ===== MySQL 数据库（步骤 3 创建，直接用于本项目，无需再次配置）=====
# 注：密码已 URL 编码，Prisma 会自动解码为原始密码连接 MySQL
DATABASE_URL="mysql://${DB_USER}:${db_pwd_enc}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
SHADOW_DATABASE_URL="mysql://${DB_USER}:${db_pwd_enc}@${DB_HOST}:${DB_PORT}/${DB_NAME}_shadow?schema=public"

# ===== Redis =====
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# ===== JWT（强随机密钥）=====
JWT_SECRET=${jwt_secret}
JWT_EXPIRES_IN=7d
ADMIN_JWT_SECRET=${admin_jwt_secret}
ADMIN_JWT_EXPIRES_IN=1d

# ===== 雨云上游 =====
RAINYUN_API_KEY=${RAINYUN_API_KEY}
RAINYUN_API_BASE=${RAINYUN_API_BASE}
RAINYUN_MOCK=${RAINYUN_MOCK}

# ===== 易支付（需在管理后台配置）=====
EPAY_PID=1000
EPAY_KEY=
EPAY_API_URL=
EPAY_NOTIFY_URL=${site_url}/api/payment/epay/notify
EPAY_RETURN_URL=${site_url}/payment/result

# ===== AES 加密（32 字节强随机）=====
AES_SECRET=${aes_secret}

# ===== 站点 =====
SITE_NAME=云服分销平台
SITE_URL=${site_url}

# ===== 管理员初始账号（步骤 9 创建）=====
INIT_ADMIN_USERNAME=admin
INIT_ADMIN_PASSWORD=

# ===== 文件上传 =====
UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE=10485760

# ===== 在线更新（v1.1.0 新增）=====
# 用于管理后台「强制更新」功能调用 GitHub Release API 检测新版本
# 格式: owner/repo（如 KeKe0904/KeYuCloud）
UPDATE_REPO=${update_repo}
EOF

  chmod 600 .env
  info ".env 文件已生成 (权限 600)"
  info "DATABASE_URL 已使用步骤 3 创建的数据库，无需任何后续配置"

  # 保存站点 URL 到全局变量（供 setup_admin / start_services 输出使用）
  SITE_URL="$site_url"

  # 保存部署元信息（用于后续运维查询）
  cat > "$APP_DIR/deploy/.deploy-meta.json" <<EOF
{
  "appDir": "$APP_DIR",
  "domain": "${DOMAIN:-}",
  "sslMode": "$SSL_MODE",
  "sslCert": "${SSL_CERT:-}",
  "sslKey": "${SSL_KEY:-}",
  "dbName": "$DB_NAME",
  "dbUser": "$DB_USER",
  "dbHost": "$DB_HOST",
  "dbPort": "$DB_PORT",
  "siteUrl": "$site_url",
  "rainyunMock": "$RAINYUN_MOCK",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  log "配置文件生成完成"
}

# ============================================================================
# 步骤 8：构建前后端
# ============================================================================
build_app() {
  step "步骤 8：构建前后端"

  cd "$APP_DIR/server"
  info "构建后端..."

  # 关键：确保 devDependencies 已安装（@nestjs/cli 在 devDependencies 中）
  if [[ ! -x "node_modules/.bin/nest" ]]; then
    warn "未找到 nest CLI（node_modules/.bin/nest），重新安装完整依赖（含 devDependencies）..."
    rm -rf node_modules/.bin 2>/dev/null
    if ! npm install >>"$LOG_FILE" 2>&1; then
      err "后端依赖安装失败，无法继续构建"
      err "  请手动执行: cd $APP_DIR/server && npm install"
      exit 1
    fi
    info "依赖安装完成，nest CLI 已就绪"
  fi

  # 生成 Prisma Client（确保最新）
  npx prisma generate >/dev/null 2>&1

  # 使用 node_modules/.bin/nest 直接调用，避免 npx 的 "could not determine executable" 问题
  if [[ -x "node_modules/.bin/nest" ]]; then
    info "执行 nest build..."
    if ! node_modules/.bin/nest build >>"$LOG_FILE" 2>&1; then
      err "后端构建失败"
      err "  日志: $LOG_FILE"
      err "  请检查 TypeScript 编译错误"
      exit 1
    fi
  else
    err "nest CLI 仍不存在，无法构建后端"
    err "  请手动执行: cd $APP_DIR/server && npm install && npm run build"
    exit 1
  fi
  info "后端构建完成"

  cd "$APP_DIR/web"
  info "构建前端..."
  if [[ ! -x "node_modules/.bin/vite" ]]; then
    warn "未找到 vite CLI，重新安装前端依赖..."
    npm install >>"$LOG_FILE" 2>&1 || {
      err "前端依赖安装失败"
      exit 1
    }
  fi
  if ! node_modules/.bin/vite build >>"$LOG_FILE" 2>&1; then
    err "前端构建失败"
    err "  日志: $LOG_FILE"
    exit 1
  fi
  info "前端构建完成"

  log "构建完成"
}

# ============================================================================
# 步骤 9：数据库迁移（prisma migrate deploy + db seed）
# ============================================================================
migrate_db() {
  step "步骤 9：数据库迁移"

  local server_dir="$APP_DIR/server"
  cd "$server_dir" || {
    err "后端目录不存在: $server_dir"
    exit 1
  }

  if [[ ! -f ".env" ]]; then
    err ".env 文件不存在，请先执行步骤 7（generate_env）"
    exit 1
  fi

  info "执行 prisma generate（生成 Prisma Client）..."
  if ! npx prisma generate >>"$LOG_FILE" 2>&1; then
    err "prisma generate 失败"
    err "  日志: $LOG_FILE"
    exit 1
  fi
  log "✓ Prisma Client 已生成"

  info "执行 prisma migrate deploy（应用所有未执行的迁移）..."
  # timeout 180 秒，避免迁移卡死
  if ! timeout 180 npx prisma migrate deploy >>"$LOG_FILE" 2>&1; then
    err "prisma migrate deploy 失败"
    err "  日志: $LOG_FILE"
    err "  请检查 DATABASE_URL 是否正确，以及业务库/影子库是否已创建"
    exit 1
  fi
  log "✓ 数据库迁移已应用"

  info "执行 prisma db seed（初始化种子数据）..."
  # seed 可能失败（已存在数据时），但不致命
  if ! npx prisma db seed >>"$LOG_FILE" 2>&1; then
    warn "prisma db seed 失败（不致命，可能数据已存在）"
  else
    log "✓ 种子数据已初始化"
  fi

  # 验证 Admin 表已创建
  if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PWD" "$DB_NAME" \
    -e "SELECT COUNT(*) AS admin_count FROM Admin;" >/dev/null 2>&1; then
    log "✓ Admin 表已就绪"
  else
    warn "Admin 表不存在或无法访问，将在下一步创建管理员时尝试"
  fi

  log "数据库迁移完成"
}

# ============================================================================
# 步骤 10：配置超级管理员账号（终端交互输入）
# ============================================================================
setup_admin() {
  step "步骤 10：配置超级管理员账号"

  local server_dir="$APP_DIR/server"
  cd "$server_dir" || {
    err "后端目录不存在: $server_dir"
    exit 1
  }

  echo -e "${C_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "${C_BOLD}${C_YELLOW}📌 超级管理员账号配置${C_RESET}"
  echo -e "${C_CYAN}将创建后台管理的超级管理员账号（role=SUPER_ADMIN）${C_RESET}"
  echo -e "${C_CYAN}若已存在同名管理员，将更新其密码${C_RESET}"
  echo -e "${C_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"

  local admin_user admin_pwd admin_email
  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    admin_user="${ADMIN_USERNAME:-admin}"
    admin_pwd="${ADMIN_PASSWORD:-}"
    admin_email="${ADMIN_EMAIL:-}"
    if [[ -z "$admin_pwd" ]]; then
      err "非交互模式下 ADMIN_PASSWORD 环境变量必填"
      exit 1
    fi
    info "非交互模式：ADMIN_USERNAME=$admin_user, ADMIN_EMAIL=${admin_email:-（未配置）}"
  else
    admin_user="$(prompt '管理员用户名（3-32 位字母数字_-）' 'admin')"

    # 密码强度校验循环
    while true; do
      echo -e "${C_CYAN}请设置管理员密码（≥8 位，必须字母开头，含数字 + 特殊字符）${C_RESET}"
      admin_pwd="$(prompt_password "管理员密码" "" --confirm)"

      # 强度校验：≥8 位
      if [[ ${#admin_pwd} -lt 8 ]]; then
        echo -e "${C_RED}密码长度不足 8 位，请重新输入${C_RESET}"
        continue
      fi
      # 字母开头
      if ! [[ "$admin_pwd" =~ ^[a-zA-Z] ]]; then
        echo -e "${C_RED}密码必须以字母开头，请重新输入${C_RESET}"
        continue
      fi
      # 含数字
      if ! [[ "$admin_pwd" =~ [0-9] ]]; then
        echo -e "${C_RED}密码必须包含至少一个数字，请重新输入${C_RESET}"
        continue
      fi
      # 含特殊字符
      if ! [[ "$admin_pwd" =~ [^a-zA-Z0-9] ]]; then
        echo -e "${C_RED}密码必须包含至少一个特殊字符，请重新输入${C_RESET}"
        continue
      fi
      break
    done

    admin_email="$(prompt '管理员邮箱（可留空）' '')"
  fi

  # 写入 INIT_ADMIN_USERNAME / INIT_ADMIN_PASSWORD 到 .env（用于 seed 兼容 + 后台登录）
  # 同时也作为 main.ts 启动校验的依据
  if grep -q "^INIT_ADMIN_USERNAME=" .env; then
    sed -i "s|^INIT_ADMIN_USERNAME=.*|INIT_ADMIN_USERNAME=${admin_user}|" .env
  else
    echo "INIT_ADMIN_USERNAME=${admin_user}" >> .env
  fi
  if grep -q "^INIT_ADMIN_PASSWORD=" .env; then
    sed -i "s|^INIT_ADMIN_PASSWORD=.*|INIT_ADMIN_PASSWORD=${admin_pwd}|" .env
  else
    echo "INIT_ADMIN_PASSWORD=${admin_pwd}" >> .env
  fi
  info ".env 已更新 INIT_ADMIN_USERNAME / INIT_ADMIN_PASSWORD"

  # 用 bcryptjs 同步生成哈希 + mysql 命令行写入数据库
  # 不走 Prisma ORM，也不依赖 mysql2 npm 包（Prisma 5.x 自带 MySQL 驱动，
  # 项目 package.json 不含 mysql2 依赖，原 node 脚本会因 require('mysql2/promise') 失败）
  # 此方案已在生产服务器上验证可用
  info "创建/更新超级管理员账号..."

  # 1) 用 bcryptjs.hashSync 同步生成哈希（避免 Promise 链问题）
  #    bcrypt 哈希形如 $2a$12$...，含 $ 字符；后续通过单引号 SQL 字面量传递，
  #    且在 bash 双引号内引用 ${admin_hash} 时变量值原样展开，$ 不会被二次解析
  local admin_hash
  admin_hash="$(node -e 'process.stdout.write(require("bcryptjs").hashSync(process.argv[1], 12))' "$admin_pwd" 2>&1)" || {
    err "bcrypt 哈希生成失败: $admin_hash"
    err "  请确认 server/node_modules/bcryptjs 已安装（npm ci 已包含）"
    exit 1
  }

  # 2) 校验哈希格式（bcrypt 哈希以 $2a$/$2b$/$2y$ 开头）
  if [[ ! "$admin_hash" =~ ^\$2[aby]\$[0-9]+\$ ]]; then
    err "bcrypt 哈希格式异常: $admin_hash"
    exit 1
  fi

  # 3) SQL 转义（将 ' 转为 ''，防注入；用户名/邮箱用户可控）
  local esc_user esc_email esc_hash
  esc_user="$(printf '%s' "$admin_user" | sed "s/'/''/g")"
  esc_hash="$(printf '%s' "$admin_hash" | sed "s/'/''/g")"
  if [[ -n "$admin_email" ]]; then
    esc_email="$(printf '%s' "$admin_email" | sed "s/'/''/g")"
  fi

  # 4) 构造 mysql 连接命令（使用步骤 3 创建的业务用户连接业务库）
  #    全局变量 DB_HOST/DB_PORT/DB_USER/DB_PWD/DB_NAME 在 configure_db() 中赋值
  local mysql_cmd
  mysql_cmd=(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PWD" "$DB_NAME")

  # 5) 检查 Admin 表是否存在
  local table_count
  table_count="$("${mysql_cmd[@]}" -N -B -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='Admin';" 2>&1)" || {
    err "无法查询 Admin 表: $table_count"
    err "  请确认 DB_USER=${DB_USER} 对数据库 ${DB_NAME} 有读权限"
    exit 1
  }
  # 去除可能的警告行（如 "mysql: [Warning] ..."）
  table_count="$(printf '%s' "$table_count" | tail -1 | tr -d '[:space:]')"
  if [[ "$table_count" != "1" ]]; then
    err "Admin 表不存在（table_count=$table_count），请先执行数据库迁移（步骤 9）"
    exit 1
  fi

  # 6) 检查同名管理员是否存在
  local same_count
  same_count="$("${mysql_cmd[@]}" -N -B -e "SELECT COUNT(*) FROM Admin WHERE username='${esc_user}';" 2>&1)" || {
    err "查询管理员失败: $same_count"
    exit 1
  }
  same_count="$(printf '%s' "$same_count" | tail -1 | tr -d '[:space:]')"

  # 7) INSERT 或 UPDATE（邮箱为空时写 NULL，与原 node 脚本行为一致）
  if [[ "$same_count" -gt 0 ]]; then
    local email_set
    if [[ -n "$admin_email" ]]; then
      email_set="email='${esc_email}', "
    else
      email_set="email=NULL, "
    fi
    "${mysql_cmd[@]}" -e "UPDATE Admin SET passwordHash='${esc_hash}', nickname='超级管理员', role='SUPER_ADMIN', status='ACTIVE', ${email_set}updatedAt=NOW() WHERE username='${esc_user}';" 2>&1 | grep -v '^mysql:' || true
    if [[ "${PIPESTATUS[0]}" -ne 0 ]]; then
      err "UPDATE Admin 失败"
      exit 1
    fi
    log "✓ 管理员密码已更新（用户名: ${admin_user}）"
  else
    local insert_sql
    if [[ -n "$admin_email" ]]; then
      insert_sql="INSERT INTO Admin (username, passwordHash, nickname, role, status, email, createdAt, updatedAt) VALUES ('${esc_user}', '${esc_hash}', '超级管理员', 'SUPER_ADMIN', 'ACTIVE', '${esc_email}', NOW(), NOW());"
    else
      insert_sql="INSERT INTO Admin (username, passwordHash, nickname, role, status, email, createdAt, updatedAt) VALUES ('${esc_user}', '${esc_hash}', '超级管理员', 'SUPER_ADMIN', 'ACTIVE', NULL, NOW(), NOW());"
    fi
    "${mysql_cmd[@]}" -e "$insert_sql" 2>&1 | grep -v '^mysql:' || true
    if [[ "${PIPESTATUS[0]}" -ne 0 ]]; then
      err "INSERT Admin 失败（可能用户名/邮箱唯一约束冲突）"
      err "  可登录 MySQL 检查：SELECT id, username, email FROM Admin;"
      exit 1
    fi
    log "✓ 超级管理员已创建（用户名: ${admin_user}）"
  fi

  echo -e "${C_BOLD}${C_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}✅ 超级管理员已就绪${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}   用户名: ${admin_user}${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}   邮箱:   ${admin_email:-（未配置）}${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}   后台登录: ${SITE_URL:-http://localhost}/admin${C_RESET}"
  echo -e "${C_BOLD}${C_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}"

  log "管理员账号配置完成"
}

# ============================================================================
# 步骤 11：配置 Nginx（前端静态 + /api/ 反代）
# ============================================================================
configure_nginx() {
  step "步骤 11：配置 Nginx"

  if ! has_cmd nginx; then
    warn "Nginx 未安装，跳过 Nginx 配置（需手动配置反向代理）"
    return
  fi

  local server_name
  if [[ -n "$DOMAIN" ]]; then
    server_name="$DOMAIN"
  else
    server_name="_"
  fi

  local nginx_conf="/etc/nginx/conf.d/rainyun-reseller.conf"
  cat > "$nginx_conf" <<EOF
# 雨云服务器分销平台 Nginx 配置
# 端口策略（全部使用默认端口）：
#   - 前端 HTTP：80（主入口，提供前端静态文件 + API 反代）
#   - 前端 HTTPS：443（仅 SSL_MODE != none 时启用）
#   - 后端 NestJS：3001（仅 127.0.0.1，由本配置反代 /api/）
server {
    listen 80;
    server_name $server_name;

    # 前端静态资源
    root $APP_DIR/web/dist;
    index index.html;

    # 上传文件大小限制
    client_max_body_size 10m;

    # SPA 路由回退
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API 反向代理 → 后端 3001
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

  if [[ "$SSL_MODE" == "custom" ]]; then
    cat >> "$nginx_conf" <<EOF

server {
    listen 443 ssl http2;
    server_name $server_name;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    root $APP_DIR/web/dist;
    index index.html;
    client_max_body_size 10m;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
EOF
  fi

  nginx -t 2>&1 && systemctl reload nginx
  info "Nginx 配置已写入 $nginx_conf"

  # Let's Encrypt 自动申请（使用 --nginx 插件，自动修改 nginx 配置）
  if [[ "$SSL_MODE" == "letsencrypt" ]]; then
    info "申请 Let's Encrypt 证书..."
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect 2>&1 | tail -10; then
      log "Let's Encrypt 证书申请成功"
    else
      warn "Let's Encrypt 申请失败，请检查："
      warn "  1. 域名 $DOMAIN 是否已正确解析到本机公网 IP"
      warn "  2. 云服务商安全组是否放行 TCP 80/443 端口"
      warn "  3. 本机 80 端口是否被其他进程占用"
      warn "降级为仅 HTTP（80 端口）继续，后续可手动执行 certbot 申请"
    fi
  fi
}

# ============================================================================
# 步骤 12：启动后端服务（PM2）
# ============================================================================
start_services() {
  step "步骤 12：启动后端服务"

  local server_dir="$APP_DIR/server"

  # 检查构建产物
  local server_entry=""
  for p in "$server_dir/dist/main.js" "$server_dir/dist/src/main.js"; do
    if [[ -f "$p" ]]; then
      server_entry="$p"
      break
    fi
  done
  if [[ -z "$server_entry" ]]; then
    err "后端入口文件不存在（dist/main.js 或 dist/src/main.js），请先执行 build_app"
    exit 1
  fi
  if [[ ! -f "$APP_DIR/web/dist/index.html" ]]; then
    err "前端构建产物不存在（web/dist/index.html），请先执行 build_app"
    exit 1
  fi

  if ! has_cmd pm2; then
    err "PM2 未安装，无法启动服务"
    exit 1
  fi

  info "启动后端服务（PM2 进程名: rainyun-api）..."
  pm2 delete rainyun-api 2>/dev/null || true
  pm2 start "$server_entry" --name rainyun-api --cwd "$server_dir" 2>&1 | tail -5
  pm2 save 2>/dev/null || true
  log "✓ 后端进程已启动"

  info "等待后端启动（3 秒）..."
  sleep 3

  # 健康检查
  info "健康检查 http://127.0.0.1:3001/api/health ..."
  local healthy=0
  for i in 1 2 3 4 5; do
    local resp
    resp="$(curl -sS --max-time 5 http://127.0.0.1:3001/api/health 2>/dev/null || echo '')"
    if echo "$resp" | grep -q '"status":"ok"'; then
      healthy=1
      log "✓ 后端健康检查通过（第 $i 次尝试）"
      break
    fi
    warn "第 $i 次健康检查未通过，等待 2 秒重试..."
    sleep 2
  done

  if [[ $healthy -eq 0 ]]; then
    err "后端健康检查未通过"
    err "  最近日志："
    pm2 logs rainyun-api --nostream --lines 20 2>&1 | tail -25 | sed 's/^/    /'
    err "  请检查后端日志: pm2 logs rainyun-api --lines 50"
    err "  常见原因:"
    err "    1. .env 中密钥长度不合规（AES_SECRET 必须 32 字符，JWT_SECRET ≥32 字符）"
    err "    2. DATABASE_URL 无法连接"
    err "    3. 数据库未迁移"
    exit 1
  fi

  # 写入部署完成标记
  cat > "$APP_DIR/deploy/.deploy-done" <<EOF
{
  "completedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "siteUrl": "${SITE_URL:-}",
  "domain": "${DOMAIN:-}",
  "deployVersion": "2.0.0"
}
EOF

  log "✓ 部署完成标记已写入"
  log "服务启动完成"
}

# ============================================================================
# 步骤 13：部署完成提示 + 防火墙放行
# ============================================================================
deploy_complete() {
  step "步骤 13：部署完成"

  # 放行防火墙端口：80（HTTP）/ 443（HTTPS，如配置 SSL）
  info "检查防火墙端口 80（HTTP）..."
  if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp >/dev/null 2>&1 && info "ufw 已放行 80/tcp"
    [[ "$SSL_MODE" != "none" ]] && ufw allow 443/tcp >/dev/null 2>&1
  elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --add-port=80/tcp --permanent >/dev/null 2>&1
    [[ "$SSL_MODE" != "none" ]] && firewall-cmd --add-port=443/tcp --permanent >/dev/null 2>&1
    firewall-cmd --reload >/dev/null 2>&1
    info "firewall-cmd 已放行前端端口"
  elif command -v iptables >/dev/null 2>&1; then
    iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || \
      iptables -I INPUT -p tcp --dport 80 -j ACCEPT >/dev/null 2>&1
    [[ "$SSL_MODE" != "none" ]] && {
      iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || \
        iptables -I INPUT -p tcp --dport 443 -j ACCEPT >/dev/null 2>&1
    }
    info "iptables 已放行前端端口"
  fi

  cat <<EOF

${C_BOLD}${C_GREEN}============================================================
  🎉 部署全部完成！
============================================================${C_RESET}

${C_BOLD}${C_CYAN}站点信息：${C_RESET}
  前台首页: ${C_BOLD}${C_YELLOW}${SITE_URL:-http://localhost}${C_RESET}
  后台管理: ${C_BOLD}${C_YELLOW}${SITE_URL:-http://localhost}/admin${C_RESET}

${C_BOLD}${C_CYAN}PM2 进程：${C_RESET}
  - rainyun-api（后端 NestJS，端口 3001）
  常用命令:
    pm2 list                              # 查看进程
    pm2 logs rainyun-api --lines 50       # 查看日志
    pm2 restart rainyun-api               # 重启后端
    pm2 save                              # 保存进程列表

${C_BOLD}${C_CYAN}常用运维：${C_RESET}
  - Nginx 配置: /etc/nginx/conf.d/rainyun-reseller.conf
  - 后端 .env:  $APP_DIR/server/.env
  - 部署元信息: $APP_DIR/deploy/.deploy-meta.json
  - 部署日志:   $LOG_FILE

${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
${C_BOLD}${C_RED}⚠️  如果无法访问站点，请检查以下三项：${C_RESET}
${C_YELLOW}1. 云服务商安全组：放行 TCP 80 端口（HTTP 入站规则）${C_RESET}
${C_YELLOW}   $([ "$SSL_MODE" != "none" ] && echo "   若配置 SSL，还需放行 TCP 443 端口（HTTPS）")
${C_YELLOW}2. 确认 Nginx 已正常运行：systemctl status nginx${C_RESET}
${C_YELLOW}3. 确认后端进程在运行：pm2 logs rainyun-api --lines 20${C_RESET}
${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}

EOF
}

# ============================================================================
# 主流程
# ============================================================================
main() {
  echo -e "${C_BOLD}${C_GREEN}"
  cat <<'EOF'
============================================================
  雨云服务器分销平台 v2.0.0 - 一键部署脚本
  （终端完成全部操作，无需任何网页向导）
============================================================
EOF
  echo -e "${C_RESET}"

  # root 检查（非交互模式跳过，便于在容器中以非 root 用户运行）
  if [[ $EUID -ne 0 && "$DEPLOY_NONINTERACTIVE" != "1" ]]; then
    err "请使用 root 用户运行（或 sudo）"
    err "非交互模式（DEPLOY_NONINTERACTIVE=1）下不强制 root，但需自行确保权限"
    exit 1
  fi

  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    info "运行模式: 非交互式（CI/自动化）"
    # 非交互模式必填校验
    if [[ -z "${DB_PASS:-}" ]]; then
      err "非交互模式下 DB_PASS 环境变量必填"
      exit 1
    fi
    if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
      err "非交互模式下 ADMIN_PASSWORD 环境变量必填"
      exit 1
    fi
  else
    info "运行模式: 交互式（终端完成全部配置）"
  fi

  mkdir -p "$(dirname "$LOG_FILE")"
  log "部署开始，日志文件: $LOG_FILE"

  install_deps
  pull_repo
  configure_db
  configure_api_key
  configure_domain
  configure_ssl
  generate_env
  build_app
  migrate_db
  setup_admin
  configure_nginx
  start_services
  deploy_complete

  log "部署脚本全部步骤完成"
}

main "$@"
