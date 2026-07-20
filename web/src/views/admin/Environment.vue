<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api/admin';

// ============ 类型定义 ============
interface EnvInfo {
  versions: {
    node: string;
    npm: string;
    pm2: string | null;
    mysql: string | null;
    redis: string | null;
    nginx: string | null;
    git: string;
  };
  pm2Processes: Array<{
    name: string;
    pid: number;
    status: string;
    uptime: number;
    restarts: number;
    memory: number;
    cpu: number;
    version: string;
  }>;
  diskUsage: { size: string; used: string; avail: string; usePercent: string } | null;
  memory: { total: string; used: string; free: string; usePercent: string };
  cpu: { cores: number; model: string; speed: string; loadavg: number[] };
  gitInfo: { branch: string; commit: string; dirtyFiles: number } | null;
  dependencies: string;
  app: { version: string; uptime: string; pid: number; nodeEnv: string };
  collectedAt: string;
}

// ============ 数据状态 ============
const loading = ref(false);
const envInfo = ref<EnvInfo | null>(null);
const errorMsg = ref<string>('');
// 自动刷新（默认关闭，避免给服务器造成压力；用户可手动开启 30s 轮询）
const autoRefresh = ref(false);
const refreshTimer = ref<number | null>(null);

// ============ 数据加载 ============
async function loadEnvInfo() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res: any = await adminApi.envInfo();
    if (res?.success) {
      envInfo.value = res.data;
    } else {
      errorMsg.value = res?.message || '获取环境信息失败';
    }
  } catch (e: any) {
    errorMsg.value = e?.message || '网络错误，无法连接服务器';
  } finally {
    loading.value = false;
  }
}

// ============ 工具函数 ============
function formatBytes(bytes: number): string {
  if (!bytes && bytes !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function formatPm2Uptime(uptime: number): string {
  if (!uptime) return '-';
  const now = Date.now();
  const diff = now - uptime;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${mins}分`;
  return `${mins}分`;
}

// ============ 类型安全格式化函数 ============
// API 返回的某些字段是字符串（如 loadavg: ["0.01","0.02","0.01"]），
// 直接调用 .toFixed() 会抛 TypeError 导致整个页面渲染崩溃（白屏）。
// 这些辅助函数统一做 Number() 转换后再格式化。

// 格式化负载值（loadavg 元素可能是字符串）
function fmtLoad(val: any): string {
  const n = Number(val);
  return isNaN(n) ? '-' : n.toFixed(2);
}

// 格式化 CPU 占比（pm2 进程的 cpu 字段可能是字符串）
function fmtCpu(val: any): string {
  const n = Number(val);
  return isNaN(n) ? '-' : n.toFixed(1);
}

// 提取百分比数值（API 返回 "29.9%" 形式的字符串，去掉 % 后返回数字）
function pctNum(val: any): number {
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

// 格式化百分比显示（API 已带 %，直接使用；若用于 CSS width 则取数值）
function pctWidth(val: any): string {
  return pctNum(val) + '%';
}

// 健康度评级：综合内存、磁盘、负载评估系统健康度
const healthScore = computed(() => {
  if (!envInfo.value) return null;
  let score = 100;
  const memPct = parseFloat(envInfo.value.memory.usePercent);
  if (!isNaN(memPct)) {
    if (memPct > 90) score -= 30;
    else if (memPct > 80) score -= 15;
    else if (memPct > 70) score -= 5;
  }
  if (envInfo.value.diskUsage) {
    const diskPct = parseInt(envInfo.value.diskUsage.usePercent);
    if (!isNaN(diskPct)) {
      if (diskPct > 90) score -= 30;
      else if (diskPct > 80) score -= 15;
      else if (diskPct > 70) score -= 5;
    }
  }
  // 1 分钟负载 > CPU 核数 = 过载（API 返回字符串，需转数字）
  const load1 = Number(envInfo.value.cpu.loadavg[0]);
  if (!isNaN(load1)) {
    if (load1 > envInfo.value.cpu.cores * 2) score -= 20;
    else if (load1 > envInfo.value.cpu.cores) score -= 10;
  }
  // PM2 进程异常
  const deadProc = envInfo.value.pm2Processes.filter(p => p.status !== 'online').length;
  if (deadProc > 0) score -= deadProc * 10;
  return Math.max(0, Math.min(100, score));
});

const healthLevel = computed(() => {
  const s = healthScore.value;
  if (s === null) return { label: '未知', color: 'info', percent: 0 };
  if (s >= 90) return { label: '优秀', color: 'success', percent: s };
  if (s >= 70) return { label: '良好', color: 'success', percent: s };
  if (s >= 50) return { label: '警告', color: 'warning', percent: s };
  return { label: '危险', color: 'danger', percent: s };
});

// 依赖版本卡片列表
const versionCards = computed(() => {
  if (!envInfo.value) return [];
  const v = envInfo.value.versions;
  return [
    { key: 'node', label: 'Node.js', value: v.node, ok: !!v.node, icon: 'Platform', required: true, desc: 'JS 运行时' },
    { key: 'npm', label: 'npm', value: v.npm, ok: !!v.npm, icon: 'Files', required: true, desc: '包管理器' },
    { key: 'pm2', label: 'PM2', value: v.pm2 || '未安装', ok: !!v.pm2, icon: 'Cpu', required: true, desc: '进程守护' },
    { key: 'mysql', label: 'MySQL', value: v.mysql || '未安装', ok: !!v.mysql, icon: 'Coin', required: true, desc: '主数据库' },
    { key: 'redis', label: 'Redis', value: v.redis || '未安装', ok: !!v.redis, icon: 'Histogram', required: true, desc: '缓存/队列' },
    { key: 'nginx', label: 'Nginx', value: v.nginx || '未安装', ok: !!v.nginx, icon: 'Connection', required: false, desc: '反向代理（可选）' },
    { key: 'git', label: 'Git', value: v.git, ok: !!v.git, icon: 'Link', required: true, desc: '版本控制' },
  ];
});

// 必需依赖缺失数量
const missingRequired = computed(() => {
  return versionCards.value.filter(v => !v.ok && v.required).length;
});

// PM2 进程状态统计
const pm2Stats = computed(() => {
  if (!envInfo.value) return { total: 0, online: 0, stopped: 0 };
  const list = envInfo.value.pm2Processes;
  return {
    total: list.length,
    online: list.filter(p => p.status === 'online').length,
    stopped: list.filter(p => p.status !== 'online').length,
  };
});

// ============ 自动刷新 ============
function toggleAutoRefresh() {
  if (autoRefresh.value) {
    stopAutoRefresh();
  } else {
    startAutoRefresh();
  }
}

function startAutoRefresh() {
  autoRefresh.value = true;
  refreshTimer.value = window.setInterval(() => {
    loadEnvInfo();
  }, 30000); // 30 秒一次
  ElMessage.success('已开启自动刷新（每 30 秒）');
}

function stopAutoRefresh() {
  autoRefresh.value = false;
  if (refreshTimer.value !== null) {
    clearInterval(refreshTimer.value);
    refreshTimer.value = null;
  }
}

onMounted(() => {
  loadEnvInfo();
});

onBeforeUnmount(() => {
  stopAutoRefresh();
});
</script>

<template>
  <div class="admin-env" v-loading="loading">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">ENVIRONMENT MONITOR</span>
        <h2 class="page-title font-display">环境依赖</h2>
        <p class="page-subtitle">服务器运行环境、依赖版本与系统资源监控</p>
      </div>
      <div class="header-actions">
        <el-button
          class="btn-outline"
          :type="autoRefresh ? 'primary' : ''"
          @click="toggleAutoRefresh"
        >
          <el-icon style="margin-right: 6px;">
            <VideoPause v-if="autoRefresh" />
            <VideoPlay v-else />
          </el-icon>
          {{ autoRefresh ? '停止刷新' : '自动刷新' }}
        </el-button>
        <el-button class="btn-outline" :loading="loading" @click="loadEnvInfo">
          <el-icon style="margin-right: 6px;"><Refresh /></el-icon>
          立即刷新
        </el-button>
      </div>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      show-icon
      :closable="false"
    >
      <template #default>
        <div class="err-detail">
          {{ errorMsg }}
          <el-button text size="small" @click="loadEnvInfo">重试</el-button>
        </div>
      </template>
    </el-alert>

    <template v-if="envInfo">
      <!-- ============ 顶部概览：健康度 + 关键指标 ============ -->
      <div class="overview-row">
        <!-- 健康度卡片 -->
        <div class="card health-card">
          <div class="card-head">
            <span class="card-title">
              <el-icon class="section-icon"><TrendCharts /></el-icon>
              系统健康度
            </span>
            <span class="card-extra">HEALTH</span>
          </div>
          <div class="card-body health-body">
            <div class="health-ring">
              <el-progress
                type="dashboard"
                :percentage="healthLevel.percent"
                :width="140"
                :stroke-width="10"
                :color="healthLevel.color === 'success' ? '#10b981' : healthLevel.color === 'warning' ? '#f59e0b' : '#ef4444'"
              >
                <template #default="{ percentage }">
                  <div class="health-inner">
                    <span class="health-score">{{ percentage }}</span>
                    <span class="health-label">{{ healthLevel.label }}</span>
                  </div>
                </template>
              </el-progress>
            </div>
            <div class="health-meta">
              <div class="health-item" v-if="missingRequired > 0">
                <el-icon class="health-icon danger"><WarningFilled /></el-icon>
                <span class="danger">{{ missingRequired }} 项必需依赖缺失</span>
              </div>
              <div class="health-item" v-else>
                <el-icon class="health-icon success"><CircleCheckFilled /></el-icon>
                <span class="success">所有必需依赖已安装</span>
              </div>
              <div class="health-item" v-if="pm2Stats.stopped > 0">
                <el-icon class="health-icon warning"><WarningFilled /></el-icon>
                <span class="warning">{{ pm2Stats.stopped }} 个进程异常</span>
              </div>
              <div class="health-item" v-else>
                <el-icon class="health-icon success"><CircleCheckFilled /></el-icon>
                <span class="success">所有 PM2 进程运行正常</span>
              </div>
              <div class="health-item">
                <el-icon class="health-icon"><Timer /></el-icon>
                <span>采集于 {{ new Date(envInfo.collectedAt).toLocaleTimeString('zh-CN') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 关键指标卡片 -->
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-icon mem"><DataLine /></div>
            <div class="metric-content">
              <div class="metric-label">内存使用</div>
              <div class="metric-value">{{ envInfo.memory.used }} / {{ envInfo.memory.total }}</div>
              <div class="metric-bar">
                <div
                  class="metric-bar-fill"
                  :style="{ width: pctWidth(envInfo.memory.usePercent), background: pctNum(envInfo.memory.usePercent) > 85 ? 'var(--danger)' : 'var(--gold-500)' }"
                ></div>
              </div>
              <div class="metric-tip">{{ envInfo.memory.usePercent }} 已使用（剩 {{ envInfo.memory.free }}）</div>
            </div>
          </div>

          <div class="metric-card" v-if="envInfo.diskUsage">
            <div class="metric-icon disk"><Files /></div>
            <div class="metric-content">
              <div class="metric-label">磁盘使用</div>
              <div class="metric-value">{{ envInfo.diskUsage.used }} / {{ envInfo.diskUsage.size }}</div>
              <div class="metric-bar">
                <div
                  class="metric-bar-fill"
                  :style="{ width: pctWidth(envInfo.diskUsage.usePercent), background: pctNum(envInfo.diskUsage.usePercent) > 85 ? 'var(--danger)' : 'var(--gold-500)' }"
                ></div>
              </div>
              <div class="metric-tip">{{ envInfo.diskUsage.usePercent }} 已使用（剩 {{ envInfo.diskUsage.avail }}）</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon cpu"><Cpu /></div>
            <div class="metric-content">
              <div class="metric-label">CPU 负载（1m）</div>
              <div class="metric-value">{{ fmtLoad(envInfo.cpu.loadavg[0]) }}</div>
              <div class="metric-tip">{{ envInfo.cpu.cores }} 核 / {{ envInfo.cpu.model }}</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon pm2"><Monitor /></div>
            <div class="metric-content">
              <div class="metric-label">PM2 进程</div>
              <div class="metric-value">
                <span class="text-success">{{ pm2Stats.online }}</span>
                <span class="text-muted"> / </span>
                <span>{{ pm2Stats.total }}</span>
              </div>
              <div class="metric-tip">
                <span v-if="pm2Stats.stopped > 0" class="text-danger">{{ pm2Stats.stopped }} 个异常</span>
                <span v-else class="text-success">全部在线</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 依赖版本检查 ============ -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">
            <el-icon class="section-icon"><Box /></el-icon>
            依赖版本检查
          </span>
          <span class="card-extra">DEPENDENCIES</span>
        </div>
        <div class="card-body">
          <div class="version-grid">
            <div
              v-for="item in versionCards"
              :key="item.key"
              class="version-item"
              :class="{ 'is-missing': !item.ok, 'is-required': item.required }"
            >
              <div class="version-icon">
                <el-icon><component :is="item.icon" /></el-icon>
              </div>
              <div class="version-meta">
                <div class="version-label">
                  {{ item.label }}
                  <span v-if="item.required" class="required-badge">必需</span>
                  <span v-else class="optional-badge">可选</span>
                </div>
                <div class="version-desc">{{ item.desc }}</div>
                <div class="version-value" :title="item.value">{{ item.value }}</div>
              </div>
              <el-tag
                :type="item.ok ? 'success' : 'danger'"
                size="small"
                effect="plain"
                class="version-tag"
              >
                {{ item.ok ? '已安装' : '缺失' }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 应用信息 & Git 信息 ============ -->
      <div class="meta-grid">
        <!-- 应用运行信息 -->
        <div class="card">
          <div class="card-head">
            <span class="card-title">
              <el-icon class="section-icon"><Platform /></el-icon>
              应用运行信息
            </span>
            <span class="card-extra">APP</span>
          </div>
          <div class="card-body">
            <div class="info-list">
              <div class="info-row">
                <span class="info-label">应用版本</span>
                <span class="info-value"><code>v{{ envInfo.app.version }}</code></span>
              </div>
              <div class="info-row">
                <span class="info-label">运行时长</span>
                <span class="info-value"><code>{{ envInfo.app.uptime }}</code></span>
              </div>
              <div class="info-row">
                <span class="info-label">进程 PID</span>
                <span class="info-value"><code>{{ envInfo.app.pid }}</code></span>
              </div>
              <div class="info-row">
                <span class="info-label">NODE_ENV</span>
                <span class="info-value">
                  <el-tag
                    :type="envInfo.app.nodeEnv === 'production' ? 'success' : 'warning'"
                    size="small"
                    effect="plain"
                  >
                    {{ envInfo.app.nodeEnv }}
                  </el-tag>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Git 信息 -->
        <div class="card" v-if="envInfo.gitInfo">
          <div class="card-head">
            <span class="card-title">
              <el-icon class="section-icon"><Link /></el-icon>
              Git 仓库信息
            </span>
            <span class="card-extra">GIT</span>
          </div>
          <div class="card-body">
            <div class="info-list">
              <div class="info-row">
                <span class="info-label">当前分支</span>
                <span class="info-value"><code>{{ envInfo.gitInfo.branch }}</code></span>
              </div>
              <div class="info-row">
                <span class="info-label">最新提交</span>
                <span class="info-value"><code class="commit-hash">{{ envInfo.gitInfo.commit }}</code></span>
              </div>
              <div class="info-row">
                <span class="info-label">未提交改动</span>
                <span class="info-value">
                  <el-tag
                    :type="envInfo.gitInfo.dirtyFiles > 0 ? 'warning' : 'success'"
                    size="small"
                    effect="plain"
                  >
                    {{ envInfo.gitInfo.dirtyFiles }} 个文件
                  </el-tag>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ PM2 进程列表 ============ -->
      <div class="card" v-if="envInfo.pm2Processes.length > 0">
        <div class="card-head">
          <span class="card-title">
            <el-icon class="section-icon"><Cpu /></el-icon>
            PM2 进程列表
          </span>
          <span class="card-extra">{{ pm2Stats.online }}/{{ pm2Stats.total }} ONLINE</span>
        </div>
        <div class="card-body no-pad">
          <el-table :data="envInfo.pm2Processes" class="pm2-table">
            <el-table-column prop="name" label="进程名称" min-width="160">
              <template #default="{ row }">
                <div class="proc-name">
                  <span class="proc-name-text">{{ row.name }}</span>
                  <span class="proc-version" v-if="row.version">v{{ row.version }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="pid" label="PID" width="90">
              <template #default="{ row }"><code>{{ row.pid }}</code></template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag
                  :type="row.status === 'online' ? 'success' : 'danger'"
                  size="small"
                  effect="dark"
                >
                  <el-icon style="vertical-align: middle; margin-right: 2px;">
                    <CircleCheck v-if="row.status === 'online'" />
                    <CircleClose v-else />
                  </el-icon>
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="运行时长" width="130">
              <template #default="{ row }">{{ formatPm2Uptime(row.uptime) }}</template>
            </el-table-column>
            <el-table-column label="内存占用" width="120">
              <template #default="{ row }">
                <div class="proc-mem">
                  <span>{{ formatBytes(row.memory) }}</span>
                  <div class="proc-mem-bar" v-if="row.memory">
                    <div
                      class="proc-mem-fill"
                      :style="{ width: Math.min(100, (row.memory / 1024 / 1024 / 1024) * 100) + '%' }"
                    ></div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="CPU" width="90">
              <template #default="{ row }">
                <span :class="{ 'text-danger': Number(row.cpu) > 80 }">{{ fmtCpu(row.cpu) }}%</span>
              </template>
            </el-table-column>
            <el-table-column prop="restarts" label="重启次数" width="100">
              <template #default="{ row }">
                <span :class="{ 'text-warning': row.restarts > 5, 'text-danger': row.restarts > 20 }">
                  {{ row.restarts }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- ============ CPU 详细信息 ============ -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">
            <el-icon class="section-icon"><Cpu /></el-icon>
            CPU 详细信息
          </span>
          <span class="card-extra">CPU</span>
        </div>
        <div class="card-body">
          <div class="cpu-info">
            <div class="cpu-meta">
              <div class="cpu-meta-item">
                <span class="cpu-meta-label">型号</span>
                <span class="cpu-meta-value">{{ envInfo.cpu.model }}</span>
              </div>
              <div class="cpu-meta-item">
                <span class="cpu-meta-label">核心数</span>
                <span class="cpu-meta-value">{{ envInfo.cpu.cores }} 核</span>
              </div>
              <div class="cpu-meta-item" v-if="envInfo.cpu.speed">
                <span class="cpu-meta-label">主频</span>
                <span class="cpu-meta-value">{{ envInfo.cpu.speed }}</span>
              </div>
            </div>
            <div class="loadavg-grid">
              <div class="loadavg-item">
                <div class="loadavg-label">1 分钟</div>
                <div class="loadavg-value" :class="{ 'text-danger': Number(envInfo.cpu.loadavg[0]) > envInfo.cpu.cores }">
                  {{ fmtLoad(envInfo.cpu.loadavg[0]) }}
                </div>
              </div>
              <div class="loadavg-item">
                <div class="loadavg-label">5 分钟</div>
                <div class="loadavg-value" :class="{ 'text-warning': Number(envInfo.cpu.loadavg[1]) > envInfo.cpu.cores }">
                  {{ fmtLoad(envInfo.cpu.loadavg[1]) }}
                </div>
              </div>
              <div class="loadavg-item">
                <div class="loadavg-label">15 分钟</div>
                <div class="loadavg-value">
                  {{ fmtLoad(envInfo.cpu.loadavg[2]) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 空状态 -->
    <div v-else-if="!loading && !errorMsg" class="empty-state">
      <el-icon class="empty-icon"><Box /></el-icon>
      <div class="empty-text">暂无环境信息</div>
      <el-button class="btn-gold" @click="loadEnvInfo">重新加载</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-env {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页面头 ============
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 4px;

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .page-title {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    letter-spacing: -0.3px;
  }

  .page-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--text-tertiary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  @include mobile {
    .page-title { font-size: 22px; }
    .header-actions { width: 100%; }
    .header-actions .el-button { flex: 1; }
  }
}

// ============ 卡片通用 ============
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  border-radius: 4px;
  overflow: hidden;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-base);

  .card-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.2px;
  }

  .section-icon {
    color: var(--gold-400);
    font-size: 16px;
  }

  .card-extra {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 1px;
    color: var(--text-tertiary);
    text-transform: uppercase;
  }
}

.card-body {
  padding: 20px;

  &.no-pad {
    padding: 0;
  }
}

// ============ 顶部概览行 ============
.overview-row {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  align-items: stretch;

  @include tablet-down {
    grid-template-columns: 1fr;
  }
}

// 健康度卡片
.health-card {
  display: flex;
  flex-direction: column;
}

.health-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 20px !important;
}

.health-ring {
  :deep(.el-progress) {
    .el-progress__text {
      display: none;
    }
  }
}

.health-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;

  .health-score {
    font-family: 'JetBrains Mono', monospace;
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
  }

  .health-label {
    font-size: 12px;
    color: var(--text-tertiary);
    letter-spacing: 1px;
  }
}

.health-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.health-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);

  .health-icon {
    font-size: 14px;
    color: var(--text-tertiary);

    &.success { color: var(--success, #10b981); }
    &.warning { color: var(--warning, #f59e0b); }
    &.danger { color: var(--danger, #ef4444); }
  }

  .success { color: var(--success, #10b981); }
  .warning { color: var(--warning, #f59e0b); }
  .danger { color: var(--danger, #ef4444); }
}

// 指标网格
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  border-radius: 4px;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--border-gold);
  }

  .metric-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 18px;
    color: var(--gold-400);
    background: var(--bg-subtle);
    border: 1px solid var(--border-light);

    &.mem { color: #f59e0b; }
    &.disk { color: #3b82f6; }
    &.cpu { color: #10b981; }
    &.pm2 { color: #8b5cf6; }
  }

  .metric-content {
    flex: 1;
    min-width: 0;
  }

  .metric-label {
    font-size: 11px;
    color: var(--text-tertiary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .metric-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .metric-bar {
    height: 4px;
    background: var(--bg-subtle);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .metric-bar-fill {
    height: 100%;
    background: var(--gold-500);
    border-radius: 2px;
    transition: width 0.3s var(--ease-out-expo);
  }

  .metric-tip {
    font-size: 11px;
    color: var(--text-tertiary);
  }
}

// ============ 依赖版本检查 ============
.version-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--border-gold);
    transform: translateY(-1px);
  }

  &.is-missing {
    border-color: var(--danger);
    background: var(--danger-bg, rgba(239, 68, 68, 0.05));
  }

  .version-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-elevated);
    border: 1px solid var(--border-base);
    border-radius: 4px;
    color: var(--gold-400);
    font-size: 16px;
  }

  .version-meta {
    flex: 1;
    min-width: 0;

    .version-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 2px;
    }

    .version-desc {
      font-size: 11px;
      color: var(--text-tertiary);
      margin-bottom: 4px;
    }

    .version-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .version-tag {
    flex-shrink: 0;
  }

  .required-badge {
    display: inline-block;
    padding: 0 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: var(--danger);
    border: 1px solid var(--danger);
    border-radius: 2px;
    text-transform: uppercase;
  }

  .optional-badge {
    display: inline-block;
    padding: 0 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: var(--text-tertiary);
    border: 1px solid var(--border-base);
    border-radius: 2px;
    text-transform: uppercase;
  }
}

// ============ 信息列表 ============
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.info-list {
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  .info-label {
    font-size: 12px;
    color: var(--text-tertiary);
    letter-spacing: 0.3px;
  }

  .info-value {
    font-size: 13px;
    color: var(--text-primary);

    code {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-primary);
      background: var(--bg-subtle);
      padding: 2px 8px;
      border-radius: 2px;
      font-size: 12px;
    }

    .commit-hash {
      font-size: 11px;
    }
  }
}

// ============ PM2 表格 ============
.pm2-table {
  :deep(.el-table) {
    --el-table-border-color: var(--border-light);
    --el-table-header-bg-color: var(--bg-subtle);
    --el-table-row-hover-bg-color: var(--bg-subtle);
    background: transparent;
  }

  :deep(.el-table th.el-table__cell) {
    background: var(--bg-subtle);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  :deep(.el-table .cell) {
    font-size: 13px;
  }
}

.proc-name {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .proc-name-text {
    font-weight: 500;
    color: var(--text-primary);
  }

  .proc-version {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text-tertiary);
  }
}

.proc-mem {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.proc-mem-bar {
  height: 3px;
  background: var(--bg-subtle);
  border-radius: 2px;
  overflow: hidden;
}

.proc-mem-fill {
  height: 100%;
  background: var(--gold-400);
  border-radius: 2px;
}

// ============ CPU 信息 ============
.cpu-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cpu-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--border-light);
}

.cpu-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .cpu-meta-label {
    font-size: 11px;
    color: var(--text-tertiary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .cpu-meta-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;
  }
}

.loadavg-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.loadavg-item {
  padding: 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  text-align: center;

  .loadavg-label {
    font-size: 11px;
    color: var(--text-tertiary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .loadavg-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary);
  }
}

// ============ 文本工具类 ============
.text-success { color: var(--success, #10b981); }
.text-warning { color: var(--warning, #f59e0b); }
.text-danger { color: var(--danger, #ef4444); }
.text-muted { color: var(--text-tertiary); }

// ============ 错误提示 ============
.err-detail {
  display: flex;
  align-items: center;
  gap: 12px;
}

// ============ 空状态 ============
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  text-align: center;

  .empty-icon {
    font-size: 48px;
    color: var(--text-tertiary);
  }

  .empty-text {
    font-size: 14px;
    color: var(--text-tertiary);
  }
}

// ============ 响应式 ============
@include mobile {
  .admin-env { gap: 12px; }

  .card-body {
    padding: 16px;
  }

  .version-grid {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .loadavg-grid {
    grid-template-columns: 1fr;
  }

  .pm2-table {
    :deep(.el-table) {
      font-size: 12px;
    }
  }
}
</style>
