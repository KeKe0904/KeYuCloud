#!/usr/bin/env bash
# ============================================================================
# 雨云服务器分销平台 - 一键部署脚本 (v1.1.0)
# ----------------------------------------------------------------------------
# 功能：
#   1. 检测/安装/升级环境依赖（Node.js LTS / MySQL / Redis / Nginx / PM2 / Git）
#   2. 自动拉取/更新仓库代码
#   3. 交互式数据库配置（密码必填，其他可默认）
#   4. 交互式域名配置（自动检测连通性，可重试/跳过）
#   5. 交互式 SSL 配置（跳过 / 已有证书 / 自动申请 Let's Encrypt）
#   6. 构建 + 启动网页外部向导（向导完成管理员账号配置与前后端启动）
#
# 用法：
#   chmod +x deploy.sh && ./deploy.sh                              # 交互式
#   DEPLOY_NONINTERACTIVE=1 DB_USER=... DB_PASS=... ./deploy.sh    # 非交互式（CI）
#
# 非交互式环境变量（DEPLOY_NONINTERACTIVE=1 时生效）：
#   DB_NAME          数据库名（默认 rainyun_reseller）
#   DB_USER          数据库用户（默认 rainyun）
#   DB_PASS          数据库密码（必填）
#   DB_HOST          数据库主机（默认 127.0.0.1）
#   DB_PORT          数据库端口（默认 2009）
#   DOMAIN           站点域名（可留空）
#   SSL_MODE         SSL 模式（none/custom/letsencrypt，默认 none）
#   SITE_URL         站点完整 URL（覆盖 DOMAIN+SSL_MODE 计算）
#   REPO_URL         Git 仓库 URL
#   REPO_BRANCH      Git 分支（默认 main）
#   APP_DIR          应用目录（默认 /opt/rainyun-reseller）
#   WIZARD_PORT      向导端口（默认 7432）
#   RAINYUN_API_KEY  雨云 API Key（可留空，使用 MOCK）
#
# 支持系统：Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / RHEL 9+
# ============================================================================

set -euo pipefail

# 非交互模式标志
DEPLOY_NONINTERACTIVE="${DEPLOY_NONINTERACTIVE:-0}"

# ---------- 全局变量 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-/opt/rainyun-reseller}"
REPO_URL="${REPO_URL:-https://github.com/your-org/rainyun-reseller.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
WIZARD_PORT="${WIZARD_PORT:-7432}"
LOG_FILE="/var/log/rainyun-deploy.log"
STEP_FILE="/tmp/rainyun-deploy-step"

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
  local msg="$1" default="${2:-}" var env_name
  # 从 msg 推断环境变量名（简化处理：通过 caller 上下文由调用方提供）
  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    # 非交互模式：调用方应直接传值，这里返回默认值
    echo "$default"
    return
  fi
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
  echo "$pwd1"
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

# 记录进度步骤
save_step() { echo "$1" > "$STEP_FILE"; }
get_step()  { [[ -f "$STEP_FILE" ]] && cat "$STEP_FILE" || echo "0"; }

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

  # ----- 配置非默认端口（提升安全性，避免默认端口被扫描）-----
  configure_service_ports

  log "依赖检测与安装完成"
}

# 配置 MySQL / Redis 使用非默认端口
configure_service_ports() {
  # ===== MySQL 端口 2009 =====
  if has_cmd mysql; then
    local my_cnf=""
    for f in /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/my.cnf /etc/my.cnf /etc/mysql/conf.d/mysql.cnf; do
      [[ -f "$f" ]] && my_cnf="$f" && break
    done

    if [[ -n "$my_cnf" ]]; then
      # 检查当前实际端口
      local cur_port
      cur_port="$(mysql -uroot -N -e 'SHOW VARIABLES LIKE "port";' 2>/dev/null | awk '{print $2}')"
      if [[ "$cur_port" != "2009" ]]; then
        info "配置 MySQL 端口为 2009 (配置文件: $my_cnf)"
        # 备份
        cp "$my_cnf" "${my_cnf}.bak.$(date +%s)" 2>/dev/null || true
        # 在 [mysqld] 段下添加 port=2009
        if grep -q '^\s*\[mysqld\]' "$my_cnf"; then
          # 先删除已存在的 port 行
          sed -i '/^\s*port\s*=/d' "$my_cnf"
          # 在 [mysqld] 段后插入
          sed -i '/^\s*\[mysqld\]/a port=2009' "$my_cnf"
        else
          # 没有 [mysqld] 段，追加
          printf '\n[mysqld]\nport=2009\n' >> "$my_cnf"
        fi
        # 重启 MySQL
        if has_cmd systemctl; then
          systemctl restart mysql 2>/dev/null || systemctl restart mysqld 2>/dev/null || true
        fi
        sleep 2
        info "MySQL 端口已改为 2009"
      else
        info "MySQL 端口已为 2009，跳过"
      fi
    else
      warn "未找到 MySQL 配置文件，请手动修改 MySQL 端口为 2009"
    fi
  fi

  # ===== Redis 端口 2008 =====
  if has_cmd redis-cli; then
    local redis_cnf=""
    for f in /etc/redis/redis.conf /etc/redis.conf /etc/redis/redis-server.conf; do
      [[ -f "$f" ]] && redis_cnf="$f" && break
    done

    if [[ -n "$redis_cnf" ]]; then
      # 检查当前实际端口
      local cur_redis_port
      cur_redis_port="$(redis-cli -p 6379 ping 2>/dev/null && echo 6379 || (redis-cli -p 2008 ping 2>/dev/null && echo 2008 || echo ''))"
      if [[ "$cur_redis_port" == "6379" || -z "$cur_redis_port" ]]; then
        info "配置 Redis 端口为 2008 (配置文件: $redis_cnf)"
        cp "$redis_cnf" "${redis_cnf}.bak.$(date +%s)" 2>/dev/null || true
        # 替换或新增 port 行
        if grep -q '^\s*port\s' "$redis_cnf"; then
          sed -i 's/^\s*port\s\+.*/port 2008/' "$redis_cnf"
        else
          sed -i '/^\s*port\s*=/d' "$redis_cnf"
          printf '\nport 2008\n' >> "$redis_cnf"
        fi
        if has_cmd systemctl; then
          systemctl restart redis 2>/dev/null || systemctl restart redis-server 2>/dev/null || true
        fi
        sleep 2
        info "Redis 端口已改为 2008"
      else
        info "Redis 端口已为 2008，跳过"
      fi
    else
      warn "未找到 Redis 配置文件，请手动修改 Redis 端口为 2008"
    fi
  fi
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
# 步骤 3：数据库配置
# ============================================================================
configure_db() {
  step "步骤 3：数据库配置"

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

  # 业务数据库配置
  local db_name db_user db_pwd db_host db_port
  db_name="$(env_or_prompt 'DB_NAME' '数据库名' 'rainyun_reseller')"
  db_user="$(env_or_prompt 'DB_USER' '数据库用户' 'rainyun')"
  db_host="$(env_or_prompt 'DB_HOST' '数据库主机' '127.0.0.1')"
  db_port="$(env_or_prompt 'DB_PORT' '数据库端口' '2009')"

  if [[ "$DEPLOY_NONINTERACTIVE" == "1" ]]; then
    db_pwd="${DB_PASS:-}"
    if [[ -z "$db_pwd" ]]; then
      err "非交互模式下 DB_PASS 环境变量必填"
      exit 1
    fi
    info "非交互模式：从 DB_PASS 环境变量读取数据库密码"
  else
    echo -e "${C_CYAN}请为业务数据库用户 ${db_user} 设置密码（必须手动填写，建议 16 位以上强密码）${C_RESET}"
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

  info "数据库与用户创建成功"

  # 测试业务用户连接
  if ! mysql -h"$db_host" -P"$db_port" -u"$db_user" -p"$db_pwd" -e "USE \`$db_name\`; SELECT 1;" >/dev/null 2>&1; then
    err "业务用户连接失败，请检查配置"
    exit 1
  fi
  info "业务用户连接验证成功"

  # 保存到全局变量
  DB_NAME="$db_name"; DB_USER="$db_user"; DB_PWD="$db_pwd"
  DB_HOST="$db_host"; DB_PORT="$db_port"

  log "数据库配置完成"
}

# ============================================================================
# 步骤 4：域名配置
# ============================================================================
configure_domain() {
  step "步骤 4：域名配置"

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
      if confirm "是否跳过域名配置（后续可在网页向导中再次配置）？" "y"; then
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
# 步骤 5：SSL 配置
# ============================================================================
configure_ssl() {
  step "步骤 5：SSL 配置"

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
# 步骤 6：生成 .env、构建、配置 Nginx、启动向导
# ============================================================================
generate_env() {
  step "步骤 6：生成配置文件"

  cd "$APP_DIR/server"

  # 生成强随机密钥
  local jwt_secret admin_jwt_secret aes_secret
  jwt_secret="$(openssl rand -hex 32)"
  admin_jwt_secret="$(openssl rand -hex 32)"
  aes_secret="$(openssl rand -hex 32)"

  # 预先计算 UPDATE_REPO（owner/repo 格式），避免在 heredoc 中展开未定义变量
  # 注意：heredoc 中的 UPDATE_REPO=xxx 只是写入文件的内容，不会在 shell 中执行赋值
  # 所以必须在 heredoc 之前计算好，再在 heredoc 中引用 $UPDATE_REPO
  # 优先从 git remote 获取真实 URL（避免 REPO_URL 默认占位符 your-org/rainyun-reseller）
  local git_remote_url=""
  git_remote_url="$(cd "$APP_DIR" && git remote get-url origin 2>/dev/null || echo "")"
  if [[ -z "$git_remote_url" ]]; then
    git_remote_url="$REPO_URL"
  fi
  local update_repo="${git_remote_url#https://github.com/}"
  update_repo="${update_repo%.git}"
  # 如果是 SSH 格式（git@github.com:owner/repo.git），也处理一下
  update_repo="${update_repo#git@github.com:}"

  local site_url
  if [[ -n "$DOMAIN" ]]; then
    if [[ "$SSL_MODE" != "none" ]]; then
      site_url="https://$DOMAIN"
    else
      site_url="http://$DOMAIN"
    fi
  else
    local server_ip
    server_ip="$(curl -sS --max-time 5 ifconfig.me 2>/dev/null || echo 'localhost')"
    site_url="http://$server_ip"
  fi

  cat > .env <<EOF
# ===========================================
# 雨云服务器分销平台 v1.1.0 - 生产配置
# 由 deploy.sh 自动生成于 $(date)
# ===========================================

# ===== 应用 =====
NODE_ENV=production
PORT=1001
CORS_ORIGIN=${site_url}

# ===== MySQL 数据库 =====
DATABASE_URL="mysql://${DB_USER}:${DB_PWD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
SHADOW_DATABASE_URL="mysql://${DB_USER}:${DB_PWD}@${DB_HOST}:${DB_PORT}/${DB_NAME}_shadow?schema=public"

# ===== Redis =====
REDIS_HOST=127.0.0.1
REDIS_PORT=2008
REDIS_PASSWORD=
REDIS_DB=0

# ===== JWT（强随机密钥）=====
JWT_SECRET=${jwt_secret}
JWT_EXPIRES_IN=7d
ADMIN_JWT_SECRET=${admin_jwt_secret}
ADMIN_JWT_EXPIRES_IN=1d

# ===== 雨云上游 =====
RAINYUN_API_KEY=
RAINYUN_API_BASE=https://api.v2.rainyun.com
RAINYUN_MOCK=true

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

# ===== 管理员初始账号（向导中配置）=====
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

  # 生成向导一次性令牌（用于保护网页向导 API，防止未授权访问）
  local wizard_token
  wizard_token="$(openssl rand -hex 16)"
  info "已生成向导令牌（用于网页向导认证）"

  # 保存部署元信息供向导使用
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
  "wizardPort": $WIZARD_PORT,
  "wizardToken": "$wizard_token",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  log "配置文件生成完成"
}

# 构建前后端
build_app() {
  step "步骤 7：构建前后端"

  cd "$APP_DIR/server"
  info "构建后端..."

  # 关键：确保 devDependencies 已安装（@nestjs/cli 在 devDependencies 中）
  # 兼容旧版 deploy.sh 可能用 npm ci --omit=dev 安装的情况
  if [[ ! -x "node_modules/.bin/nest" ]]; then
    warn "未找到 nest CLI（node_modules/.bin/nest），重新安装完整依赖（含 devDependencies）..."
    # 清除可能存在的 .bin 目录残留，避免符号链接损坏
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
  # 同样确保前端依赖完整
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

# 配置 Nginx
configure_nginx() {
  step "步骤 8：配置 Nginx"

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

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:1001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # 部署向导反向代理（仅部署期间可用，向导完成后服务自动关闭）
    # 通过 /setup-wizard/ 路径访问，无需开放 7432 端口
    location /setup-wizard/ {
        proxy_pass http://127.0.0.1:${WIZARD_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
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
        proxy_pass http://127.0.0.1:1001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /setup-wizard/ {
        proxy_pass http://127.0.0.1:${WIZARD_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
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

  # Let's Encrypt 自动申请
  if [[ "$SSL_MODE" == "letsencrypt" ]]; then
    info "申请 Let's Encrypt 证书..."
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect 2>&1 | tail -10; then
      log "Let's Encrypt 证书申请成功"
    else
      warn "Let's Encrypt 申请失败，请检查域名是否已正确解析到本机 80 端口"
    fi
  fi
}

# 启动向导服务
start_wizard() {
  step "步骤 9：启动网页外部向导"

  cd "$APP_DIR/deploy/setup-wizard"

  # 安装向导依赖（独立，轻量）
  if [[ -f package.json ]]; then
    info "安装向导依赖..."
    npm install --omit=dev 2>/dev/null || npm install
  fi

  # 用 PM2 启动向导（通过 shell 环境变量传递 APP_DIR 和 WIZARD_PORT）
  pm2 delete rainyun-wizard 2>/dev/null || true
  APP_DIR="$APP_DIR" WIZARD_PORT="$WIZARD_PORT" \
    pm2 start server.js --name rainyun-wizard --cwd "$APP_DIR/deploy/setup-wizard" 2>&1 | tail -5
  pm2 save 2>/dev/null || true

  # 向导通过 Nginx 反代 /setup-wizard/ 路径访问，不需要开放 7432 端口
  # 向导服务本身只监听 127.0.0.1:7432（仅本地），由 Nginx 转发
  local wizard_url
  if [[ -n "$DOMAIN" ]]; then
    if [[ "$SSL_MODE" == "letsencrypt" || "$SSL_MODE" == "custom" ]]; then
      wizard_url="https://$DOMAIN/setup-wizard/"
    else
      wizard_url="http://$DOMAIN/setup-wizard/"
    fi
  else
    local server_ip
    server_ip="$(curl -sS --max-time 5 ifconfig.me 2>/dev/null || echo 'localhost')"
    wizard_url="http://$server_ip/setup-wizard/"
  fi

  # 尝试放行防火墙端口（ufw / firewall-cmd / iptables）
  info "检查防火墙端口 $WIZARD_PORT ..."
  if command -v ufw >/dev/null 2>&1; then
    ufw allow "$WIZARD_PORT/tcp" >/dev/null 2>&1 && info "ufw 已放行 $WIZARD_PORT/tcp" || warn "ufw 放行失败（请手动放行）"
  elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --add-port="$WIZARD_PORT/tcp" --permanent >/dev/null 2>&1 && \
      firewall-cmd --reload >/dev/null 2>&1 && info "firewall-cmd 已放行 $WIZARD_PORT/tcp" || warn "firewall-cmd 放行失败（请手动放行）"
  elif command -v iptables >/dev/null 2>&1; then
    iptables -C INPUT -p tcp --dport "$WIZARD_PORT" -j ACCEPT 2>/dev/null || \
      iptables -I INPUT -p tcp --dport "$WIZARD_PORT" -j ACCEPT >/dev/null 2>&1 && info "iptables 已放行 $WIZARD_PORT/tcp" || true
  fi

  # 等待向导启动
  sleep 2

  # 本地健康检查
  local wizard_healthy=0
  for i in 1 2 3 4 5; do
    if curl -sS --max-time 2 "http://127.0.0.1:$WIZARD_PORT/" >/dev/null 2>&1; then
      wizard_healthy=1
      info "向导服务已就绪 (本地响应正常)"
      break
    fi
    sleep 1
  done
  if [[ $wizard_healthy -eq 0 ]]; then
    warn "向导服务本地无响应，请检查 PM2 日志: pm2 logs rainyun-wizard --lines 30"
  fi

  # 从 .deploy-meta.json 读取向导令牌
  local wizard_token=""
  if [[ -f "$APP_DIR/deploy/.deploy-meta.json" ]]; then
    wizard_token="$(grep -o '"wizardToken"[[:space:]]*:[[:space:]]*"[^"]*"' "$APP_DIR/deploy/.deploy-meta.json" | head -1 | sed 's/.*"wizardToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  fi

  cat <<EOF

${C_BOLD}${C_GREEN}============================================================
  部署脚本执行完成！
============================================================${C_RESET}

${C_CYAN}接下来请访问网页外部向导完成最后配置：${C_RESET}

${C_BOLD}${C_YELLOW}  👉 ${wizard_url}${C_RESET}

EOF

  if [[ -n "$wizard_token" ]]; then
    cat <<EOF
${C_BOLD}${C_RED}🔐 向导访问令牌（请妥善保管，访问向导时需要输入）：${C_RESET}
${C_BOLD}${C_YELLOW}  ${wizard_token}${C_RESET}

${C_CYAN}说明：向导页面首次加载时会要求输入此令牌，输入后方可继续配置。${C_RESET}
${C_CYAN}令牌仅用于本次部署期间的向导认证，向导完成后自动失效。${C_RESET}

EOF
  fi

  cat <<EOF
${C_CYAN}向导将引导你完成：${C_RESET}
  1. 环境检测
  2. 数据库连接验证（不会自动创建数据库）
  3. 域名配置（可二次填写）
  4. 配置超级管理员账号
  5. 启动前后端服务（启动后向导会自动关闭）

${C_CYAN}向导完成后即可正常访问站点：${C_RESET}
  ${site_url:-http://localhost}

${C_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C_RESET}
${C_BOLD}${C_RED}⚠️  如果无法访问向导，请检查以下三项：${C_RESET}
${C_YELLOW}1. 云服务商安全组：放行 TCP 80/443 端口（入站规则）${C_RESET}
${C_YELLOW}   - 向导通过主站 /setup-wizard/ 路径访问，无需开放 7432 端口${C_RESET}
${C_YELLOW}2. 确认 Nginx 已正常运行：systemctl status nginx${C_RESET}
${C_YELLOW}3. 确认向导进程在运行：pm2 logs rainyun-wizard --lines 20${C_RESET}
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
  雨云服务器分销平台 v1.1.0 - 一键部署脚本
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
  else
    info "运行模式: 交互式"
  fi

  mkdir -p "$(dirname "$LOG_FILE")"
  log "部署开始，日志文件: $LOG_FILE"

  install_deps
  pull_repo
  configure_db
  configure_domain
  configure_ssl
  generate_env
  build_app
  configure_nginx
  start_wizard

  log "部署脚本全部步骤完成"
}

main "$@"
