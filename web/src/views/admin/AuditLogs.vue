<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api/admin';
import dayjs from 'dayjs';

interface AuditLog {
  id: number;
  adminId: number;
  adminUsername: string;
  action: string;
  module: string;
  target?: string;
  ip: string;
  detail?: string;
  detailObj?: any;
  createdAt: string;
}

const loading = ref(false);
const logs = ref<AuditLog[]>([]);
const total = ref(0);

const filters = reactive({
  admin: '',
  action: '',
  dateRange: [] as string[],
  page: 1,
  pageSize: 20,
});

// 操作类型选项
const actionOptions = [
  { label: '登录', value: 'LOGIN' },
  { label: '登出', value: 'LOGOUT' },
  { label: '创建', value: 'CREATE' },
  { label: '更新', value: 'UPDATE' },
  { label: '删除', value: 'DELETE' },
  { label: '查询', value: 'READ' },
  { label: '导出', value: 'EXPORT' },
  { label: '其它', value: 'OTHER' },
];

const actionTypeMap: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
  LOGIN: 'success',
  LOGOUT: 'info',
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'danger',
  READ: 'info',
  EXPORT: 'warning',
  OTHER: '',
};

const actionLabelMap: Record<string, string> = {
  LOGIN: '登录',
  LOGOUT: '登出',
  CREATE: '创建',
  UPDATE: '更新',
  DELETE: '删除',
  READ: '查询',
  EXPORT: '导出',
  OTHER: '其它',
};

// 详情弹窗
const detailVisible = ref(false);
const currentDetail = ref<AuditLog | null>(null);

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function actionLabel(a: string) {
  return actionLabelMap[a] || a;
}

function actionTagType(a: string) {
  return actionTypeMap[a] || 'info';
}

// 尝试解析 detail 为 JSON 对象
function parseDetail(detail?: string): any {
  if (!detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return detail;
  }
}

function prettyDetail(detail?: string) {
  const parsed = parseDetail(detail);
  if (parsed === null) return '无详情';
  if (typeof parsed === 'string') return parsed;
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(parsed);
  }
}

async function loadList() {
  loading.value = true;
  try {
    const params: any = {
      page: filters.page,
      pageSize: filters.pageSize,
    };
    if (filters.admin) params.admin = filters.admin;
    if (filters.action) params.action = filters.action;
    if (filters.dateRange?.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }
    const res: any = await adminApi.auditLogs(params);
    if (res?.success) {
      logs.value = res.data?.list || res.data?.items || [];
      total.value = res.data?.total || 0;
    }
  } catch (e) {
    // 忽略
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  filters.page = 1;
  loadList();
}

function handleReset() {
  filters.admin = '';
  filters.action = '';
  filters.dateRange = [];
  filters.page = 1;
  loadList();
}

function openDetail(row: any) {
  currentDetail.value = row;
  detailVisible.value = true;
}

function copyDetail() {
  if (currentDetail.value?.detail) {
    navigator.clipboard?.writeText(currentDetail.value.detail);
    ElMessage.success('已复制到剪贴板');
  }
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <div class="admin-audit-logs">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">AUDIT LOGS</span>
        <h2 class="page-title font-display">审计日志</h2>
      </div>
      <div class="header-actions">
        <el-button class="btn-outline" @click="loadList">
          <el-icon style="margin-right: 6px;"><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="card filter-card">
      <div class="filter-bar">
        <el-form :inline="true" :model="filters" class="filter-form">
          <el-form-item label="管理员">
            <el-input v-model="filters.admin" placeholder="用户名" clearable style="width: 160px" />
          </el-form-item>
          <el-form-item label="操作类型">
            <el-select v-model="filters.action" placeholder="全部" clearable style="width: 140px">
              <el-option v-for="opt in actionOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="日期">
            <el-date-picker
              v-model="filters.dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始"
              end-placeholder="结束"
              value-format="YYYY-MM-DD"
              style="width: 260px"
            />
          </el-form-item>
          <el-form-item>
            <el-button class="btn-gold" @click="handleSearch">查询</el-button>
            <el-button class="btn-outline" @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 列表卡 -->
    <div class="card table-card">
      <div class="card-head">
        <span class="card-title">操作记录</span>
        <span class="card-extra">{{ total }} RECORDS</span>
      </div>
      <div class="card-body table-body">
      <div class="table-wrap">
        <el-table :data="logs" v-loading="loading" @row-dblclick="openDetail">
            <el-table-column prop="id" label="ID" width="80">
              <template #default="{ row }">
                <span class="mono">#{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                <span class="mono">{{ formatTime(row.createdAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="adminUsername" label="管理员" min-width="140">
              <template #default="{ row }">
                <span class="mono username-text">{{ row.adminUsername }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作类型" width="100" align="center">
              <template #default="{ row }">
                <span class="status-text" :class="actionTagType(row.action) ? 'is-' + actionTagType(row.action) : 'is-info'">
                  {{ actionLabel(row.action) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="module" label="模块" width="120">
              <template #default="{ row }">
                <span class="module-text">{{ row.module }}</span>
              </template>
            </el-table-column>
            <el-table-column label="目标" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.target" class="mono">{{ row.target }}</span>
                <span v-else class="text-tertiary">-</span>
              </template>
            </el-table-column>
            <el-table-column label="IP" width="140">
              <template #default="{ row }">
                <span class="mono">{{ row.ip }}</span>
              </template>
            </el-table-column>
            <el-table-column label="详情" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="detail-text">{{ row.detail || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button class="admin-btn admin-btn-sm" @click="openDetail(row)">查看</el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty description="暂无审计日志" /></template>
          </el-table>
        </div>

        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="filters.page"
            v-model:page-size="filters.pageSize"
            :total="total"
            :page-sizes="[20, 50, 100, 200]"
            layout="total, sizes, prev, pager, next, jumper"
            @current-change="loadList"
            @size-change="loadList"
          />
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="日志详情" width="680px">
      <template v-if="currentDetail">
        <div class="detail-grid">
          <div class="detail-row">
            <div class="detail-label">日志 ID</div>
            <div class="detail-value mono">#{{ currentDetail.id }}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">时间</div>
            <div class="detail-value mono">{{ formatTime(currentDetail.createdAt) }}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">管理员</div>
            <div class="detail-value mono">{{ currentDetail.adminUsername }}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">IP</div>
            <div class="detail-value mono">{{ currentDetail.ip }}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">操作类型</div>
            <div class="detail-value">
              <span class="status-text" :class="actionTagType(currentDetail.action) ? 'is-' + actionTagType(currentDetail.action) : 'is-info'">
                {{ actionLabel(currentDetail.action) }}
              </span>
            </div>
          </div>
          <div class="detail-row">
            <div class="detail-label">模块</div>
            <div class="detail-value">{{ currentDetail.module }}</div>
          </div>
          <div class="detail-row full">
            <div class="detail-label">目标</div>
            <div class="detail-value">
              <span v-if="currentDetail.target" class="mono">{{ currentDetail.target }}</span>
              <span v-else class="text-tertiary">-</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-label section-label">完整详情（JSON）</div>
          <pre class="detail-json">{{ prettyDetail(currentDetail.detail) }}</pre>
        </div>
      </template>
      <template #footer>
        <el-button class="btn-outline" @click="detailVisible = false">关闭</el-button>
        <el-button class="btn-gold" @click="copyDetail">复制详情</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-audit-logs {
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
  padding: 0;
}

.table-body {
  padding: 0 20px;
}

// ============ 筛选栏 ============
.filter-card {
  padding: 16px 20px;

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 12px;
  }

  :deep(.el-form--inline) {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;

    .el-form-item {
      margin-right: 0;
      margin-bottom: 0;
    }
  }

  .btn-gold,
  .btn-outline {
    height: 32px;
    padding: 0 16px;
  }

  @include tablet-down {
    :deep(.el-form--inline .el-form-item) { margin-right: 0; }
  }
}

// ============ 表格简约化 ============
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


// ============ 元素样式 ============
.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.username-text {
  color: var(--text-primary);
  font-weight: 500;
}

.text-tertiary {
  color: var(--text-tertiary);
  font-size: 12px;
}

.module-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.detail-text {
  color: var(--text-secondary);
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
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

// 分页居中
.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px;
}

// ============ 详情弹窗 ============
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px dashed var(--border-light);
  padding-right: 16px;

  &.full {
    grid-column: 1 / -1;
    padding-right: 0;
  }

  &:nth-child(odd) {
    padding-right: 16px;

    @include mobile {
      padding-right: 0;
    }
  }

  &:nth-child(even) {
    padding-left: 16px;

    @include mobile {
      padding-left: 0;
    }
  }

  .detail-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1px;
    color: var(--text-tertiary);
    text-transform: uppercase;
  }

  .detail-value {
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;
    text-align: right;
  }
}

.detail-section {
  margin-top: 20px;

  .section-label {
    margin-bottom: 8px;
  }

  .detail-json {
    margin: 0;
    padding: 14px;
    background: var(--bg-subtle);
    border: 1px solid var(--border-base);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-primary);
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

// ===== 响应式适配 =====
@include mobile {
  .admin-audit-logs { gap: 12px; }

  .filter-card {
    padding: 12px;

    :deep(.el-form--inline) {
      display: flex;
      flex-direction: column;

      .el-form-item {
        margin-right: 0;
        width: 100%;

        .el-input, .el-select, .el-date-editor {
          width: 100% !important;
        }
      }
    }

    .btn-gold,
    .btn-outline {
      flex: 1;
    }
  }

  .table-body {
    padding: 0 12px;
  }

  .detail-section .detail-json {
    font-size: 11px;
  }
}
</style>
