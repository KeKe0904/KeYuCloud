<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';
import http from '@/api/http';
import dayjs from 'dayjs';

interface SmtpLog {
  id: number;
  to: string;
  subject: string;
  templateCode?: string;
  templateName?: string;
  status: 'sent' | 'failed';
  duration: number;
  errorMessage?: string;
  createdAt: string;
}

const loading = ref(false);
const logs = ref<SmtpLog[]>([]);
const total = ref(0);

const filters = reactive({
  status: '',
  template: '',
  recipient: '',
  dateRange: [] as string[],
  page: 1,
  pageSize: 10,
});

const resending = ref<number | null>(null);

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-';
}

async function loadList() {
  loading.value = true;
  try {
    const params: any = {
      page: filters.page,
      pageSize: filters.pageSize,
    };
    if (filters.status) params.status = filters.status;
    if (filters.template) params.template = filters.template;
    if (filters.recipient) params.recipient = filters.recipient;
    if (filters.dateRange?.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }
    const res: any = await adminApi.smtpLogs(params);
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
  filters.status = '';
  filters.template = '';
  filters.recipient = '';
  filters.dateRange = [];
  filters.page = 1;
  loadList();
}

async function handleResend(row: any) {
  try {
    await ElMessageBox.confirm(
      `确认重新发送邮件到「${row.to}」？`,
      '重发邮件',
      { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  confirmButtonText: '确认重发', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  resending.value = row.id;
  try {
    // 调用重发接口（按 ID 重发原始邮件）
    const res: any = await http.post(`/admin/smtp/logs/${row.id}/resend`);
    if (res?.success) {
      ElMessage.success('重发请求已提交');
      await loadList();
    }
  } catch (e) {
    // 错误已由拦截器提示
  } finally {
    resending.value = null;
  }
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <div class="admin-smtp-logs">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">SMTP LOGS</span>
        <h2 class="page-title font-display">邮件日志</h2>
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
          <el-form-item label="状态">
            <el-select v-model="filters.status" placeholder="全部" clearable style="width: 130px">
              <el-option label="发送成功" value="sent" />
              <el-option label="发送失败" value="failed" />
            </el-select>
          </el-form-item>
          <el-form-item label="模板">
            <el-input v-model="filters.template" placeholder="模板代码" clearable style="width: 160px" />
          </el-form-item>
          <el-form-item label="收件人">
            <el-input v-model="filters.recipient" placeholder="邮箱地址" clearable style="width: 180px" />
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
        <span class="card-title">发送记录</span>
        <span class="card-extra">{{ total }} RECORDS</span>
      </div>
      <div class="card-body table-body">
      <div class="table-wrap">
        <el-table :data="logs" v-loading="loading">
            <el-table-column prop="id" label="ID" width="80">
              <template #default="{ row }">
                <span class="mono">#{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="to" label="收件人" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="mono">{{ row.to }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="subject" label="主题" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="subject-text">{{ row.subject }}</span>
              </template>
            </el-table-column>
            <el-table-column label="模板" width="160">
              <template #default="{ row }">
                <span v-if="row.templateCode" class="code-chip">{{ row.templateCode }}</span>
                <span v-else class="text-tertiary">-</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <span class="status-text" :class="row.status === 'sent' ? 'is-success' : 'is-danger'">
                  {{ row.status === 'sent' ? '成功' : '失败' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="100" align="right">
              <template #default="{ row }">
                <span class="mono duration-text">{{ row.duration }}ms</span>
              </template>
            </el-table-column>
            <el-table-column label="错误信息" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.errorMessage" class="error-text">{{ row.errorMessage }}</span>
                <span v-else class="text-tertiary">-</span>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                <span class="mono">{{ formatTime(row.createdAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button
                  link
                  type="primary"
                  size="small"
                  :loading="resending === row.id"
                  @click="handleResend(row)"
                >
                  重发
                </el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty description="暂无邮件日志" /></template>
          </el-table>
        </div>

        <div class="pagination-wrap">
          <el-pagination
            v-model:current-page="filters.page"
            v-model:page-size="filters.pageSize"
            :total="total"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            @current-change="loadList"
            @size-change="loadList"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-smtp-logs {
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
  color: var(--text-primary);
}

.text-gold {
  color: var(--text-gold);
  font-weight: 600;
}

.text-tertiary {
  color: var(--text-tertiary);
  font-size: 12px;
}

.subject-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.code-chip {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid var(--border-gold);
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-gold);
  letter-spacing: 0.5px;
  background: var(--bg-subtle);
}

.duration-text {
  color: var(--text-secondary);
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  line-height: 1.4;
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

// ===== 响应式适配 =====
@include mobile {
  .admin-smtp-logs { gap: 12px; }

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
}
</style>
