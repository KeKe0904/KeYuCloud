<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

const router = useRouter();

// 筛选
const filters = reactive({
  userId: '',
  username: '',
  status: '',
  productId: '',
  page: 1,
  pageSize: 20,
});

// 列表
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 格式化
const formatDate = (v: any): string => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
};

// 状态
const statusTag = (s: string) => {
  const map: Record<string, string> = {
    running: 'success', stopped: 'warning', expired: 'info',
    error: 'danger', pending: 'info', suspended: 'warning',
  };
  return map[s] || 'info';
};

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    running: '运行中', stopped: '已停机', expired: '已到期',
    error: '异常', pending: '待开通', suspended: '已暂停',
  };
  return map[s] || s;
};

// 加载列表
const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await adminApi.userProducts({
      userId: filters.userId || undefined,
      username: filters.username || undefined,
      status: filters.status || undefined,
      productId: filters.productId || undefined,
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

const onSearch = () => { filters.page = 1; loadList(); };
const onReset = () => {
  filters.userId = ''; filters.username = '';
  filters.status = ''; filters.productId = '';
  filters.page = 1; loadList();
};
const onPageChange = (p: number) => { filters.page = p; loadList(); };
const onSizeChange = (s: number) => { filters.pageSize = s; filters.page = 1; loadList(); };

// 同步状态
const onSync = (row: any) => {
  ElMessageBox.confirm(`确认要同步产品「${row.name || row.id}」的上游状态吗？`, '同步状态', { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'info' })
    .then(async () => {
      try {
        const res: any = await adminApi.syncUserProduct(row.id);
        if (res?.success) {
          ElMessage.success('已同步');
          loadList();
        }
      } catch {}
    })
    .catch(() => {});
};

// 开机 / 关机 / 重启
const onOperate = (row: any, action: string) => {
  const labels: Record<string, string> = {
    start: '开机', stop: '关机', restart: '重启',
  };
  ElMessageBox.confirm(
    `确认要对产品「${row.name || row.id}」执行「${labels[action]}」操作吗？`,
    labels[action],
    { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning' },
  )
    .then(async () => {
      try {
        const res: any = await adminApi.operateUserProduct(row.id, action);
        if (res?.success) {
          ElMessage.success(`${labels[action]}指令已发送`);
          loadList();
        }
      } catch {}
    })
    .catch(() => {});
};

onMounted(() => loadList());
</script>

<template>
  <div class="admin-user-products">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">USER PRODUCTS</span>
        <h2 class="page-title font-display">用户产品</h2>
      </div>
    </div>

    <!-- 筛选卡 -->
    <div class="card filter-card">
      <div class="filter-bar">
        <el-form :inline="true" :model="filters" @submit.prevent>
          <el-form-item label="用户">
            <el-input
              v-model="filters.username"
              placeholder="用户名 / 手机号"
              clearable
              style="width: 160px"
            />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="filters.status" placeholder="全部" clearable style="width: 130px">
              <el-option label="运行中" value="running" />
              <el-option label="已停机" value="stopped" />
              <el-option label="已到期" value="expired" />
              <el-option label="异常" value="error" />
              <el-option label="待开通" value="pending" />
              <el-option label="已暂停" value="suspended" />
            </el-select>
          </el-form-item>
          <el-form-item label="商品 ID">
            <el-input
              v-model="filters.productId"
              placeholder="商品 ID"
              clearable
              style="width: 130px"
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
          <el-table-column prop="id" label="ID" width="70" align="center" />
          <el-table-column label="用户" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.user?.nickname || row.user?.username || row.userName || row.userId || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="name" label="产品名" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">{{ row.name || '-' }}</template>
          </el-table-column>
          <el-table-column label="所属商品" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.productName || row.product?.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${statusTag(row.status)}`">
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="expireAt" label="到期时间" width="170">
            <template #default="{ row }">
              <span :class="{ 'expired': row.expireAt && new Date(row.expireAt) < new Date() }">
                {{ formatDate(row.expireAt) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-button class="admin-btn admin-btn-sm" @click="onSync(row)">同步状态</el-button>
              <el-button
                v-if="row.status === 'stopped' || row.status === 'suspended'"
                class="admin-btn admin-btn-sm admin-btn-success"
                @click="onOperate(row, 'start')"
              >开机</el-button>
              <el-button
                v-if="row.status === 'running'"
                class="admin-btn admin-btn-sm admin-btn-warn"
                @click="onOperate(row, 'stop')"
              >关机</el-button>
              <el-button
                v-if="row.status === 'running' || row.status === 'stopped'"
                class="admin-btn admin-btn-sm admin-btn-info"
                @click="onOperate(row, 'restart')"
              >重启</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无用户产品" /></template>
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
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-user-products {
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


.expired {
  color: var(--danger);
  font-weight: 600;
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
</style>
