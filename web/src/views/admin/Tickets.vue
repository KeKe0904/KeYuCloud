<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

const router = useRouter();

// 筛选
const filters = reactive({
  status: '',
  type: '',
  priority: '',
  keyword: '',
  page: 1,
  pageSize: 20,
});

// 列表
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 管理员列表（用于分配）
const admins = ref<any[]>([]);

// 格式化
const formatDate = (v: any): string => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
};

// 状态：待处理（warning）、处理中（primary）、已回复（success）、已关闭（info）
const statusTag = (s: string) => {
  const map: Record<string, string> = {
    pending: 'warning', processing: 'primary', replied: 'success', closed: 'info',
  };
  return map[s] || 'info';
};
const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    pending: '待处理', processing: '处理中', replied: '已回复', closed: '已关闭',
  };
  return map[s] || s;
};

// 优先级：低（info）、中（warning）、高（danger）、紧急（danger）
const priorityTag = (p: string) => {
  const map: Record<string, string> = {
    low: 'info', medium: 'warning', high: 'danger', urgent: 'danger',
  };
  return map[p] || 'info';
};
const priorityLabel = (p: string) => {
  const map: Record<string, string> = {
    low: '低', medium: '中', high: '高', urgent: '紧急',
  };
  return map[p] || p;
};

const typeLabel = (t: string) => {
  const map: Record<string, string> = {
    tech: '技术支持', expense: '财务问题', sale: '售前咨询',
    reward: '奖励返佣', feedback: '意见反馈',
  };
  return map[t] || t || '-';
};

// 加载列表
const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await adminApi.tickets({
      status: filters.status || undefined,
      type: filters.type || undefined,
      priority: filters.priority || undefined,
      keyword: filters.keyword || undefined,
      page: filters.page,
      pageSize: filters.pageSize,
    });
    if (res?.success) {
      const d = res.data;
      list.value = d?.list ?? d?.items ?? d?.records ?? [];
      total.value = d?.total ?? list.value.length;
    }
  } catch {} finally {
    loading.value = false;
  }
};

// 加载管理员列表
const loadAdmins = async () => {
  try {
    const res: any = await adminApi.admins();
    if (res?.success) {
      admins.value = res.data?.list ?? res.data ?? [];
    }
  } catch {}
};

const onSearch = () => { filters.page = 1; loadList(); };
const onReset = () => {
  filters.status = ''; filters.type = '';
  filters.priority = ''; filters.keyword = '';
  filters.page = 1; loadList();
};
const onPageChange = (p: number) => { filters.page = p; loadList(); };
const onSizeChange = (s: number) => { filters.pageSize = s; filters.page = 1; loadList(); };

// 分配弹窗
const assignDialog = reactive({
  visible: false, loading: false,
  ticketId: 0, ticketNo: '', adminId: null as number | null,
});
const openAssign = (row: any) => {
  assignDialog.ticketId = row.id;
  assignDialog.ticketNo = row.ticketNo;
  assignDialog.adminId = row.assigneeId ?? row.adminId ?? null;
  assignDialog.visible = true;
};
const submitAssign = async () => {
  if (!assignDialog.adminId) {
    ElMessage.warning('请选择受理人');
    return;
  }
  assignDialog.loading = true;
  try {
    const res: any = await adminApi.assignTicket(assignDialog.ticketId, assignDialog.adminId);
    if (res?.success) {
      ElMessage.success('已分配');
      assignDialog.visible = false;
      loadList();
    }
  } catch {} finally {
    assignDialog.loading = false;
  }
};

// 关闭工单
const onClose = (row: any) => {
  ElMessageBox.confirm(
    `确认要关闭工单「${row.ticketNo}」吗？关闭后用户仍可重新提问。`,
    '关闭工单',
    { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning' },
  )
    .then(async () => {
      try {
        const res: any = await adminApi.closeTicket(row.id);
        if (res?.success) {
          ElMessage.success('工单已关闭');
          loadList();
        }
      } catch {}
    })
    .catch(() => {});
};

// 升级到雨云
const onEscalate = (row: any) => {
  ElMessageBox.confirm(
    `确认要将工单「${row.ticketNo}」升级到雨云上游处理吗？升级后由雨云客服跟进。`,
    '升级到雨云',
    { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning' },
  )
    .then(async () => {
      try {
        const res: any = await adminApi.escalateTicket(row.id);
        if (res?.success) {
          ElMessage.success('已升级到雨云');
          loadList();
        }
      } catch {}
    })
    .catch(() => {});
};

const goDetail = (id: number) => router.push(`/admin/tickets/${id}`);

onMounted(() => {
  loadList();
  loadAdmins();
});
</script>

<template>
  <div class="admin-tickets">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">TICKET MANAGEMENT</span>
        <h2 class="page-title font-display">工单管理</h2>
      </div>
    </div>

    <!-- 筛选卡 -->
    <div class="card filter-card">
      <div class="filter-bar">
        <el-form :inline="true" :model="filters" @submit.prevent>
          <el-form-item label="状态">
            <el-select v-model="filters.status" placeholder="全部" clearable style="width: 130px">
              <el-option label="待处理" value="pending" />
              <el-option label="处理中" value="processing" />
              <el-option label="已回复" value="replied" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item label="类型">
            <el-select v-model="filters.type" placeholder="全部" clearable style="width: 130px">
              <el-option label="售前咨询" value="sale" />
              <el-option label="财务问题" value="expense" />
              <el-option label="技术支持" value="tech" />
              <el-option label="奖励返佣" value="reward" />
              <el-option label="意见反馈" value="feedback" />
            </el-select>
          </el-form-item>
          <el-form-item label="优先级">
            <el-select v-model="filters.priority" placeholder="全部" clearable style="width: 120px">
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
              <el-option label="紧急" value="urgent" />
            </el-select>
          </el-form-item>
          <el-form-item label="关键字">
            <el-input
              v-model="filters.keyword"
              placeholder="工单号 / 标题"
              clearable
              style="width: 180px"
              @keyup.enter="onSearch"
            />
          </el-form-item>
          <el-form-item>
            <el-button class="btn-gold" @click="onSearch">搜索</el-button>
            <el-button class="btn-outline" @click="onReset">重置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 列表卡 -->
    <div class="card table-card">
      <div class="table-wrap">
        <el-table v-loading="loading" :data="list">
          <el-table-column prop="ticketNo" label="工单号" min-width="150" show-overflow-tooltip />
          <el-table-column label="用户" min-width="130" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.user?.nickname || row.user?.username || row.userName || row.userId || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
          <el-table-column prop="type" label="类型" width="90" align="center">
            <template #default="{ row }">{{ typeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${statusTag(row.status)}`">
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" width="90" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${priorityTag(row.priority)}`">
                {{ priorityLabel(row.priority) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="受理人" width="120" align="center">
            <template #default="{ row }">
              {{ row.assignee?.nickname || row.assignee?.username || row.adminName || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="320" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button class="admin-btn admin-btn-sm" @click="goDetail(row.id)">详情</el-button>
                <el-button
                  v-if="row.status !== 'closed'"
                  class="admin-btn admin-btn-sm admin-btn-warn"
                  @click="openAssign(row)"
                >分配</el-button>
                <el-button
                  v-if="row.status !== 'closed'"
                  class="admin-btn admin-btn-sm admin-btn-info"
                  @click="onClose(row)"
                >关闭</el-button>
                <el-button
                  v-if="row.status !== 'closed'"
                  class="admin-btn admin-btn-sm admin-btn-danger"
                  @click="onEscalate(row)"
                >升级雨云</el-button>
              </div>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无工单" /></template>
        </el-table>
      </div>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </div>

    <!-- 分配弹窗 -->
    <el-dialog v-model="assignDialog.visible" title="分配受理人" width="420px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="工单号">
          <span class="ticket-no">{{ assignDialog.ticketNo }}</span>
        </el-form-item>
        <el-form-item label="受理人" required>
          <el-select
            v-model="assignDialog.adminId"
            placeholder="请选择管理员"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="a in admins"
              :key="a.id"
              :label="a.nickname || a.username"
              :value="a.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-outline" @click="assignDialog.visible = false">取消</el-button>
        <el-button class="btn-gold" :loading="assignDialog.loading" @click="submitAssign">确认分配</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-tickets {
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
  }
}

// ============ 筛选卡 ============
.filter-card {
  padding: 16px 20px;

  :deep(.el-form-item) {
    margin-bottom: 0;
    margin-right: 12px;
  }
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;

  @include mobile {
    flex-direction: column;
    align-items: stretch;

    :deep(.el-form--inline) {
      display: flex;
      flex-direction: column;
      width: 100%;
    }
    :deep(.el-form-item) {
      margin-right: 0;
      width: 100%;
      .el-input, .el-select, .el-date-editor { width: 100% !important; }
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


.ticket-no {
  color: var(--text-gold);
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
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
@include tablet-down {
  .filter-card :deep(.el-form--inline .el-form-item) { margin-right: 0; }
}

@include mobile {
  .filter-card { padding: 12px 12px 0; }
  .pagination-wrap { padding: 12px; }
}

// 表格行内操作按钮容器：按钮间留间距，避免挤在一起
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  // 重置 el-button 默认 margin-left（admin-btn 系列自带间距用 gap 控制）
  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}
</style>
