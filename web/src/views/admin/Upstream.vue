<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api/admin';
import dayjs from 'dayjs';

interface UpstreamInfo {
  apiKey: string;
  balance: number;
  username: string;
  status: string;
  lastSyncAt?: string;
}

interface PanelConfig {
  customDomain: string;
  logoUrl: string;
  customCss: string;
  siteTitle: string;
  themeColor: string;
}

interface PanelUser {
  id: number | string;
  name: string;
  username?: string;
  status: string;
  localUserId?: number;
  localUsername?: string;
  createdAt?: string;
  create_date?: string;
  products?: Array<{ name: string; product_type: string; product_id: number }>;
}

interface UpstreamLog {
  id: number;
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  createdAt: string;
}

const infoLoading = ref(false);
const configLoading = ref(false);
const userLoading = ref(false);
const logLoading = ref(false);
const saving = ref(false);

const info = ref<UpstreamInfo | null>(null);
const panelUsers = ref<PanelUser[]>([]);
const logs = ref<UpstreamLog[]>([]);

const panelConfig = reactive<PanelConfig>({
  customDomain: '',
  logoUrl: '',
  customCss: '',
  siteTitle: '',
  themeColor: '#d4a249',
});

const logFilters = reactive({
  page: 1,
  pageSize: 10,
});
const logTotal = ref(0);

// API Key 掩码
function maskApiKey(key?: string) {
  if (!key) return '-';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function formatMoney(n?: number) {
  if (n === null || n === undefined) return '¥0.00';
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-';
}

async function loadInfo() {
  infoLoading.value = true;
  try {
    const res: any = await adminApi.upstreamInfo();
    if (res?.success) {
      // 后端返回 { account, mode }；提取 account 中的字段（已统一为 apiKey/balance/username/status）
      const acc = res.data?.account || res.data || {};
      info.value = {
        apiKey: acc.apiKey || acc.api_key || '-',
        balance: Number(acc.balance ?? 0),
        username: acc.username || acc.name || '-',
        status: acc.status || 'ACTIVE',
        lastSyncAt: acc.lastSyncAt || new Date().toISOString(),
      };
    }
  } catch (e) {
    // 忽略
  } finally {
    infoLoading.value = false;
  }
}

async function loadPanelConfig() {
  configLoading.value = true;
  try {
    const res: any = await adminApi.upstreamPanelConfig();
    if (res?.success && res.data) {
      Object.assign(panelConfig, res.data);
    }
  } catch (e) {
    // 忽略
  } finally {
    configLoading.value = false;
  }
}

async function loadPanelUsers() {
  userLoading.value = true;
  try {
    const res: any = await adminApi.upstreamPanelUsers();
    if (res?.success) {
      const rawList = res.data?.list || res.data?.items || (Array.isArray(res.data) ? res.data : []);
      // 兼容两种字段命名：name/username、create_date/createdAt
      panelUsers.value = rawList.map((u: any, idx: number) => ({
        id: u.id ?? idx + 1,
        name: u.name || u.username || '-',
        username: u.username || u.name,
        status: u.status || 'ACTIVE',
        localUserId: u.localUserId,
        localUsername: u.localUsername,
        createdAt: u.createdAt || u.create_date,
        products: u.products || [],
      }));
    }
  } catch (e) {
    // 忽略
  } finally {
    userLoading.value = false;
  }
}

async function loadLogs() {
  logLoading.value = true;
  try {
    const res: any = await adminApi.upstreamLogs({
      page: logFilters.page,
      pageSize: logFilters.pageSize,
    });
    if (res?.success) {
      logs.value = res.data?.list || res.data?.items || [];
      logTotal.value = res.data?.total || 0;
    }
  } catch (e) {
    // 忽略
  } finally {
    logLoading.value = false;
  }
}

async function handleSaveConfig() {
  if (!panelConfig.siteTitle?.trim()) {
    ElMessage.warning('请填写站点标题');
    return;
  }
  saving.value = true;
  try {
    const res: any = await adminApi.updatePanelConfig({ ...panelConfig });
    if (res?.success) {
      ElMessage.success('白标面板配置已保存');
      await loadPanelConfig();
    }
  } catch (e) {
    // 忽略
  } finally {
    saving.value = false;
  }
}

async function handleRefreshInfo() {
  await loadInfo();
  await loadApiKeyConfig();
  ElMessage.success('账号信息已刷新');
}

// ===== 雨云 API Key 配置（独立表单） =====
interface ApiKeyConfig {
  hasApiKey: boolean;
  apiKeyMasked: string;
  apiBase: string;
  mockMode: boolean;
  lastTestAt: string | null;
  lastTestResult: string | null;
  updatedAt: string | null;
  currentMode: string;
}

const apiKeyLoading = ref(false);
const apiKeySaving = ref(false);
const apiKeyTesting = ref(false);
const apiKeyConfig = ref<ApiKeyConfig | null>(null);

// 表单数据（apiKey 留空表示不修改）
const apiKeyForm = reactive({
  apiKey: '',
  apiBase: 'https://api.v2.rainyun.com',
  mockMode: false,
});

// 是否显示 apiKey 输入框（点击"修改 API Key"后显示）
const showApiKeyInput = ref(false);

async function loadApiKeyConfig() {
  apiKeyLoading.value = true;
  try {
    const res: any = await adminApi.rainyunApiKeyConfig();
    if (res?.success && res.data) {
      apiKeyConfig.value = res.data;
      apiKeyForm.apiBase = res.data.apiBase || 'https://api.v2.rainyun.com';
      apiKeyForm.mockMode = !!res.data.mockMode;
      // 重置表单
      apiKeyForm.apiKey = '';
      showApiKeyInput.value = false;
    }
  } catch (e) {
    // 忽略
  } finally {
    apiKeyLoading.value = false;
  }
}

function handleEditApiKey() {
  showApiKeyInput.value = true;
  apiKeyForm.apiKey = '';
}

function handleCancelEditApiKey() {
  showApiKeyInput.value = false;
  apiKeyForm.apiKey = '';
}

async function handleSaveApiKey() {
  // 至少要修改一个字段
  if (!showApiKeyInput.value && apiKeyForm.apiBase === apiKeyConfig.value?.apiBase && apiKeyForm.mockMode === !!apiKeyConfig.value?.mockMode) {
    ElMessage.info('未检测到改动');
    return;
  }
  apiKeySaving.value = true;
  try {
    const payload: any = {
      apiBase: apiKeyForm.apiBase,
      mockMode: apiKeyForm.mockMode,
    };
    // apiKey 仅在用户输入了新值时才传
    if (showApiKeyInput.value && apiKeyForm.apiKey.trim()) {
      payload.apiKey = apiKeyForm.apiKey.trim();
    }
    const res: any = await adminApi.updateRainyunApiKey(payload);
    if (res?.success) {
      ElMessage.success('雨云 API Key 配置已保存（运行时已热更新）');
      await loadApiKeyConfig();
      // 同步刷新账号信息
      await loadInfo();
    }
  } catch (e) {
    // 错误已由拦截器提示
  } finally {
    apiKeySaving.value = false;
  }
}

async function handleTestApiKey() {
  apiKeyTesting.value = true;
  try {
    const res: any = await adminApi.testRainyunApiKey();
    if (res?.success && res.data) {
      if (res.data.success) {
        ElMessage.success(res.data.message || '连接成功');
      } else {
        ElMessage.error(res.data.message || '连接失败');
      }
      // 刷新测试结果
      await loadApiKeyConfig();
    }
  } catch (e: any) {
    ElMessage.error('测试失败：' + (e.message || '未知错误'));
  } finally {
    apiKeyTesting.value = false;
  }
}

function statusType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  if (s === 'ACTIVE' || s === 'OK') return 'success';
  if (s === 'FROZEN' || s === 'ERROR') return 'danger';
  if (s === 'PENDING') return 'warning';
  return 'info';
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    ACTIVE: '正常',
    OK: '正常',
    FROZEN: '已冻结',
    ERROR: '异常',
    PENDING: '待激活',
  };
  return map[s] || s;
}

function methodType(m: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    GET: 'info',
    POST: 'success',
    PUT: 'warning',
    DELETE: 'danger',
    PATCH: '',
  };
  return map[m] || '';
}

function logStatusType(code: number): 'success' | 'warning' | 'danger' {
  if (code >= 200 && code < 300) return 'success';
  if (code >= 400 && code < 500) return 'warning';
  return 'danger';
}

onMounted(() => {
  loadInfo();
  loadPanelConfig();
  loadPanelUsers();
  loadLogs();
});
</script>

<template>
  <div class="admin-upstream">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">UPSTREAM &amp; WHITELABEL</span>
        <h2 class="page-title font-display">上游管理</h2>
      </div>
      <div class="header-actions">
        <el-button class="btn-outline" @click="handleRefreshInfo">
          <el-icon style="margin-right: 6px;"><Refresh /></el-icon>
          刷新账号
        </el-button>
      </div>
    </div>

    <!-- 顶部双栏：账号信息 + 白标配置 -->
    <div class="top-grid">
      <!-- 上游账号信息 -->
      <div class="card info-card" v-loading="infoLoading">
        <div class="card-head">
          <span class="card-title">上游账号信息</span>
          <span class="card-extra">RAIN CLOUD</span>
        </div>
        <div class="card-body">
          <div class="info-list">
            <div class="info-row">
              <div class="info-label">用户名</div>
              <div class="info-value">{{ info?.username || '-' }}</div>
            </div>
            <div class="info-row">
              <div class="info-label">API KEY</div>
              <div class="info-value mono">{{ maskApiKey(info?.apiKey) }}</div>
            </div>
            <div class="info-row">
              <div class="info-label">剩余余额</div>
              <div class="info-value balance text-gold">{{ formatMoney(info?.balance) }}</div>
            </div>
            <div class="info-row">
              <div class="info-label">状态</div>
              <div class="info-value">
                <span v-if="info" class="status-text" :class="`is-${statusType(info.status) || 'info'}`">
                  {{ statusLabel(info.status) }}
                </span>
                <span v-else class="text-tertiary">-</span>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">最近同步</div>
              <div class="info-value mono">{{ formatTime(info?.lastSyncAt) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 白标面板配置 -->
      <div class="card config-card" v-loading="configLoading">
        <div class="card-head">
          <span class="card-title">白标面板配置</span>
          <span class="card-extra">CUSTOMIZE</span>
        </div>
        <div class="card-body">
          <el-form :model="panelConfig" label-width="110px" label-position="right">
            <el-form-item label="自定义域名">
              <el-input v-model="panelConfig.customDomain" placeholder="panel.yourdomain.com" />
            </el-form-item>
            <el-form-item label="Logo URL">
              <el-input v-model="panelConfig.logoUrl" placeholder="https://..." />
              <div class="logo-preview" v-if="panelConfig.logoUrl">
                <img :src="panelConfig.logoUrl" alt="logo" @error="() => {}" />
              </div>
            </el-form-item>
            <el-form-item label="站点标题">
              <el-input v-model="panelConfig.siteTitle" placeholder="我的云服务" />
            </el-form-item>
            <el-form-item label="主题色">
              <div class="color-row">
                <el-color-picker v-model="panelConfig.themeColor" />
                <el-input v-model="panelConfig.themeColor" class="color-input font-mono" placeholder="#d4a249" />
              </div>
            </el-form-item>
            <el-form-item label="自定义 CSS">
              <el-input
                v-model="panelConfig.customCss"
                type="textarea"
                :rows="4"
                placeholder="/* 自定义样式 */"
                class="css-input font-mono"
              />
            </el-form-item>
            <el-form-item>
              <el-button class="btn-gold" :loading="saving" @click="handleSaveConfig">保存配置</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>

    <!-- 雨云 API Key 配置（AES 加密存储 + 运行时热更新） -->
    <div class="card apikey-card" v-loading="apiKeyLoading">
      <div class="card-head">
        <span class="card-title">雨云 API Key 配置</span>
        <span class="card-extra">ENCRYPTED &amp; HOT-RELOAD</span>
      </div>
      <div class="card-body">
        <!-- 当前配置展示 -->
        <div class="apikey-status" v-if="apiKeyConfig">
          <div class="status-grid">
            <div class="status-item">
              <span class="status-label">当前模式</span>
              <span class="status-value" :class="apiKeyConfig.currentMode === 'LIVE' ? 'mode-live' : 'mode-mock'">
                {{ apiKeyConfig.currentMode === 'LIVE' ? 'LIVE（真实调用）' : 'MOCK（本地模拟）' }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">API Key</span>
              <span class="status-value mono">
                <span v-if="apiKeyConfig.hasApiKey">{{ apiKeyConfig.apiKeyMasked || '****' }}</span>
                <span v-else class="text-tertiary">未设置</span>
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">API 地址</span>
              <span class="status-value mono">{{ apiKeyConfig.apiBase || '-' }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">强制 MOCK</span>
              <span class="status-value" :class="apiKeyConfig.mockMode ? 'mode-mock' : 'mode-live'">
                {{ apiKeyConfig.mockMode ? '是' : '否' }}
              </span>
            </div>
            <div class="status-item" v-if="apiKeyConfig.lastTestAt">
              <span class="status-label">最近测试</span>
              <span class="status-value mono">{{ formatTime(apiKeyConfig.lastTestAt) }}</span>
            </div>
            <div class="status-item" v-if="apiKeyConfig.updatedAt">
              <span class="status-label">最近更新</span>
              <span class="status-value mono">{{ formatTime(apiKeyConfig.updatedAt) }}</span>
            </div>
          </div>
        </div>

        <!-- 编辑表单 -->
        <el-form :model="apiKeyForm" label-width="110px" label-position="right" class="apikey-form">
          <el-form-item label="API Key">
            <div class="apikey-input-row">
              <el-input
                v-if="showApiKeyInput"
                v-model="apiKeyForm.apiKey"
                type="password"
                show-password
                placeholder="输入新的雨云 API Key（留空不修改）"
                clearable
              />
              <el-input
                v-else
                :model-value="apiKeyConfig?.hasApiKey ? '••••••••（已设置，点击修改）' : ''"
                placeholder="未设置 API Key"
                disabled
              />
              <el-button v-if="!showApiKeyInput" @click="handleEditApiKey">修改</el-button>
              <el-button v-else @click="handleCancelEditApiKey">取消</el-button>
            </div>
            <div class="form-tip">
              获取方式：登录雨云控制台 → 用户中心 → API 密钥。留空保存表示不修改原值。
            </div>
          </el-form-item>
          <el-form-item label="API 地址">
            <el-input v-model="apiKeyForm.apiBase" placeholder="https://api.v2.rainyun.com" />
            <div class="form-tip">雨云 API 基础地址，默认 https://api.v2.rainyun.com，一般无需修改。</div>
          </el-form-item>
          <el-form-item label="强制 MOCK">
            <el-switch v-model="apiKeyForm.mockMode" />
            <div class="form-tip">
              开启后所有上游操作走本地模拟（不真实调用雨云），用于调试。关闭后按 API Key 是否为空自动判断。
            </div>
          </el-form-item>
          <el-form-item>
            <div class="apikey-actions">
              <el-button class="btn-gold" :loading="apiKeySaving" @click="handleSaveApiKey">
                保存并热更新
              </el-button>
              <el-button class="btn-outline" :loading="apiKeyTesting" @click="handleTestApiKey">
                测试连接
              </el-button>
            </div>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 面板用户列表 -->
    <div class="card table-card">
      <div class="card-head">
        <span class="card-title">上游面板用户</span>
        <span class="card-extra">共 {{ panelUsers.length }} 个</span>
      </div>
      <div class="table-wrap">
        <el-table :data="panelUsers" v-loading="userLoading">
          <el-table-column prop="id" label="ID" width="80" align="center">
            <template #default="{ row }">
              <span class="mono">{{ row.id }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="用户名" min-width="140">
            <template #default="{ row }">
              <span class="mono">{{ row.name || row.username }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${statusType(row.status) || 'info'}`">
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="关联本站用户" min-width="160">
            <template #default="{ row }">
              <span v-if="row.localUsername" class="text-gold mono">{{ row.localUsername }}</span>
              <span v-else class="text-tertiary">未关联</span>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">
              <span class="mono">{{ formatTime(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无面板用户" /></template>
        </el-table>
      </div>
    </div>

    <!-- API 调用日志 -->
    <div class="card table-card">
      <div class="card-head">
        <span class="card-title">上游 API 调用日志</span>
        <el-button class="admin-btn admin-btn-sm" @click="loadLogs">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
      <div class="table-wrap">
        <el-table :data="logs" v-loading="logLoading">
          <el-table-column prop="id" label="ID" width="80" align="center">
            <template #default="{ row }">
              <span class="mono">{{ row.id }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="endpoint" label="接口" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="mono">{{ row.endpoint }}</span>
            </template>
          </el-table-column>
          <el-table-column label="方法" width="90">
            <template #default="{ row }">
              <span class="method-chip" :class="`m-${row.method.toLowerCase()}`">{{ row.method }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态码" width="100" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${logStatusType(row.statusCode)}`">
                {{ row.statusCode }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="110" align="right">
            <template #default="{ row }">
              <span class="mono">{{ row.duration }}ms</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="180">
            <template #default="{ row }">
              <span class="mono">{{ formatTime(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无日志" /></template>
        </el-table>
      </div>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="logFilters.page"
          v-model:page-size="logFilters.pageSize"
          :total="logTotal"
          :page-sizes="[10, 20, 50]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadLogs"
          @size-change="loadLogs"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-upstream {
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
    gap: 6px;
  }

  .page-title {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    letter-spacing: -0.3px;
  }

  @include mobile {
    .page-title { font-size: 22px; }
    .header-actions { width: 100%; }
    .header-actions .el-button { flex: 1; }
  }
}

// ============ 顶部双栏 ============
.top-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 16px;
  align-items: start;

  @include tablet-down {
    grid-template-columns: 1fr;
  }
}

// ============ 卡片通用 ============
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-base);

  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.2px;
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

// ============ 账号信息 ============
.info-list {
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px dashed var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  .info-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1px;
    color: var(--text-tertiary);
    text-transform: uppercase;
  }

  .info-value {
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;

    &.balance {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
  }
}

// ============ 表格卡 ============
.table-card {
  overflow: visible;
  min-width: 0;
  :deep(.el-table) {
    --el-table-border-color: var(--border-base);
    --el-table-header-bg-color: transparent;
    --el-table-tr-bg-color: transparent;
    --el-table-bg-color: transparent;

    &::before,
    .el-table__inner-wrapper::before {
      display: none;
    }

    th.el-table__cell {
      background: transparent;
      border-bottom: 1px solid var(--border-base);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--text-tertiary);
      padding: 12px 0;
    }

    .el-table__cell {
      border-bottom: 1px dashed var(--border-light);
      padding: 12px 0;
    }

    .el-table__fixed-right::before,
    .el-table__fixed::before {
      display: none;
    }
  }
}

// 表格包裹：移动端水平滚动
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  :deep(.el-table) {
    min-width: 960px;
  }
}


.method-chip {
  display: inline-block;
  padding: 1px 6px;
  border: 1px solid var(--border-base);
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--text-secondary);
  background: var(--bg-subtle);

  &.m-get { color: var(--info); border-color: var(--info); }
  &.m-post { color: var(--success); border-color: var(--success); }
  &.m-put { color: var(--warning); border-color: var(--warning); }
  &.m-delete { color: var(--danger); border-color: var(--danger); }
  &.m-patch { color: var(--text-gold); border-color: var(--border-gold); }
}

.color-row {
  display: flex;
  align-items: center;
  gap: 10px;

  .color-input {
    width: 130px;
  }
}

.logo-preview {
  margin-top: 8px;

  img {
    max-height: 40px;
    max-width: 160px;
    border: 1px solid var(--border-base);
    border-radius: 4px;
    padding: 4px;
    background: var(--bg-subtle);
  }
}

.css-input :deep(textarea) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.mono {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

.text-gold {
  color: var(--text-gold);
  font-weight: 600;
}

.text-tertiary {
  color: var(--text-tertiary);
  font-size: 12px;
}

.font-mono {
  :deep(.el-input__inner),
  :deep(.el-textarea__inner) {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
  }
}

// 状态纯文字
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger  { color: var(--danger); }
  &.is-info    { color: var(--text-tertiary); }
  &.is-primary { color: var(--text-gold); }
}

.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px;
}

// ===== 响应式 =====
@include mobile {
  .card-body { padding: 14px; }
  .config-card :deep(.el-form) {
    .el-form-item__label { width: auto !important; text-align: left; }
    .el-form-item__content { margin-left: 0 !important; }
  }
  .color-row { flex-wrap: wrap; }
  .color-row .color-input { width: 120px; }
  .pagination-wrap { padding: 12px; }
  .apikey-card :deep(.el-form) {
    .el-form-item__label { width: auto !important; text-align: left; }
    .el-form-item__content { margin-left: 0 !important; }
  }
  .status-grid { grid-template-columns: 1fr !important; }
  .apikey-input-row { flex-direction: column; align-items: stretch; gap: 8px; }
}

// ===== 雨云 API Key 配置卡片 =====
.apikey-card {
  margin-top: 24px;

  .apikey-status {
    padding: 16px;
    background: var(--bg-elevated);
    border-radius: 6px;
    margin-bottom: 20px;
    border: 1px solid var(--border-base);
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .status-label {
    font-size: 11px;
    color: var(--text-tertiary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .status-value {
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 500;

    &.mono {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
    }

    &.mode-live {
      color: var(--success);
    }

    &.mode-mock {
      color: var(--warning);
    }
  }

  .apikey-form {
    .form-tip {
      font-size: 12px;
      color: var(--text-tertiary);
      line-height: 1.5;
      margin-top: 4px;
    }
  }

  .apikey-input-row {
    display: flex;
    gap: 8px;
    width: 100%;

    .el-input {
      flex: 1;
    }
  }

  .apikey-actions {
    display: flex;
    gap: 12px;
  }
}
</style>
