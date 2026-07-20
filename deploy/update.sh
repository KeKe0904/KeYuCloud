#!/usr/bin/env bash
# ============================================================================
# 雨云服务器分销平台 - 一键更新脚本 (v1.1.0)
# ----------------------------------------------------------------------------
# 8 步流程：
#   1. preflight_check   前置检查（git 仓库 / PM2）
#   2. backup_env_and_db 备份 .env 与数据库
#   3. pull_latest_code  拉取最新代码（带冲突自动处理）
#   4. install_dependencies 安装依赖
#   5. migrate_database  数据库迁移
#   6. build_app         构建前后端
#   7. restart_services  重启服务
#   8. health_check      健康检查
#   9. cleanup_old_backups 清理旧备份
#
# 用法：
#   bash deploy/update.sh                 # 交互式
#   DEPLOY_NONINTERACTIVE=1 bash deploy/update.sh   # 非交互式（CI/自动触发）
#
# 设计要点：
#   - 所有步骤幂等可重入
#   - git 冲突自动 stash -> pull -> pop；pop 失败时回滚并清晰报错
#   - 失败时打印已完成的步骤，便于后续 resume
#   - 不会因 PM2 reload 杀死当前 HTTP 连接而丢日志
# ============================================================================

set -uo pipefail

# 关键：忽略 SIGHUP 信号
# 当 update.sh 被 force-update API 触发时，其父进程是 rainyun-api (Node.js)。
# PM2 reload 会杀死旧的 rainyun-api 进程，可能导致 SIGHUP 传播到 update.sh。
# 即使 Node.js spawn 使用 detached:true + setsid，某些 PM2 版本仍会向整个进程组发信号。
# 忽略 SIGHUP 确保 update.sh 能在 PM2 reload 后继续执行。
trap '' SIGHUP
trap '' SIGPIPE

# ---------- 全局变量 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
LOG_DIR="${APP_DIR}/deploy/.update-logs"
BACKUP_DIR="${APP_DIR}/deploy/.backups"
LOCK_FILE="${APP_DIR}/deploy/.update-lock"
STATE_FILE="${APP_DIR}/deploy/.update-state"
STEP_FILE="${APP_DIR}/deploy/.update-step"
# 自更新机制：如果 update.sh 自身在 git pull 后被更新，exec 重新执行时会继承原日志文件
# 关键：不继承会导致日志断裂，无法通过 update-status API 看到完整日志
if [[ -n "${_INHERIT_UPDATE_LOG:-}" && -f "${_INHERIT_UPDATE_LOG:-}" ]]; then
  UPDATE_LOG="$_INHERIT_UPDATE_LOG"
else
  UPDATE_LOG="${LOG_DIR}/update-$(date +%Y%m%d-%H%M%S).log"
fi

# 是否已调度 finish 脚本（PM2 reload + 健康检查 + 清理）
# 当此值为 1 时，on_exit 不会清理锁文件，由 finish 脚本负责清理
FINISH_DISPATCHED=0

mkdir -p "$LOG_DIR" "$BACKUP_DIR"

# 颜色（仅在交互式时启用）
if [[ -t 1 && "${DEPLOY_NONINTERACTIVE:-0}" != "1" ]]; then
  C_RED='\033[0;31m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'
  C_BLUE='\033[0;34m'; C_CYAN='\033[0;36m'; C_BOLD='\033[1m'; C_RESET='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_CYAN=''; C_BOLD=''; C_RESET=''
fi

# ---------- 工具函数 ----------
# 日志同时输出到控制台与日志文件
log()   { echo -e "${C_GREEN}[$(date +%H:%M:%S)]${C_RESET} $*" | tee -a "$UPDATE_LOG" >&2; }
warn()  { echo -e "${C_YELLOW}[$(date +%H:%M:%S)] WARN:${C_RESET} $*" | tee -a "$UPDATE_LOG" >&2; }
err()   { echo -e "${C_RED}[$(date +%H:%M:%S)] ERROR:${C_RESET} $*" | tee -a "$UPDATE_LOG" >&2; }
info()  { echo -e "${C_CYAN}[$(date +%H:%M:%S)]${C_RESET} $*" | tee -a "$UPDATE_LOG" >&2; }
step()  { echo -e "\n${C_BOLD}${C_BLUE}========== $* ==========${C_RESET}\n" | tee -a "$UPDATE_LOG" >&2; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

# 保存当前执行步骤（用于失败后恢复）
save_step() { echo "$1" > "$STEP_FILE"; }
get_step()  { [[ -f "$STEP_FILE" ]] && cat "$STEP_FILE" || echo "0"; }

# 写入状态文件（供 force-update API 异步查询）
write_state() {
  local status="$1" message="$2" progress="${3:-0}"
  cat > "$STATE_FILE" <<EOF
{
  "status": "$status",
  "message": "$message",
  "progress": $progress,
  "step": "$(get_step)",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "logFile": "$UPDATE_LOG"
}
EOF
}

# 退出处理
on_error() {
  local exit_code=$?
  err "更新失败（退出码 $exit_code），已完成步骤：$(get_step)"
  err "日志文件: $UPDATE_LOG"
  write_state "FAILED" "更新失败：步骤 $(get_step) 出错（退出码 $exit_code）" "$(get_step)"
  exit $exit_code
}
trap 'on_error' ERR

# 退出成功/失败：始终释放锁（失败状态已写入 state 文件）
# 例外：如果已调度 finish 脚本（FINISH_DISPATCHED=1），锁文件由 finish 脚本负责清理
on_exit() {
  if [[ "${FINISH_DISPATCHED:-0}" -eq 1 ]]; then
    return
  fi
  rm -f "$LOCK_FILE"
}
trap 'on_exit' EXIT

# ============================================================================
# 步骤 0：前置检查
# ============================================================================
preflight_check() {
  step "步骤 1/9：前置检查"
  save_step "1"

  if [[ ! -d "$APP_DIR/.git" ]]; then
    err "应用目录 $APP_DIR 不是 git 仓库，无法执行更新"
    err "请先使用 deploy.sh 一键部署脚本初始化项目"
    exit 1
  fi

  if ! has_cmd git; then
    err "git 未安装"
    exit 1
  fi

  if ! has_cmd pm2; then
    err "PM2 未安装"
    exit 1
  fi

  if ! has_cmd node; then
    err "Node.js 未安装"
    exit 1
  fi

  # 检查更新锁（防止并发执行）
  if [[ -f "$LOCK_FILE" ]]; then
    local lock_pid lock_age
    lock_pid=$(grep -o 'pid:[0-9]*' "$LOCK_FILE" | cut -d: -f2 || echo "")
    lock_age=$(($(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0)))
    # 锁超过 1 小时视为僵尸锁
    if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null && [[ $lock_age -lt 3600 ]]; then
      err "已有更新进程 (PID $lock_pid) 正在运行，请等待其完成"
      err "如确认无更新在进行，可删除 $LOCK_FILE 后重试"
      exit 1
    else
      warn "发现僵尸更新锁（PID $lock_pid, ${lock_age}s），自动清理"
      rm -f "$LOCK_FILE"
    fi
  fi
  echo "pid:$$ started:$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOCK_FILE"

  # 检查 .env 文件
  if [[ ! -f "$APP_DIR/server/.env" ]]; then
    err "未找到 server/.env 文件，请先执行 deploy.sh 完成部署"
    exit 1
  fi

  info "应用目录: $APP_DIR"
  info "Git 分支: $(cd "$APP_DIR" && git rev-parse --abbrev-ref HEAD)"
  info "当前 commit: $(cd "$APP_DIR" && git rev-parse --short HEAD)"
  info "Node: $(node -v) / npm: $(npm -v) / PM2: $(pm2 -v)"

  write_state "RUNNING" "前置检查通过" 1
  log "前置检查完成"
}

# ============================================================================
# 步骤 2：备份 .env 与数据库
# ============================================================================
backup_env_and_db() {
  step "步骤 2/9：备份 .env 与数据库"
  save_step "2"

  local backup_name="backup-$(date +%Y%m%d-%H%M%S)"
  local backup_path="$BACKUP_DIR/$backup_name"
  mkdir -p "$backup_path"

  # 备份 .env
  if [[ -f "$APP_DIR/server/.env" ]]; then
    cp "$APP_DIR/server/.env" "$backup_path/env.bak"
    info "已备份 .env -> $backup_path/env.bak"
  fi

  # 备份部署元信息
  if [[ -f "$APP_DIR/deploy/.deploy-meta.json" ]]; then
    cp "$APP_DIR/deploy/.deploy-meta.json" "$backup_path/deploy-meta.bak"
    info "已备份 .deploy-meta.json"
  fi

  # 备份数据库（如果配置了 DATABASE_URL）
  local db_url
  db_url=$(grep -E '^DATABASE_URL=' "$APP_DIR/server/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' || echo "")
  if [[ -n "$db_url" ]] && has_cmd mysqldump; then
    info "开始备份数据库..."
    # 解析 DATABASE_URL: mysql://user:pass@host:port/dbname
    local db_user db_pass db_host db_port db_name
    if [[ "$db_url" =~ mysql://([^:]+):([^@]*)@([^:]+):([0-9]+)/([^?]+) ]]; then
      db_user="${BASH_REMATCH[1]}"
      db_pass="${BASH_REMATCH[2]}"
      db_host="${BASH_REMATCH[3]}"
      db_port="${BASH_REMATCH[4]}"
      db_name="${BASH_REMATCH[5]}"
    elif [[ "$db_url" =~ mysql://([^:]+):([^@]*)@([^/]+)/([^?]+) ]]; then
      db_user="${BASH_REMATCH[1]}"
      db_pass="${BASH_REMATCH[2]}"
      db_host="${BASH_REMATCH[3]}"
      db_port="3306"
      db_name="${BASH_REMATCH[4]}"
    else
      db_user=""; db_pass=""; db_host=""; db_port=""; db_name=""
    fi

    if [[ -n "$db_user" && -n "$db_host" && -n "$db_name" ]]; then
      local dump_file="$backup_path/db.sql.gz"
      if mysqldump -h"$db_host" -P"$db_port" -u"$db_user" -p"$db_pass" \
          --single-transaction --routines --triggers --no-tablespaces \
          "$db_name" 2>"$backup_path/mysqldump.err" | gzip > "$dump_file"; then
        info "数据库已备份 -> $dump_file ($(du -h "$dump_file" | cut -f1))"
      else
        warn "数据库备份失败（不影响更新，详见 $backup_path/mysqldump.err）"
      fi
    fi
  else
    warn "未配置 DATABASE_URL 或未安装 mysqldump，跳过数据库备份"
  fi

  # 写入备份清单
  cat > "$backup_path/MANIFEST" <<EOF
backup_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
app_dir=$APP_DIR
commit_before=$(cd "$APP_DIR" && git rev-parse HEAD)
EOF

  write_state "RUNNING" "备份完成: $backup_name" 2
  log "备份完成"
}

# ============================================================================
# 步骤 3：拉取最新代码（修复 git 冲突错误提示）
# ============================================================================
pull_latest_code() {
  step "步骤 3/9：拉取最新代码"
  save_step "3"

  # 记录 update.sh 自身的 hash（用于 git pull 后的自更新检测）
  # 关键：update.sh 已被 bash 加载到内存，git pull 拉取的新版本不会自动生效
  #       若检测到自身变化，需 exec 重新执行以加载新逻辑
  local _self_script_path="${BASH_SOURCE[0]}"
  local _self_old_hash=""
  if [[ -f "$_self_script_path" ]]; then
    _self_old_hash=$(sha256sum "$_self_script_path" | awk '{print $1}')
  fi

  cd "$APP_DIR"

  # 1. 检查工作区是否干净（.env / .deploy-meta.json 等本地文件除外）
  info "检查 git 工作区状态..."
  local git_status
  git_status=$(git status --porcelain | grep -vE '^\s*[AM?]+\s+(server/\.env|deploy/\.deploy-meta\.json|deploy/\.deploy-done|deploy/\.update-(lock|state|step|logs)|deploy/\.backups)' || echo "")

  local has_local_changes=0
  if [[ -n "$git_status" ]]; then
    has_local_changes=1
    warn "检测到本地代码改动："
    echo "$git_status" | head -10 | tee -a "$UPDATE_LOG" >&2
  fi

  # 2. 检查当前分支
  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD)
  info "当前分支: $current_branch"

  # 3. fetch 远端
  info "拉取远端引用..."
  if ! git fetch origin "$current_branch" 2>>"$UPDATE_LOG"; then
    err "git fetch 失败，请检查网络与远端配置"
    err "  远端: $(git remote get-url origin 2>/dev/null || echo '未配置')"
    err "  分支: $current_branch"
    err ""
    err "排查建议："
    err "  1) 检查服务器是否能访问 GitHub：curl -sI https://github.com"
    err "  2) 检查远端 URL 是否正确：git -C $APP_DIR remote -v"
    err "  3) 若使用 SSH，确认 ssh-key 已添加到 GitHub"
    exit 1
  fi

  local local_commit remote_commit
  local_commit=$(git rev-parse HEAD)
  remote_commit=$(git rev-parse "origin/$current_branch")

  if [[ "$local_commit" == "$remote_commit" ]]; then
    info "代码已是最新 ($local_commit)"
    write_state "RUNNING" "代码已是最新" 3
    return 0
  fi

  info "本地: $local_commit"
  info "远端: $remote_commit"

  # 4. 如果有本地改动，先 stash（保留 .env 等本地文件不动）
  local stashed=0
  if [[ $has_local_changes -eq 1 ]]; then
    info "暂存本地改动..."
    if git stash push -u -m "update-$(date +%Y%m%d-%H%M%S)" \
        -- $(git status --porcelain | awk '{print $2}' | grep -vE '^(server/\.env|deploy/\.deploy-meta\.json|deploy/\.deploy-done|deploy/\.update-|deploy/\.backups)' | tr '\n' ' ') \
        >>"$UPDATE_LOG" 2>&1; then
      stashed=1
      info "本地改动已 stash"
    else
      # stash 失败可能是因为路径过滤问题，尝试整体 stash 但保留 .env
      warn "精确 stash 失败，尝试整体 stash（.env 等本地文件已在 .gitignore 或将自动恢复）..."
      if git stash push -u -m "update-$(date +%Y%m%d-%H%M%S)" >>"$UPDATE_LOG" 2>&1; then
        stashed=1
        info "本地改动已 stash"
      else
        err "stash 本地改动失败，请手动处理本地改动后重试"
        err "  可执行: cd $APP_DIR && git status 查看改动"
        err "  然后手动 commit 或 stash 后重新运行本脚本"
        exit 1
      fi
    fi
  fi

  # 5. 执行 pull / reset
  info "应用远端代码..."
  # 优先使用 merge（保留历史），失败再降级到 reset --hard
  local pull_ok=0
  if git merge "origin/$current_branch" --ff-only >>"$UPDATE_LOG" 2>&1; then
    pull_ok=1
    info "代码已快进合并"
  else
    warn "快进合并失败，尝试 reset --hard origin/$current_branch..."
    if git reset --hard "origin/$current_branch" >>"$UPDATE_LOG" 2>&1; then
      pull_ok=1
      info "代码已强制重置到 origin/$current_branch"
    else
      err "git reset 失败，远端代码无法同步"
      err "  这通常意味着本地有未提交的合并冲突"
      err ""
      err "排查建议："
      err "  1) cd $APP_DIR && git status 查看冲突文件"
      err "  2) 手动解决冲突后: git add . && git commit"
      err "  3) 然后重新运行: bash deploy/update.sh"
      # 尝试恢复 stash
      if [[ $stashed -eq 1 ]]; then
        warn "尝试恢复 stash 中保存的本地改动..."
        git stash pop >>"$UPDATE_LOG" 2>&1 && info "本地改动已恢复" || warn "stash pop 失败，请手动 git stash list 查找"
      fi
      exit 1
    fi
  fi

  # 6. 恢复 stash
  if [[ $stashed -eq 1 ]]; then
    info "恢复本地改动..."
    if git stash pop >>"$UPDATE_LOG" 2>&1; then
      info "本地改动已恢复"
    else
      # stash pop 冲突
      err "stash pop 失败：本地改动与远端代码有冲突"
      err "  你的本地改动仍保留在 git stash 中，未丢失"
      err ""
      err "排查建议："
      err "  1) cd $APP_DIR && git stash list 查看所有 stash"
      err "  2) cd $APP_DIR && git stash show -p stash@{0} 查看改动内容"
      err "  3) 手动解决冲突: git checkout stash@{0} -- <文件> 或 git stash branch <new-branch>"
      err "  4) 处理完成后: git stash drop stash@{0}"
      err ""
      err "本次更新已成功拉取远端代码，但本地改动未自动恢复。"
      err "如不需要本地改动，可直接继续后续步骤；否则请先处理 stash。"
      # 不退出，让用户决定是否继续
      if [[ "${DEPLOY_NONINTERACTIVE:-0}" != "1" ]]; then
        read -rp "$(echo -e "${C_CYAN}是否继续后续步骤（依赖安装/迁移/构建）？[y/N]: ${C_RESET}")" ans
        [[ "${ans:-N}" =~ ^[Yy]$ ]] || exit 1
      else
        warn "非交互模式：继续后续步骤（本地改动保留在 stash 中）"
      fi
    fi
  fi

  # 7. 确保 .env 等关键文件存在（git reset 可能清掉）
  if [[ ! -f "$APP_DIR/server/.env" ]]; then
    # 从备份恢复
    local latest_backup
    latest_backup=$(ls -1t "$BACKUP_DIR" 2>/dev/null | head -1)
    if [[ -n "$latest_backup" && -f "$BACKUP_DIR/$latest_backup/env.bak" ]]; then
      cp "$BACKUP_DIR/$latest_backup/env.bak" "$APP_DIR/server/.env"
      chmod 600 "$APP_DIR/server/.env"
      info ".env 已从备份恢复"
    else
      err ".env 文件丢失且无备份，请重新执行 deploy.sh"
      exit 1
    fi
  fi

  # 同样恢复 .deploy-meta.json
  if [[ ! -f "$APP_DIR/deploy/.deploy-meta.json" ]]; then
    local latest_backup
    latest_backup=$(ls -1t "$BACKUP_DIR" 2>/dev/null | head -1)
    if [[ -n "$latest_backup" && -f "$BACKUP_DIR/$latest_backup/deploy-meta.bak" ]]; then
      cp "$BACKUP_DIR/$latest_backup/deploy-meta.bak" "$APP_DIR/deploy/.deploy-meta.json"
      info ".deploy-meta.json 已从备份恢复"
    fi
  fi

  info "新 commit: $(git rev-parse HEAD)"

  # 自更新检测：如果 update.sh 自身在 git pull 中被更新，exec 重新执行以加载新逻辑
  # 关键：exec 会保留同一 PID，所以 LOCK_FILE 中的 pid 仍有效，不会死锁
  #       通过 _INHERIT_UPDATE_LOG 保持日志连续性，通过 _SKIP_* 跳过已完成步骤
  if [[ -f "$_self_script_path" ]] && [[ "${_UPDATE_SELF_RELOADED:-0}" != "1" ]]; then
    local _self_new_hash
    _self_new_hash=$(sha256sum "$_self_script_path" | awk '{print $1}')
    if [[ -n "$_self_old_hash" && "$_self_old_hash" != "$_self_new_hash" ]]; then
      info "检测到 update.sh 自身已更新，重新执行脚本以加载最新逻辑..."
      info "继续日志文件: $UPDATE_LOG"
      exec env \
        _UPDATE_SELF_RELOADED=1 \
        _INHERIT_UPDATE_LOG="$UPDATE_LOG" \
        _SKIP_PREFLIGHT=1 \
        _SKIP_BACKUP=1 \
        _SKIP_PULL=1 \
        APP_DIR="$APP_DIR" \
        DEPLOY_NONINTERACTIVE="${DEPLOY_NONINTERACTIVE:-0}" \
        FORCE_UPDATE_TASK_ID="${FORCE_UPDATE_TASK_ID:-}" \
        bash "$_self_script_path" "$@"
    fi
  fi

  write_state "RUNNING" "代码已更新到 $(git rev-parse --short HEAD)" 3
  log "代码同步完成"
}

# ============================================================================
# 步骤 4：安装依赖
# ============================================================================
install_dependencies() {
  step "步骤 4/9：安装依赖"
  save_step "4"

  # 后端：必须安装完整依赖（含 devDependencies）
  # 原因：步骤 6 npm run build 调用 nest build，需要 @nestjs/cli（在 devDependencies 中）
  #       步骤 5 prisma migrate 也依赖 prisma CLI（在 devDependencies 中）
  # 关键：force-update 通过 PM2 触发，会继承 NODE_ENV=production，导致 npm ci 跳过 devDependencies
  #       必须在此处显式重置 NODE_ENV，确保 devDependencies 被安装
  info "安装后端依赖（含 devDependencies，用于构建）..."
  cd "$APP_DIR/server"
  # 临时清除 NODE_ENV（仅影响本次 npm ci / npm install），避免跳过 devDependencies
  local _saved_node_env="${NODE_ENV:-}"
  unset NODE_ENV
  if ! npm ci --include=dev >>"$UPDATE_LOG" 2>&1; then
    warn "npm ci 失败（可能 package-lock.json 不一致），回退到 npm install..."
    if ! npm install --include=dev >>"$UPDATE_LOG" 2>&1; then
      err "后端依赖安装失败"
      err "  请检查 package-lock.json 是否与 package.json 一致"
      err "  或手动执行: cd $APP_DIR/server && npm install"
      [[ -n "$_saved_node_env" ]] && export NODE_ENV="$_saved_node_env"
      exit 1
    fi
  fi
  # 恢复 NODE_ENV（后续步骤如 prisma migrate 可能需要）
  [[ -n "$_saved_node_env" ]] && export NODE_ENV="$_saved_node_env"
  info "后端依赖安装完成"

  # 重新生成 prisma client
  if [[ -f prisma/schema.prisma ]]; then
    info "生成 Prisma Client..."
    if ! npx prisma generate >>"$UPDATE_LOG" 2>&1; then
      err "Prisma generate 失败"
      err "  请检查 prisma/schema.prisma 语法"
      exit 1
    fi
  fi

  # 前端依赖
  if [[ -f "$APP_DIR/web/package.json" ]]; then
    info "安装前端依赖..."
    cd "$APP_DIR/web"
    # 前端构建也需要 devDependencies（vite/vue-cli 等构建工具在 devDependencies）
    local _saved_node_env_web="${NODE_ENV:-}"
    unset NODE_ENV
    if ! npm ci --include=dev >>"$UPDATE_LOG" 2>&1; then
      warn "前端 npm ci 失败，回退到 npm install..."
      if ! npm install --include=dev >>"$UPDATE_LOG" 2>&1; then
        err "前端依赖安装失败"
        [[ -n "$_saved_node_env_web" ]] && export NODE_ENV="$_saved_node_env_web"
        exit 1
      fi
    fi
    [[ -n "$_saved_node_env_web" ]] && export NODE_ENV="$_saved_node_env_web"
    info "前端依赖安装完成"
  fi

  write_state "RUNNING" "依赖安装完成" 4
  log "依赖安装完成"
}

# 构建完成后清理 devDependencies（缩减生产环境体积）
# 在 build_app 成功后调用
prune_dev_dependencies() {
  info "清理 devDependencies（缩减生产体积）..."
  cd "$APP_DIR/server"
  npm prune --omit=dev >>"$UPDATE_LOG" 2>&1 || warn "npm prune 失败（不影响运行）"
  # prisma client 已 generate 到 node_modules/.prisma，prune 不会删除
  # 但 @prisma/client 是 dependencies，会保留
  info "devDependencies 已清理"
}

# ============================================================================
# 步骤 5：数据库迁移
# ============================================================================
migrate_database() {
  step "步骤 5/9：数据库迁移"
  save_step "5"

  cd "$APP_DIR/server"

  if [[ ! -f prisma/schema.prisma ]]; then
    warn "未找到 prisma/schema.prisma，跳过迁移"
    return 0
  fi

  info "执行 prisma migrate deploy..."
  if ! npx prisma migrate deploy >>"$UPDATE_LOG" 2>&1; then
    err "数据库迁移失败"
    err "  请检查 migrations 目录与 DATABASE_URL 配置"
    err "  日志: $UPDATE_LOG"
    exit 1
  fi
  info "迁移完成"

  # 执行 seed（如果存在）- 不强制，避免覆盖数据
  if [[ -f prisma/seed.ts ]] && grep -q '"seed"' package.json 2>/dev/null; then
    info "执行 prisma db seed（如已存在数据将跳过）..."
    # 检查是否已有管理员（有则跳过 seed）
    local has_admin
    has_admin=$(npx prisma db execute --stdin <<<"SELECT COUNT(*) as c FROM Admin;" 2>/dev/null | tail -1 || echo "0")
    if [[ "$has_admin" == "0" ]]; then
      npx prisma db seed >>"$UPDATE_LOG" 2>&1 || warn "seed 失败（不影响更新，可手动执行）"
    else
      info "已存在管理员，跳过 seed"
    fi
  fi

  write_state "RUNNING" "数据库迁移完成" 5
  log "数据库迁移完成"
}

# ============================================================================
# 步骤 6：构建应用
# ============================================================================
build_app() {
  step "步骤 6/9：构建应用"
  save_step "6"

  info "构建后端..."
  cd "$APP_DIR/server"
  if ! npm run build >>"$UPDATE_LOG" 2>&1; then
    err "后端构建失败"
    err "  日志: $UPDATE_LOG"
    err "  请检查 TypeScript 编译错误"
    exit 1
  fi
  info "后端构建完成"

  if [[ -f "$APP_DIR/web/package.json" ]]; then
    info "构建前端..."
    cd "$APP_DIR/web"
    if ! npm run build >>"$UPDATE_LOG" 2>&1; then
      err "前端构建失败"
      err "  日志: $UPDATE_LOG"
      exit 1
    fi
    info "前端构建完成"
  fi

  # 构建完成后清理 devDependencies（缩减生产体积）
  # 必须在构建完成后执行：nest build / tsc 已经产生 dist/，运行时不再需要 @nestjs/cli 等
  prune_dev_dependencies

  write_state "RUNNING" "构建完成" 6
  log "构建完成"
}

# ============================================================================
# 步骤 7：重启服务
# ----------------------------------------------------------------------------
# 关键设计：当 PM2 已管理 rainyun-api 时，update.sh 不能直接执行 pm2 reload。
# 原因：force-update API 触发时，update.sh 的父进程是 rainyun-api (Node.js)。
#       PM2 reload 会杀死旧 rainyun-api，经过测试发现即使使用 setsid + trap SIGHUP
#       + nohup 后台触发，update.sh 仍然会在 PM2 reload 时被杀死（可能是 PM2 daemon
#       通过 cgroup 或进程树跟踪并清理了相关进程）。
#
# 解决方案：将 PM2 reload + 健康检查 + 清理（步骤 7/8/9）拆分为独立的 finish 脚本，
#          用 systemd-run 调度到一个全新的 systemd transient scope 中执行。
#          该 scope 与 update.sh 的进程组/会话/cgroup 完全脱钩，
#          PM2 reload 不会影响 finish 脚本的执行。
#          update.sh 调度完成后立即正常退出，剩余步骤由 finish 脚本完成。
# ============================================================================
restart_services() {
  step "步骤 7/9：重启服务"
  save_step "7"

  # 检查后端是否已通过 PM2 管理
  local pm2_exists
  pm2_exists=$(pm2 describe rainyun-api 2>/dev/null | grep -c "online\|stopped\|errored" || echo "0")

  if [[ "$pm2_exists" -eq 0 ]]; then
    # 场景 A：PM2 未管理 rainyun-api（首次部署），直接启动即可，不存在 reload 杀进程的问题
    warn "PM2 中未找到 rainyun-api 进程，将首次启动..."
    cd "$APP_DIR/server"
    local server_entry="dist/main.js"
    [[ -f dist/src/main.js ]] && server_entry="dist/src/main.js"
    if ! pm2 start "$server_entry" --name rainyun-api --cwd "$APP_DIR/server" >>"$UPDATE_LOG" 2>&1; then
      err "后端启动失败"
      exit 1
    fi
    pm2 save >>"$UPDATE_LOG" 2>&1 || true

    # nginx reload（首次启动场景，update.sh 仍然存活）
    if has_cmd nginx; then
      info "reload nginx..."
      nginx -t 2>>"$UPDATE_LOG" && systemctl reload nginx 2>>"$UPDATE_LOG" || \
        warn "nginx reload 失败（不影响更新）"
    fi

    write_state "RUNNING" "服务已启动" 7
    log "服务启动完成（首次启动场景，继续后续步骤）"
    return
  fi

  # 场景 B：PM2 已管理 rainyun-api，需要 reload
  # 关键：将步骤 7（reload）+ 步骤 8（健康检查）+ 步骤 9（清理）拆分为独立脚本，
  #       用 systemd-run 调度到新 scope 中执行，避免 update.sh 被 PM2 reload 杀死。
  info "PM2 reload rainyun-api（零停机重启）..."
  info "检测到 PM2 管理的 rainyun-api，将 reload + 健康检查 + 清理拆分为独立后台任务..."
  info "（避免 update.sh 被 PM2 reload 杀死，使用 systemd-run 创建独立 scope）"

  # 生成独立的 finish 脚本
  local finish_script="$APP_DIR/deploy/.update-finish.sh"
  cat > "$finish_script" <<FINISH_EOF
#!/usr/bin/env bash
# 此脚本由 update.sh 自动生成，用于在 update.sh 退出后完成剩余步骤
# 步骤 7：PM2 reload
# 步骤 8：健康检查
# 步骤 9：清理旧备份
#
# 关键：此脚本必须在独立的 systemd scope 中运行（由 systemd-run 调度），
#       与 update.sh 的进程组/会话/cgroup 完全脱钩，
#       这样 PM2 reload 杀死旧 rainyun-api 时不会影响此脚本。

set -uo pipefail

# 双重保障：忽略 SIGHUP/SIGPIPE
trap '' SIGHUP
trap '' SIGPIPE

APP_DIR="$APP_DIR"
LOG_FILE="$UPDATE_LOG"
STATE_FILE="\$APP_DIR/deploy/.update-state"
LOCK_FILE="\$APP_DIR/deploy/.update-lock"
BACKUP_DIR="\$APP_DIR/deploy/.backups"
LOG_DIR="\$APP_DIR/deploy/.update-logs"

log()   { echo "[\$(date +%H:%M:%S)] \$*" | tee -a "\$LOG_FILE" >&2; }
info()  { echo "[\$(date +%H:%M:%S)] \$*" | tee -a "\$LOG_FILE" >&2; }
warn()  { echo "[\$(date +%H:%M:%S)] WARN: \$*" | tee -a "\$LOG_FILE" >&2; }
err()   { echo "[\$(date +%H:%M:%S)] ERROR: \$*" | tee -a "\$LOG_FILE" >&2; }

# 写入状态文件（step 固定为 9，因为 finish 脚本负责最后三步）
write_state() {
  local status="\$1" message="\$2" progress="\${3:-7}"
  cat > "\$STATE_FILE" <<EOF
{
  "status": "\$status",
  "message": "\$message",
  "progress": \$progress,
  "step": "9",
  "updatedAt": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "logFile": "\$LOG_FILE"
}
EOF
}

# 退出处理：始终清理锁文件
on_finish_exit() {
  rm -f "\$LOCK_FILE"
}
trap 'on_finish_exit' EXIT

on_finish_error() {
  local exit_code=\$?
  err "finish 脚本执行失败（退出码 \$exit_code）"
  write_state "FAILED" "更新失败：finish 脚本出错（退出码 \$exit_code）" 7
  exit \$exit_code
}
trap 'on_finish_error' ERR

log ""
log "========== finish 脚本启动 (PID \$\$) =========="
log "运行在独立 systemd scope 中，与 update.sh 进程组/会话/cgroup 完全脱钩"

# 更新锁文件，写入自己的 PID
# 这样 getUpdateStatus 能检测到 finish 脚本存活，不会误判为 STALE
echo "pid:\$\$ started:\$(date -u +%Y-%m-%dT%H:%M:%SZ) source:finish" > "\$LOCK_FILE"

# 等待 update.sh 完全退出，确保其进程组/会话被清理
info "等待 update.sh 退出..."
sleep 2

# ===== 步骤 7：PM2 reload =====
log ""
log "========== 步骤 7/9：PM2 reload =========="
if ! pm2 reload rainyun-api >> "\$LOG_FILE" 2>&1; then
  err "PM2 reload 失败"
  err "  请检查 PM2 日志: pm2 logs rainyun-api --lines 50"
  write_state "FAILED" "PM2 reload 失败" 7
  exit 1
fi
log "PM2 reload 完成"

pm2 save >> "\$LOG_FILE" 2>&1 || true

# nginx reload
if command -v nginx >/dev/null 2>&1; then
  log "reload nginx..."
  nginx -t 2>> "\$LOG_FILE" && systemctl reload nginx 2>> "\$LOG_FILE" || \\
    warn "nginx reload 失败（不影响更新）"
fi

# ===== 步骤 8：健康检查 =====
log ""
log "========== 步骤 8/9：健康检查 =========="
info "等待后端启动..."
max_wait=60
waited=0
healthy=0
while [[ \$waited -lt \$max_wait ]]; do
  resp=\$(curl -sS --max-time 3 http://127.0.0.1:3001/api/health 2>/dev/null || echo "")
  if echo "\$resp" | grep -q '"status":"ok"'; then
    healthy=1
    info "后端健康检查通过 (\${waited}s)"
    info "响应: \$resp"
    break
  fi
  sleep 2
  waited=\$((waited + 2))
done

if [[ \$healthy -eq 0 ]]; then
  err "后端健康检查失败（\${max_wait}s 内未响应）"
  err "  请检查 PM2 日志: pm2 logs rainyun-api --lines 50"
  write_state "FAILED" "健康检查失败" 8
  exit 1
fi

# 检查 PM2 进程状态（剥离 ANSI 颜色码后解析表格）
pm2_status=\$(pm2 describe rainyun-api 2>/dev/null | sed -E 's/\\x1b\\[[0-9;]*m//g' | awk -F'│' '/^[│|].*status/ {gsub(/^[ \\t]+|[ \\t]+\$/,"",\$3); print \$3; exit}' | tr -d '[:space:]' || echo "")
if [[ "\$pm2_status" != "online" ]]; then
  err "PM2 rainyun-api 状态异常: '\$pm2_status'"
  pm2 logs rainyun-api --lines 20 --nostream 2>&1 | tail -30 | tee -a "\$LOG_FILE" >&2
  write_state "FAILED" "PM2 状态异常: \$pm2_status" 8
  exit 1
fi
info "PM2 rainyun-api 状态: \$pm2_status"

# ===== 步骤 9：清理旧备份 =====
log ""
log "========== 步骤 9/9：清理旧备份 =========="
# 保留最近 5 个备份
total=\$(ls -1d "\$BACKUP_DIR"/backup-* 2>/dev/null | wc -l || echo "0")
if [[ \$total -gt 5 ]]; then
  info "清理旧备份（保留最近 5 个，当前 \$total 个）..."
  ls -1dt "\$BACKUP_DIR"/backup-* 2>/dev/null | tail -n +6 | while read -r old; do
    rm -rf "\$old"
    info "已删除: \$(basename "\$old")"
  done
else
  info "备份数量 (\$total) 未超过阈值 (5)，无需清理"
fi

# 清理 7 天前的更新日志
find "\$LOG_DIR" -name "update-*.log" -mtime +7 -delete 2>/dev/null || true

# 清理步骤文件
rm -f "\$APP_DIR/deploy/.update-step"

write_state "SUCCESS" "更新完成" 9
log ""
log "============================================================"
log "  更新全部完成！"
log "  当前 commit: \$(cd "\$APP_DIR" && git rev-parse --short HEAD)"
log "  日志文件: \$LOG_FILE"
log "============================================================"
log ""
log "finish 脚本退出，锁文件已清理"
exit 0
FINISH_EOF
  chmod +x "$finish_script"
  info "已生成 finish 脚本: $finish_script"

  # 用 systemd-run 调度 finish 脚本到一个全新的 transient scope
  # 关键：systemd-run 创建的 scope 与当前进程完全隔离（独立的 cgroup/进程组/会话），
  #       PM2 reload 杀死旧 rainyun-api 时不会影响 finish 脚本
  local unit_name="update-finish-$$.service"
  local dispatched=0

  # 尝试 1：系统级 systemd-run（root 权限，最可靠）
  if [[ $dispatched -eq 0 ]] && systemd-run --no-block --unit="$unit_name" \
      bash "$finish_script" >>"$UPDATE_LOG" 2>&1; then
    info "已通过 systemd-run 调度 finish 脚本（系统级 scope: $unit_name）"
    dispatched=1
  fi

  # 尝试 2：用户级 systemd-run
  if [[ $dispatched -eq 0 ]] && systemd-run --user --no-block --unit="$unit_name" \
      bash "$finish_script" >>"$UPDATE_LOG" 2>&1; then
    info "已通过 systemd-run --user 调度 finish 脚本（用户级 scope: $unit_name）"
    dispatched=1
  fi

  # 降级方案：setsid + nohup + disown（systemd-run 不可用时）
  if [[ $dispatched -eq 0 ]]; then
    warn "systemd-run 不可用，降级到 setsid + nohup（可能仍受 PM2 reload 影响）..."
    setsid nohup bash "$finish_script" < /dev/null > /dev/null 2>&1 &
    disown 2>/dev/null || true
    info "已通过 setsid 调度 finish 脚本"
    dispatched=1
  fi

  # 标记已调度：on_exit 不会清理锁文件（由 finish 脚本负责）
  FINISH_DISPATCHED=1

  # 写入中间状态（前端会看到 RUNNING + 步骤 7，finish 脚本完成后更新为 SUCCESS）
  write_state "RUNNING" "服务重启中（已调度后台任务执行 reload + 健康检查）" 7
  log "restart_services 完成（reload + 健康检查在后台独立 scope 中执行）"
  log "update.sh 主进程将退出，finish 脚本会继续执行剩余步骤"

  # 关键：直接 exit 0，跳过 health_check 和 cleanup_old_backups
  # 这两个步骤已移到 finish 脚本中
  exit 0
}

# ============================================================================
# 步骤 8：健康检查
# ============================================================================
health_check() {
  step "步骤 8/9：健康检查"
  save_step "8"

  info "等待后端启动..."
  local max_wait=60
  local waited=0
  local healthy=0

  while [[ $waited -lt $max_wait ]]; do
    local resp
    resp=$(curl -sS --max-time 3 http://127.0.0.1:3001/api/health 2>/dev/null || echo "")
    if echo "$resp" | grep -q '"status":"ok"'; then
      healthy=1
      info "后端健康检查通过 (${waited}s)"
      info "响应: $resp"
      break
    fi
    sleep 2
    waited=$((waited + 2))
  done

  if [[ $healthy -eq 0 ]]; then
    err "后端健康检查失败（${max_wait}s 内未响应）"
    err "  请检查 PM2 日志: pm2 logs rainyun-api --lines 50"
    err "  或检查应用日志"
    exit 1
  fi

  # 检查 PM2 进程状态
  # pm2 describe 输出表格格式：│ status │ online │（带 ANSI 颜色码，需先剥离再解析）
  local pm2_status
  pm2_status=$(pm2 describe rainyun-api 2>/dev/null | sed -E 's/\x1b\[[0-9;]*m//g' | awk -F'│' '/^[│|].*status/ {gsub(/^[ \t]+|[ \t]+$/,"",$3); print $3; exit}' | tr -d '[:space:]' || echo "")
  if [[ "$pm2_status" != "online" ]]; then
    err "PM2 rainyun-api 状态异常: '$pm2_status'"
    pm2 logs rainyun-api --lines 20 --nostream 2>&1 | tail -30 | tee -a "$UPDATE_LOG" >&2
    exit 1
  fi
  info "PM2 rainyun-api 状态: $pm2_status"

  write_state "RUNNING" "健康检查通过" 8
  log "健康检查通过"
}

# ============================================================================
# 步骤 9：清理旧备份
# ============================================================================
cleanup_old_backups() {
  step "步骤 9/9：清理旧备份"
  save_step "9"

  # 保留最近 5 个备份
  local total
  total=$(ls -1d "$BACKUP_DIR"/backup-* 2>/dev/null | wc -l || echo "0")
  if [[ $total -gt 5 ]]; then
    info "清理旧备份（保留最近 5 个，当前 $total 个）..."
    ls -1dt "$BACKUP_DIR"/backup-* 2>/dev/null | tail -n +6 | while read -r old; do
      rm -rf "$old"
      info "已删除: $(basename "$old")"
    done
  else
    info "备份数量 ($total) 未超过阈值 (5)，无需清理"
  fi

  # 清理 7 天前的更新日志
  find "$LOG_DIR" -name "update-*.log" -mtime +7 -delete 2>/dev/null || true

  # 清理步骤文件
  rm -f "$STEP_FILE"

  write_state "SUCCESS" "更新完成" 9
  log "清理完成"
}

# ============================================================================
# 主流程
# ============================================================================
main() {
  echo -e "${C_BOLD}${C_GREEN}"
  cat <<'EOF'
============================================================
  雨云服务器分销平台 v1.1.0 - 一键更新脚本
============================================================
EOF
  echo -e "${C_RESET}"

  info "更新开始: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  info "日志文件: $UPDATE_LOG"
  info "应用目录: $APP_DIR"
  if [[ "${DEPLOY_NONINTERACTIVE:-0}" == "1" ]]; then
    info "运行模式: 非交互式（CI/自动触发）"
  else
    info "运行模式: 交互式"
  fi
  echo ""

  # 写入初始状态
  write_state "RUNNING" "更新开始" 0

  # 自更新机制：如果 _SKIP_* 标志已设置（exec 重新执行），跳过已完成步骤
  # 关键：exec 重新执行时，preflight/backup/pull 已完成，直接从 install_dependencies 开始
  if [[ "${_SKIP_PREFLIGHT:-0}" != "1" ]]; then
    preflight_check
  else
    info "跳过前置检查（自更新重载）"
  fi

  if [[ "${_SKIP_BACKUP:-0}" != "1" ]]; then
    backup_env_and_db
  else
    info "跳过备份步骤（自更新重载）"
  fi

  if [[ "${_SKIP_PULL:-0}" != "1" ]]; then
    pull_latest_code
  else
    info "跳过代码拉取（自更新重载）"
  fi

  # 后续步骤始终执行（依赖可能变化，需重新安装/构建/重启）
  install_dependencies
  migrate_database
  build_app
  restart_services
  health_check
  cleanup_old_backups

  echo ""
  log "============================================================"
  log "  更新全部完成！"
  log "  当前 commit: $(cd "$APP_DIR" && git rev-parse --short HEAD)"
  log "  日志文件: $UPDATE_LOG"
  log "============================================================"
}

main "$@"
