<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

// ============ 类型定义 ============
interface VersionInfo {
  currentVersion: string;
  latestVersion: string | null;
  needUpdate: boolean;
  repo: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  checkedAt: string;
  error: string | null;
}

interface UpdateStatus {
  status: 'SUCCESS' | 'FAILED' | 'RUNNING' | 'IDLE';
  message: string;
  progress: number;
  step: string;
  updatedAt: string;
  logFile: string;
  isRunning: boolean;
  lockPid: number | null;
  lockAgeSeconds: number | null;
  latestLog: string | null;
  logTail: string | null;
  checkedAt: string;
}

// ============ 版本检查 ============
const versionLoading = ref(false);
const versionInfo = ref<VersionInfo | null>(null);

async function loadVersionCheck() {
  versionLoading.value = true;
  try {
    const res: any = await adminApi.versionCheck();
    if (res?.success) {
      versionInfo.value = res.data;
    }
  } catch (e: any) {
    ElMessage.error('版本检查失败：' + (e?.message || '未知错误'));
  } finally {
    versionLoading.value = false;
  }
}

// 是否有新版本（用于顶部醒目提示）
const hasUpdate = computed(() => versionInfo.value?.needUpdate === true);
const isLatest = computed(() => versionInfo.value?.latestVersion && !versionInfo.value?.needUpdate);
const isUnknown = computed(() => !versionInfo.value?.latestVersion);

// ============ 强制更新 ============
const updateLoading = ref(false);
const updateStatus = ref<UpdateStatus | null>(null);
const updatePolling = ref<number | null>(null);

// 部署域名（可选）：用于 SSL 证书申请，留空则使用 .deploy-meta.json 中已有配置
const deployDomain = ref('');

async function loadUpdateStatus() {
  try {
    const res: any = await adminApi.updateStatus();
    if (res?.success) {
      updateStatus.value = res.data;
    }
  } catch (e) {
    // 静默失败
  }
}

async function handleForceUpdate() {
  // 校验域名格式（如果填写了）
  const domain = deployDomain.value.trim().toLowerCase();
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    ElMessage.error('域名格式不正确，应为 example.com 或 www.example.com 形式');
    return;
  }

  const domainHint = domain
    ? `\n\n本次更新将设置部署域名为：${domain}\n（自动申请 SSL 证书并启用 HTTPS，需确保域名已解析到本服务器且 80 端口可外网访问）`
    : '';

  try {
    await ElMessageBox.confirm(
      `将触发服务器一键更新（git pull → 安装依赖 → 数据库迁移 → 构建 → 重启 PM2）。\n\n更新过程中后端服务会重启，可能导致短暂不可用（10-30 秒）。${domainHint}\n\n确认继续？`,
      '触发强制更新',
      {
        customClass: 'keke-confirm-box',
        confirmButtonClass: 'el-button--primary',
        confirmButtonText: '确认更新',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  updateLoading.value = true;
  try {
    const payload: { domain?: string } = domain ? { domain } : {};
    const res: any = await adminApi.forceUpdate(payload);
    if (res?.success) {
      ElMessage.success('更新已开始，请通过下方状态面板查看进度');
      // 域名已提交后清空输入框（已写入 .deploy-meta.json）
      if (domain) {
        deployDomain.value = '';
      }
      startPolling();
    }
  } catch (e: any) {
    ElMessage.error('触发更新失败：' + (e?.message || '未知错误'));
  } finally {
    updateLoading.value = false;
  }
}

// 轮询更新状态（每 3 秒一次，运行中才轮询）
function startPolling() {
  if (updatePolling.value !== null) return;
  loadUpdateStatus();
  updatePolling.value = window.setInterval(async () => {
    await loadUpdateStatus();
    if (updateStatus.value && !updateStatus.value.isRunning) {
      stopPolling();
      if (updateStatus.value.status === 'SUCCESS') {
        ElMessage.success('更新已完成，服务已重启');
        // 更新完成后重新检查版本
        setTimeout(() => loadVersionCheck(), 2000);
      } else if (updateStatus.value.status === 'FAILED') {
        ElMessage.error('更新失败，请查看日志');
      }
    }
  }, 3000);
}

function stopPolling() {
  if (updatePolling.value !== null) {
    clearInterval(updatePolling.value);
    updatePolling.value = null;
  }
}

// 更新进度百分比
const updateProgress = computed(() => {
  if (!updateStatus.value) return 0;
  return updateStatus.value.progress || 0;
});

// 状态对应的标签类型
const statusTagType = computed(() => {
  if (!updateStatus.value) return 'info';
  switch (updateStatus.value.status) {
    case 'SUCCESS': return 'success';
    case 'FAILED': return 'danger';
    case 'RUNNING': return 'warning';
    default: return 'info';
  }
});

const statusLabel = computed(() => {
  if (!updateStatus.value) return '未查询';
  switch (updateStatus.value.status) {
    case 'SUCCESS': return '更新成功';
    case 'FAILED': return '更新失败';
    case 'RUNNING': return '更新中';
    case 'IDLE': return '空闲';
    default: return updateStatus.value.status;
  }
});

// 更新步骤文案
const STEP_LABELS: Record<string, string> = {
  '1': '前置检查',
  '2': '备份',
  '3': '拉取代码',
  '4': '安装依赖',
  '5': '数据库迁移',
  '6': '构建',
  '7': '重启服务',
  '8': '健康检查',
  '9': '清理',
};

const currentStepLabel = computed(() => {
  if (!updateStatus.value?.step) return '';
  return STEP_LABELS[updateStatus.value.step] || `步骤 ${updateStatus.value.step}`;
});

onMounted(() => {
  loadVersionCheck();
  loadUpdateStatus();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <div class="admin-version">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">VERSION &amp; UPDATE</span>
        <h2 class="page-title font-display">版本更新</h2>
        <p class="page-subtitle">检查 GitHub Release 最新版本，一键部署服务器更新</p>
      </div>
      <div class="header-actions">
        <el-button
          class="btn-outline"
          :loading="versionLoading"
          @click="loadVersionCheck"
        >
          <el-icon style="margin-right: 6px;"><Refresh /></el-icon>
          重新检查
        </el-button>
      </div>
    </div>

    <!-- ============ 版本对比卡片 ============ -->
    <div class="card version-card" v-loading="versionLoading">
      <div class="card-head">
        <span class="card-title">
          <el-icon class="section-icon"><Promotion /></el-icon>
          版本检查
        </span>
        <span class="card-extra">RELEASE</span>
      </div>
      <div class="card-body">
        <div class="version-compare" v-if="versionInfo">
          <!-- 当前版本 -->
          <div class="version-box">
            <div class="version-box-label">当前版本</div>
            <div class="version-box-value">v{{ versionInfo.currentVersion }}</div>
            <div class="version-box-sub">服务器运行版本</div>
          </div>

          <!-- 箭头 -->
          <div class="version-arrow">
            <el-icon><Right /></el-icon>
            <div class="version-arrow-text">对比</div>
          </div>

          <!-- 最新版本 -->
          <div class="version-box">
            <div class="version-box-label">最新版本</div>
            <div
              class="version-box-value"
              :class="{ 'has-update': hasUpdate, 'is-latest': isLatest }"
            >
              <template v-if="versionInfo.latestVersion">
                v{{ versionInfo.latestVersion }}
              </template>
              <template v-else>—</template>
            </div>
            <div class="version-box-sub" v-if="versionInfo.publishedAt">
              {{ new Date(versionInfo.publishedAt).toLocaleDateString('zh-CN') }} 发布
            </div>
            <div class="version-box-sub" v-else-if="isUnknown">未获取到 Release</div>
          </div>

          <!-- 状态徽章 -->
          <div class="version-status">
            <el-tag
              v-if="hasUpdate"
              type="warning"
              effect="dark"
              size="large"
              class="status-tag"
            >
              <el-icon style="vertical-align: middle; margin-right: 4px;"><Top /></el-icon>
              有新版本可用
            </el-tag>
            <el-tag
              v-else-if="isLatest"
              type="success"
              effect="plain"
              size="large"
              class="status-tag"
            >
              <el-icon style="vertical-align: middle; margin-right: 4px;"><CircleCheck /></el-icon>
              已是最新版本
            </el-tag>
            <el-tag
              v-else
              type="info"
              effect="plain"
              size="large"
              class="status-tag"
            >
              <el-icon style="vertical-align: middle; margin-right: 4px;"><Warning /></el-icon>
              无法获取最新版本
            </el-tag>
          </div>
        </div>

        <!-- 错误提示 -->
        <el-alert
          v-if="versionInfo?.error"
          :title="versionInfo.error"
          type="warning"
          :closable="false"
          show-icon
          class="version-alert"
        />

        <!-- Release 信息 -->
        <div class="release-info" v-if="versionInfo?.releaseUrl">
          <div class="release-meta">
            <span v-if="versionInfo.repo" class="meta-item">
              <el-icon><Link /></el-icon>
              仓库：{{ versionInfo.repo }}
            </span>
            <a
              v-if="versionInfo.releaseUrl"
              :href="versionInfo.releaseUrl"
              target="_blank"
              rel="noopener"
              class="release-link meta-item"
            >
              <el-icon><View /></el-icon>
              查看 Release 详情
              <el-icon><Right /></el-icon>
            </a>
            <span v-if="versionInfo.publishedAt" class="meta-item">
              <el-icon><Calendar /></el-icon>
              发布于 {{ new Date(versionInfo.publishedAt).toLocaleString('zh-CN') }}
            </span>
          </div>

          <!-- Release Notes -->
          <div class="release-notes" v-if="versionInfo.releaseNotes">
            <div class="release-notes-head">
              <el-icon><Document /></el-icon>
              <span>Release Notes</span>
            </div>
            <pre>{{ versionInfo.releaseNotes }}</pre>
          </div>
        </div>

        <!-- 检查时间 -->
        <div class="version-actions" v-if="versionInfo">
          <span class="env-collected">
            上次检查：{{ new Date(versionInfo.checkedAt).toLocaleString('zh-CN') }}
          </span>
          <el-button
            class="btn-gold"
            v-if="hasUpdate"
            :loading="updateLoading"
            :disabled="updateStatus?.isRunning"
            @click="handleForceUpdate"
          >
            <el-icon style="margin-right: 6px;"><Download /></el-icon>
            立即更新到最新版本
          </el-button>
        </div>
      </div>
    </div>

    <!-- ============ 一键更新 ============ -->
    <div class="card update-card">
      <div class="card-head">
        <span class="card-title">
          <el-icon class="section-icon"><Tools /></el-icon>
          一键更新
        </span>
        <span class="card-extra">DEPLOY</span>
      </div>
      <div class="card-body">
        <!-- 域名设置（用于 SSL 证书申请） -->
        <div class="domain-config">
          <div class="domain-config-head">
            <div class="domain-config-title">
              <el-icon><Link /></el-icon>
              <span>部署域名（可选）</span>
            </div>
            <el-tag size="small" type="warning" effect="plain">SSL</el-tag>
          </div>
          <p class="domain-config-desc">
            填写后将自动申请 Let's Encrypt SSL 证书并启用 HTTPS。
            需确保域名已解析到本服务器 IP，且 80 端口可被外网访问（用于 HTTP-01 验证）。
            留空则使用服务器上 <code>.deploy-meta.json</code> 已有的域名配置。
          </p>
          <div class="domain-config-input">
            <el-input
              v-model="deployDomain"
              placeholder="例如：keyucloud.tech"
              :disabled="updateStatus?.isRunning"
              clearable
            >
              <template #prefix>
                <el-icon><Link /></el-icon>
              </template>
            </el-input>
          </div>
          <div class="domain-config-tip">
            <el-icon><InfoFilled /></el-icon>
            <span>现代浏览器对 .tech / .app 等 TLD 强制 HTTPS，未配置 SSL 会导致"无法连接"错误。</span>
          </div>
        </div>

        <!-- 更新流程说明 -->
        <div class="update-flow">
          <div class="update-flow-title">
            <el-icon><InfoFilled /></el-icon>
            <span>更新流程</span>
          </div>
          <p class="update-flow-desc">
            点击下方按钮将触发服务器执行 <code>deploy/update.sh</code> 脚本，
            完整包含 9 个步骤，全程自动化执行。
          </p>

          <!-- 9 步流程图 -->
          <div class="flow-steps">
            <div
              v-for="(label, idx) in [
                '前置检查', '备份', '拉取代码', '安装依赖', '数据库迁移',
                '构建', '重启服务', '健康检查', '清理'
              ]"
              :key="idx"
              class="flow-step"
              :class="{
                'is-active': updateStatus?.isRunning && String(idx + 1) === updateStatus?.step,
                'is-success': updateStatus?.status === 'SUCCESS',
                'is-failed': updateStatus?.status === 'FAILED' && String(idx + 1) === updateStatus?.step,
              }"
            >
              <div class="flow-step-num">{{ idx + 1 }}</div>
              <div class="flow-step-label">{{ label }}</div>
            </div>
          </div>

          <div class="update-warn">
            <el-icon><WarningFilled /></el-icon>
            <span>⚠️ 更新过程中后端会重启，可能导致 10-30 秒短暂不可用。</span>
          </div>
        </div>

        <!-- 触发按钮 -->
        <div class="update-action">
          <el-button
            class="btn-gold"
            size="large"
            :loading="updateLoading"
            :disabled="updateStatus?.isRunning"
            @click="handleForceUpdate"
          >
            <el-icon style="margin-right: 6px;"><Promotion /></el-icon>
            {{ updateStatus?.isRunning ? '更新进行中...' : '触发强制更新' }}
          </el-button>
          <span class="update-action-tip" v-if="updateStatus?.isRunning">
            正在执行步骤 {{ updateStatus.step }}/9：{{ currentStepLabel }}
          </span>
        </div>

        <!-- 更新状态面板 -->
        <div class="update-status-panel" v-if="updateStatus">
          <div class="status-head">
            <div class="status-title">
              <span>更新状态</span>
              <el-tag :type="statusTagType" effect="dark" size="default">
                {{ statusLabel }}
              </el-tag>
            </div>
            <span class="env-collected">
              最后更新：{{ new Date(updateStatus.updatedAt).toLocaleString('zh-CN') }}
            </span>
          </div>

          <!-- 进度条 -->
          <el-progress
            :percentage="updateProgress"
            :stroke-width="12"
            :status="updateStatus.status === 'SUCCESS' ? 'success' : updateStatus.status === 'FAILED' ? 'exception' : undefined"
            class="update-progress"
          >
            <template #default="{ percentage }">
              <span class="progress-text">{{ percentage }}% ({{ updateStatus.step }}/9)</span>
            </template>
          </el-progress>

          <!-- 状态消息 -->
          <div class="status-message">
            <el-icon><InfoFilled /></el-icon>
            <span class="status-msg-text">{{ updateStatus.message || '无消息' }}</span>
            <span class="status-step" v-if="updateStatus.step">
              步骤 {{ updateStatus.step }}/9：{{ currentStepLabel }}
            </span>
          </div>

          <!-- 锁信息（运行中显示） -->
          <div class="status-meta" v-if="updateStatus.isRunning && updateStatus.lockPid">
            <div class="meta-item">
              <span class="meta-label">执行 PID</span>
              <code>{{ updateStatus.lockPid }}</code>
            </div>
            <div class="meta-item" v-if="updateStatus.lockAgeSeconds !== null">
              <span class="meta-label">已运行</span>
              <code>{{ Math.floor(updateStatus.lockAgeSeconds / 60) }}m {{ updateStatus.lockAgeSeconds % 60 }}s</code>
            </div>
            <div class="meta-item" v-if="updateStatus.latestLog">
              <span class="meta-label">日志文件</span>
              <code>{{ updateStatus.latestLog }}</code>
            </div>
          </div>

          <!-- 日志输出 -->
          <div class="log-panel" v-if="updateStatus.logTail">
            <div class="log-head">
              <div class="log-head-title">
                <el-icon><Document /></el-icon>
                <span>更新日志（最后 50 行）</span>
              </div>
              <el-button
                text
                size="small"
                @click="loadUpdateStatus"
                :loading="updateStatus.isRunning"
              >
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
            <pre class="log-content">{{ updateStatus.logTail }}</pre>
          </div>
        </div>

        <!-- 空状态：尚未触发过更新 -->
        <div class="empty-status" v-else>
          <el-icon class="empty-icon"><Promotion /></el-icon>
          <div class="empty-text">尚未触发过更新</div>
          <div class="empty-tip">点击上方按钮开始一键更新</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-version {
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
}

// ============ 版本对比 ============
.version-compare {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  padding: 24px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;

  .version-box {
    flex: 1;
    min-width: 160px;
    text-align: center;
    padding: 12px;

    .version-box-label {
      font-size: 11px;
      color: var(--text-tertiary);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .version-box-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.2;
      margin-bottom: 6px;

      &.has-update {
        color: var(--warning);
      }

      &.is-latest {
        color: var(--success, #10b981);
      }
    }

    .version-box-sub {
      font-size: 11px;
      color: var(--text-tertiary);
    }
  }

  .version-arrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--text-tertiary);

    .el-icon {
      font-size: 24px;
    }

    .version-arrow-text {
      font-size: 10px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
  }

  .version-status {
    flex-shrink: 0;
  }

  .status-tag {
    padding: 16px 20px;
    font-size: 14px;
  }

  @include mobile {
    .version-box { min-width: 100%; padding: 8px; }
    .version-arrow {
      flex-direction: row;
      gap: 8px;

      .version-arrow-text { display: none; }
    }
    .version-status { width: 100%; }
    .status-tag { width: 100%; }
  }
}

.version-alert {
  margin-top: 12px;
}

// ============ Release 信息 ============
.release-info {
  margin-top: 16px;
  padding: 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;

  .release-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 20px;
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 12px;

    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;

      .el-icon {
        color: var(--gold-400);
        font-size: 13px;
      }
    }

    .release-link {
      color: var(--gold-500);
      text-decoration: none;

      &:hover {
        color: var(--gold-600);
      }
    }
  }

  .release-notes {
    &-head {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-tertiary);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 8px;

      .el-icon { color: var(--gold-400); }
    }

    pre {
      margin: 0;
      padding: 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-light);
      border-radius: 2px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px;
      overflow-y: auto;
      line-height: 1.6;
    }
  }
}

// ============ 版本操作 ============
.version-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-light);
}

.env-collected {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', monospace;
}

// ============ 域名配置 ============
.domain-config {
  padding: 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  margin-bottom: 16px;

  .domain-config-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .domain-config-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);

    .el-icon {
      color: var(--gold-400);
    }
  }

  .domain-config-desc {
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.6;

    code {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-primary);
      background: var(--bg-elevated);
      padding: 1px 6px;
      border-radius: 2px;
      font-size: 11px;
    }
  }

  .domain-config-input {
    margin-bottom: 10px;
  }

  .domain-config-tip {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 11px;
    color: var(--warning);
    line-height: 1.5;
    padding: 8px 10px;
    background: var(--warning-bg, rgba(245, 158, 11, 0.08));
    border-radius: 3px;

    .el-icon {
      flex-shrink: 0;
      margin-top: 1px;
    }
  }
}

// ============ 更新流程 ============
.update-flow {
  padding: 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  margin-bottom: 16px;


  &-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;

    .el-icon { color: var(--gold-400); }
  }

  &-desc {
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;

    code {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-primary);
      background: var(--bg-elevated);
      padding: 1px 6px;
      border-radius: 2px;
      font-size: 12px;
    }
  }
}

// 9 步流程图
.flow-steps {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 4px;
  margin-bottom: 12px;

  @include tablet-down {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  @include mobile {
    grid-template-columns: repeat(2, 1fr);
  }
}

.flow-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  transition: all 0.2s;

  &.is-active {
    border-color: var(--gold-400);
    background: var(--gold-bg, rgba(212, 175, 55, 0.08));

    .flow-step-num {
      background: var(--gold-500);
      color: var(--text-inverse);
    }
  }

  &.is-success {
    border-color: var(--success, #10b981);

    .flow-step-num {
      background: var(--success, #10b981);
      color: white;
    }
  }

  &.is-failed {
    border-color: var(--danger, #ef4444);

    .flow-step-num {
      background: var(--danger, #ef4444);
      color: white;
    }
  }

  .flow-step-num {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--bg-subtle);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    transition: all 0.2s;
  }

  .flow-step-label {
    font-size: 10px;
    color: var(--text-tertiary);
    text-align: center;
    line-height: 1.2;
  }
}

.update-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--warning);
  padding: 8px 12px;
  background: var(--warning-bg, rgba(245, 158, 11, 0.08));
  border-radius: 4px;

  .el-icon {
    flex-shrink: 0;
  }
}

// ============ 更新触发 ============
.update-action {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;

  .update-action-tip {
    font-size: 13px;
    color: var(--gold-500);
    font-weight: 500;
  }

  @include mobile {
    .el-button { width: 100%; }
  }
}

// ============ 更新状态面板 ============
.update-status-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;
}

.status-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;

  .status-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.update-progress {
  margin: 0;

  .progress-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 600;
  }
}

.status-message {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  flex-wrap: wrap;

  .el-icon {
    color: var(--gold-400);
    flex-shrink: 0;
  }

  .status-msg-text {
    flex: 1;
    min-width: 0;
  }

  .status-step {
    color: var(--text-tertiary);
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
  }
}

.status-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: 4px;

  .meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;

    .meta-label {
      color: var(--text-tertiary);
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-primary);
      background: var(--bg-subtle);
      padding: 1px 6px;
      border-radius: 2px;
      font-size: 11px;
    }
  }
}

// 日志面板
.log-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;

  .log-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--text-tertiary);

    &-title {
      display: flex;
      align-items: center;
      gap: 4px;

      .el-icon { color: var(--gold-400); }
    }
  }

  .log-content {
    margin: 0;
    padding: 12px;
    background: var(--bg-inverse);
    color: var(--text-inverse);
    border-radius: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    line-height: 1.6;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

// 空状态
.empty-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  text-align: center;

  .empty-icon {
    font-size: 48px;
    color: var(--text-tertiary);
  }

  .empty-text {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .empty-tip {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

// ============ 响应式 ============
@include mobile {
  .admin-version { gap: 12px; }
  .card-body { padding: 16px; }
  .version-compare { padding: 16px; }
  .update-flow { padding: 12px; }
  .update-action { padding: 12px; }
  .update-status-panel { padding: 12px; }
}
</style>
