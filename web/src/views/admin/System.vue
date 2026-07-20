<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

// ============ 类型定义 ============
type ConfigValue = string | number | boolean;
interface ConfigItem {
  key: string;
  value: ConfigValue;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'password' | 'textarea';
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  tip?: string;
  mask?: boolean;
}

interface ConfigSection {
  key: string;
  title: string;
  icon: string;
  items: ConfigItem[];
}

// 版本检查（后端 GET /admin/system/version-check 返回结构）
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

// 更新状态（后端 GET /admin/system/update-status 返回结构）
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

// ============ 配置区块 ============
const loading = ref(false);
const saving = ref<string | null>(null);

const sections = ref<ConfigSection[]>([
  {
    key: 'basic',
    title: '基本设置',
    icon: 'InfoFilled',
    items: [
      { key: 'site_name', value: '', label: '站点名称', type: 'text', placeholder: '我的云服务' },
      { key: 'site_description', value: '', label: '站点描述', type: 'textarea', placeholder: '一句话介绍你的站点' },
      { key: 'icp_record', value: '', label: 'ICP 备案号', type: 'text', placeholder: '如：京ICP备XXXXXXXX号' },
      { key: 'support_qq', value: '', label: '客服 QQ', type: 'text', placeholder: 'QQ 号码' },
      { key: 'support_wechat', value: '', label: '客服微信', type: 'text', placeholder: '微信号' },
    ],
  },
  {
    key: 'register',
    title: '注册设置',
    icon: 'User',
    items: [
      { key: 'register_enabled', value: true, label: '开放注册', type: 'boolean' },
      {
        key: 'register_bonus',
        value: 0,
        label: '注册赠送金额',
        type: 'number',
        tip: '单位：元，0 表示不赠送',
      },
    ],
  },
  {
    key: 'payment',
    title: '支付设置',
    icon: 'Wallet',
    items: [
      { key: 'epay_merchant_id', value: '', label: '易支付商户 ID', type: 'text' },
      { key: 'epay_key', value: '', label: '易支付密钥', type: 'password', mask: true, placeholder: '留空表示不修改' },
      { key: 'epay_gateway', value: '', label: '易支付网关', type: 'text', placeholder: 'https://pay.example.com' },
      { key: 'balance_payment_enabled', value: true, label: '启用余额支付', type: 'boolean' },
    ],
  },
  {
    key: 'product',
    title: '商品设置',
    icon: 'Goods',
    items: [
      {
        key: 'default_markup_rate',
        value: -10,
        label: '默认优惠率',
        type: 'number',
        tip: '百分比，负数表示优惠（如 -10 表示 9 折），同步上游商品时的默认优惠比例',
      },
      { key: 'auto_sync_upstream', value: false, label: '自动同步上游', type: 'boolean', tip: '每天定时同步上游商品库存与价格' },
      {
        key: 'auto_sync_hour',
        value: '3',
        label: '自动同步时间',
        type: 'select',
        tip: '每天定时同步的具体时间点（24 小时制，仅当「自动同步上游」开启时生效）',
        options: Array.from({ length: 24 }, (_, h) => ({
          label: `${String(h).padStart(2, '0')}:00`,
          value: String(h),
        })),
      },
    ],
  },
  {
    key: 'theme',
    title: '主题设置',
    icon: 'Brush',
    items: [
      {
        key: 'default_theme',
        value: 'auto',
        label: '默认主题',
        type: 'select',
        options: [
          { label: '日间（白金）', value: 'light' },
          { label: '夜间（黑金）', value: 'dark' },
          { label: '跟随系统', value: 'auto' },
        ],
      },
      { key: 'allow_theme_switch', value: true, label: '允许用户切换主题', type: 'boolean' },
    ],
  },
  {
    key: 'security',
    title: '安全设置',
    icon: 'Lock',
    items: [
      { key: 'jwt_expiry_minutes', value: 1440, label: 'JWT 过期时间', type: 'number', tip: '单位：分钟' },
      { key: 'login_fail_lock_count', value: 5, label: '登录失败锁定次数', type: 'number', tip: '连续失败次数达到后锁定账号' },
      {
        key: 'password_strength',
        value: 'medium',
        label: '密码强度要求',
        type: 'select',
        options: [
          { label: '低（6位以上）', value: 'low' },
          { label: '中（8位以上含字母数字）', value: 'medium' },
          { label: '高（12位以上含大小写数字符号）', value: 'high' },
        ],
      },
    ],
  },
]);

const defaultValues: Record<string, ConfigValue> = {
  site_name: '',
  site_description: '',
  icp_record: '',
  support_qq: '',
  support_wechat: '',
  register_enabled: true,
  register_bonus: 0,
  epay_merchant_id: '',
  epay_key: '',
  epay_gateway: '',
  balance_payment_enabled: true,
  default_markup_rate: -10,
  auto_sync_upstream: false,
  auto_sync_hour: '3',
  default_theme: 'auto',
  allow_theme_switch: true,
  jwt_expiry_minutes: 1440,
  login_fail_lock_count: 5,
  password_strength: 'medium',
};

function findItem(key: string): ConfigItem | undefined {
  for (const sec of sections.value) {
    const it = sec.items.find((i) => i.key === key);
    if (it) return it;
  }
  return undefined;
}

function castValue(raw: string, type: ConfigItem['type']): ConfigValue {
  if (type === 'boolean') return raw === 'true' || raw === '1';
  if (type === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  return raw;
}

async function loadConfigs() {
  loading.value = true;
  try {
    const res: any = await adminApi.systemConfigs();
    if (res?.success && Array.isArray(res.data)) {
      res.data.forEach((c: { key: string; value: string }) => {
        const item = findItem(c.key);
        if (item) {
          item.value = castValue(c.value, item.type);
        }
      });
    }
  } catch (e) {
    // 忽略
  } finally {
    loading.value = false;
  }
}

async function handleSaveSection(section: ConfigSection) {
  saving.value = section.key;
  try {
    const configs = section.items.map((it) => ({
      key: it.key,
      value: String(it.value),
    }));
    const res: any = await adminApi.updateSystemConfigs(configs);
    if (res?.success) {
      ElMessage.success(`「${section.title}」已保存`);
      await loadConfigs();
    }
  } catch (e) {
    // 忽略
  } finally {
    saving.value = null;
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm(
      '确认将所有配置重置为默认值？此操作不可恢复，且不会立即保存，需手动点击各区块的「保存」按钮。',
      '重置为默认',
      { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  sections.value.forEach((sec) => {
    sec.items.forEach((it) => {
      if (defaultValues[it.key] !== undefined) {
        it.value = defaultValues[it.key];
      }
    });
  });
  ElMessage.success('已重置为默认值，请点击「保存」以生效');
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

// ============ 强制更新 ============
const updateLoading = ref(false);
const updateStatus = ref<UpdateStatus | null>(null);
const updatePolling = ref<number | null>(null);

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
  try {
    await ElMessageBox.confirm(
      '将触发服务器一键更新（git pull → 安装依赖 → 数据库迁移 → 构建 → 重启 PM2）。\n\n更新过程中后端服务会重启，可能导致短暂不可用（10-30 秒）。\n\n确认继续？',
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
    const res: any = await adminApi.forceUpdate();
    if (res?.success) {
      ElMessage.success('更新已开始，请通过下方状态面板查看进度');
      // 立即开始轮询
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

// 更新进度百分比（用于进度条）
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

onMounted(() => {
  loadConfigs();
  loadVersionCheck();
  loadUpdateStatus();
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <div class="admin-system" v-loading="loading">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">SYSTEM CONFIG</span>
        <h2 class="page-title font-display">系统配置</h2>
        <p class="page-subtitle">站点参数、注册、支付、商品、主题与安全策略管理</p>
      </div>
      <div class="header-actions">
        <el-button class="btn-outline" @click="handleReset">
          <el-icon style="margin-right: 6px;"><RefreshLeft /></el-icon>
          重置为默认
        </el-button>
      </div>
    </div>

    <!-- ============ 版本检查 & 强制更新 ============ -->
    <div class="card update-card" v-loading="versionLoading">
      <div class="card-head">
        <span class="card-title">
          <el-icon class="section-icon"><Promotion /></el-icon>
          版本检查 & 一键更新
        </span>
        <span class="card-extra">UPDATE</span>
      </div>
      <div class="card-body">
        <!-- 版本信息 -->
        <div class="version-info" v-if="versionInfo">
          <div class="version-compare">
            <div class="version-box">
              <div class="version-box-label">当前版本</div>
              <div class="version-box-value">v{{ versionInfo.currentVersion }}</div>
            </div>
            <el-icon class="version-arrow"><Right /></el-icon>
            <div class="version-box">
              <div class="version-box-label">最新版本</div>
              <div class="version-box-value" :class="{ 'has-update': versionInfo.needUpdate }">
                <template v-if="versionInfo.latestVersion">
                  v{{ versionInfo.latestVersion }}
                </template>
                <template v-else>—</template>
              </div>
            </div>
            <div class="version-status">
              <el-tag
                v-if="versionInfo.needUpdate"
                type="warning"
                effect="dark"
                size="large"
              >
                有新版本可用
              </el-tag>
              <el-tag
                v-else-if="versionInfo.latestVersion && !versionInfo.needUpdate"
                type="success"
                effect="plain"
                size="large"
              >
                已是最新
              </el-tag>
              <el-tag v-else type="info" effect="plain" size="large">
                无法获取
              </el-tag>
            </div>
          </div>

          <!-- 错误提示 -->
          <el-alert
            v-if="versionInfo.error"
            :title="versionInfo.error"
            type="warning"
            :closable="false"
            show-icon
            class="version-alert"
          />

          <!-- Release 信息 -->
          <div class="release-info" v-if="versionInfo.releaseUrl">
            <div class="release-meta">
              <span v-if="versionInfo.publishedAt">
                发布时间：{{ new Date(versionInfo.publishedAt).toLocaleString('zh-CN') }}
              </span>
              <span v-if="versionInfo.repo">仓库：{{ versionInfo.repo }}</span>
              <a
                v-if="versionInfo.releaseUrl"
                :href="versionInfo.releaseUrl"
                target="_blank"
                rel="noopener"
                class="release-link"
              >
                查看 Release <el-icon><Right /></el-icon>
              </a>
            </div>
            <div class="release-notes" v-if="versionInfo.releaseNotes">
              <div class="release-notes-label">Release Notes</div>
              <pre>{{ versionInfo.releaseNotes }}</pre>
            </div>
          </div>

          <!-- 检查时间 + 刷新按钮 -->
          <div class="version-actions">
            <span class="env-collected">
              检查时间：{{ new Date(versionInfo.checkedAt).toLocaleString('zh-CN') }}
            </span>
            <el-button class="btn-outline" :loading="versionLoading" @click="loadVersionCheck">
              <el-icon style="margin-right: 6px;"><Refresh /></el-icon>
              重新检查
            </el-button>
          </div>
        </div>

        <!-- 强制更新触发 -->
        <el-divider content-position="left">
          <span class="divider-text">一键更新</span>
        </el-divider>

        <div class="update-action">
          <div class="update-desc">
            点击下方按钮将触发服务器执行 <code>deploy/update.sh</code> 脚本，
            包含 9 个步骤：前置检查 → 备份 → 拉取代码 → 安装依赖 → 数据库迁移 → 构建 → 重启 → 健康检查 → 清理。
            <br />
            <span class="update-warn">⚠️ 更新过程中后端会重启，可能导致 10-30 秒短暂不可用。</span>
            <br />
            <span class="update-tip">提示：环境依赖、PM2 进程状态请在「环境依赖」页面查看。</span>
          </div>
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
            :stroke-width="10"
            :status="updateStatus.status === 'SUCCESS' ? 'success' : updateStatus.status === 'FAILED' ? 'exception' : undefined"
            class="update-progress"
          />

          <!-- 状态消息 -->
          <div class="status-message">
            <el-icon><InfoFilled /></el-icon>
            <span>{{ updateStatus.message || '无消息' }}</span>
            <span class="status-step" v-if="updateStatus.step">
              （步骤 {{ updateStatus.step }}/9）
            </span>
          </div>

          <!-- 锁信息 -->
          <div class="status-meta" v-if="updateStatus.isRunning && updateStatus.lockPid">
            <span>执行 PID：<code>{{ updateStatus.lockPid }}</code></span>
            <span v-if="updateStatus.lockAgeSeconds !== null">
              已运行：{{ Math.floor(updateStatus.lockAgeSeconds / 60) }}m {{ updateStatus.lockAgeSeconds % 60 }}s
            </span>
            <span v-if="updateStatus.latestLog">日志：{{ updateStatus.latestLog }}</span>
          </div>

          <!-- 日志输出 -->
          <div class="log-panel" v-if="updateStatus.logTail">
            <div class="log-head">
              <span>日志输出（最后 50 行）</span>
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
      </div>
    </div>

    <!-- ============ 配置区块网格 ============ -->
    <div class="sections-grid">
      <div
        v-for="section in sections"
        :key="section.key"
        class="card section-card"
      >
        <div class="card-head">
          <span class="card-title">
            <el-icon class="section-icon"><component :is="section.icon" /></el-icon>
            {{ section.title }}
          </span>
          <span class="card-extra">{{ section.key.toUpperCase() }}</span>
        </div>
        <div class="card-body">
          <el-form label-width="140px" label-position="right">
            <el-form-item
              v-for="item in section.items"
              :key="item.key"
              :label="item.label"
            >
              <el-switch v-if="item.type === 'boolean'" v-model="item.value as boolean" />
              <el-input-number
                v-else-if="item.type === 'number' && item.key === 'default_markup_rate'"
                v-model="item.value as number"
                controls-position="right"
                :min="-100"
                :max="100"
              />
              <el-input-number
                v-else-if="item.type === 'number'"
                v-model="item.value as number"
                controls-position="right"
                :min="0"
              />
              <el-select
                v-else-if="item.type === 'select'"
                v-model="item.value as string"
                style="width: 100%"
              >
                <el-option
                  v-for="opt in item.options"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <el-input
                v-else-if="item.type === 'textarea'"
                v-model="item.value as string"
                type="textarea"
                :rows="2"
                :placeholder="item.placeholder"
              />
              <el-input
                v-else-if="item.type === 'password'"
                v-model="item.value as string"
                type="password"
                show-password
                :placeholder="item.placeholder"
              />
              <el-input
                v-else
                v-model="item.value as string"
                :placeholder="item.placeholder"
              />
              <div v-if="item.tip" class="form-tip">{{ item.tip }}</div>
            </el-form-item>

            <el-form-item>
              <el-button
                class="btn-gold"
                :loading="saving === section.key"
                @click="handleSaveSection(section)"
              >
                保存
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-system {
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

// ============ 区块网格 ============
.sections-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  align-items: start;

  @include tablet-down {
    grid-template-columns: 1fr;
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

// ============ 表单 ============
.form-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;
}

// ============ 版本检查 & 更新卡片 ============
.update-card .card-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.version-compare {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;

  .version-box {
    flex: 1;
    min-width: 140px;
    text-align: center;

    .version-box-label {
      font-size: 11px;
      color: var(--text-tertiary);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .version-box-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);

      &.has-update {
        color: var(--warning);
      }
    }
  }

  .version-arrow {
    font-size: 20px;
    color: var(--text-tertiary);
  }

  .version-status {
    flex-shrink: 0;
  }

  @include mobile {
    .version-box { min-width: 100px; }
    .version-arrow { display: none; }
  }
}

.version-alert {
  margin: 0;
}

.release-info {
  padding: 12px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;

  .release-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 8px;

    .release-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--gold-500);
      text-decoration: none;

      &:hover {
        color: var(--gold-600);
      }
    }
  }

  .release-notes {
    &-label {
      font-size: 11px;
      color: var(--text-tertiary);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    pre {
      margin: 0;
      padding: 8px;
      background: var(--bg-elevated);
      border-radius: 2px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
    }
  }
}

.version-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 4px;
  border-top: 1px dashed var(--border-light);
}

.divider-text {
  font-size: 13px;
  color: var(--text-tertiary);
  letter-spacing: 0.5px;
}

.update-action {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: 4px;

  .update-desc {
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

    .update-warn {
      color: var(--warning);
    }

    .update-tip {
      color: var(--text-tertiary);
      font-size: 12px;
    }
  }

  .el-button {
    align-self: flex-start;
  }
}

// 更新状态面板
.update-status-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
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
}

.status-message {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);

  .el-icon {
    color: var(--gold-400);
  }

  .status-step {
    color: var(--text-tertiary);
    font-size: 12px;
  }
}

.status-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 12px;
  color: var(--text-tertiary);

  code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-primary);
    background: var(--bg-elevated);
    padding: 1px 6px;
    border-radius: 2px;
    font-size: 11px;
  }
}

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
  }

  .log-content {
    margin: 0;
    padding: 10px;
    background: var(--bg-inverse);
    color: var(--text-inverse);
    border-radius: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    line-height: 1.5;
    max-height: 320px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.env-collected {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', monospace;
}

// ===== 响应式适配 =====
@include mobile {
  .admin-system { gap: 12px; }

  .section-card {
    :deep(.el-form) {
      .el-form-item__label {
        width: auto !important;
        text-align: left;
        float: none;
      }
      .el-form-item__content {
        margin-left: 0 !important;
      }
    }
  }

  .card-body {
    padding: 16px;
  }

  .update-action {
    .el-button {
      align-self: stretch;
    }
  }
}
</style>
