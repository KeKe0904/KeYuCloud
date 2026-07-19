<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ticketApi } from '@/api/ticket';

const router = useRouter();

// 列表数据
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 筛选条件
const query = reactive({
  status: '' as string,
  type: '' as string,
  page: 1,
  pageSize: 10,
});

// 状态选项
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '待处理', value: 'open' },
  { label: '处理中', value: 'pending' },
  { label: '已回复', value: 'replied' },
  { label: '已关闭', value: 'closed' },
];

// 类型选项（与后端 DTO @IsIn 对齐：tech/expense/sale/feedback/reward）
const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '售前咨询', value: 'sale' },
  { label: '财务问题', value: 'expense' },
  { label: '技术支持', value: 'tech' },
  { label: '奖励返佣', value: 'reward' },
  { label: '意见反馈', value: 'feedback' },
];

// 状态映射
const statusMap: Record<string, { text: string; type: string }> = {
  open: { text: '待处理', type: 'warning' },
  pending: { text: '处理中', type: 'info' },
  replied: { text: '已回复', type: 'success' },
  closed: { text: '已关闭', type: 'info' },
};

// 类型映射（与后端 DTO 对齐）
const typeMap: Record<string, string> = {
  sale: '售前咨询',
  expense: '财务问题',
  tech: '技术支持',
  reward: '奖励返佣',
  feedback: '意见反馈',
};

// 优先级映射
const priorityMap: Record<string, { text: string; type: string }> = {
  low: { text: '低', type: 'info' },
  normal: { text: '中', type: 'info' },
  high: { text: '高', type: 'warning' },
  urgent: { text: '紧急', type: 'danger' },
};

// 格式化时间
function formatTime(val: string) {
  if (!val) return '-';
  try {
    return new Date(val).toLocaleString('zh-CN');
  } catch {
    return val;
  }
}

// 加载列表
async function loadList() {
  loading.value = true;
  try {
    const res = await ticketApi.list({
      status: query.status || undefined,
      type: query.type || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    list.value = res.data?.list || res.data?.items || [];
    total.value = res.data?.total || 0;
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false;
  }
}

// 搜索
function onSearch() {
  query.page = 1;
  loadList();
}

// 重置
function onReset() {
  query.status = '';
  query.type = '';
  query.page = 1;
  loadList();
}

// 分页变化
function onPageChange(p: number) {
  query.page = p;
  loadList();
}

function onSizeChange(s: number) {
  query.pageSize = s;
  query.page = 1;
  loadList();
}

// 查看详情
function goDetail(row: any) {
  router.push(`/dashboard/tickets/${row.id}`);
}

// 新建工单
function goNew() {
  router.push('/dashboard/tickets/new');
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <div class="tickets-page">
    <!-- 页头 -->
    <header class="page-head">
      <div class="head-meta">
        <span class="eyebrow">MY TICKETS</span>
        <h1 class="page-title font-display">工单中心</h1>
      </div>
      <el-button class="btn-gold" @click="goNew">
        <el-icon><EditPen /></el-icon>
        新建工单
      </el-button>
    </header>

    <!-- 筛选区 -->
    <section class="filter-bar card">
      <div class="filter-row">
        <div class="filter-group">
          <div class="filter-item">
            <label class="filter-label eyebrow">工单状态</label>
            <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 140px" @change="onSearch">
              <el-option v-for="opt in statusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label eyebrow">工单类型</label>
            <el-select v-model="query.type" placeholder="全部类型" clearable style="width: 140px" @change="onSearch">
              <el-option v-for="opt in typeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </div>
        </div>
        <div class="filter-actions">
          <el-button class="btn-outline" @click="onReset">重置</el-button>
          <el-button class="btn-gold" @click="onSearch">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
        </div>
      </div>
    </section>

    <!-- 工单表格 -->
    <section class="table-card card">
      <div class="table-wrap">
        <el-table
          v-loading="loading"
          :data="list"
          style="width: 100%"
          empty-text="暂无工单数据"
          class="dashed-table"
        >
          <el-table-column label="工单号" min-width="160">
            <template #default="{ row }">
              <span class="ticket-no font-mono" @click="goDetail(row)">{{ row.ticketNo || `#${row.id}` }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
          <el-table-column label="类型" width="120" align="center">
            <template #default="{ row }">
              <span class="type-text">{{ typeMap[row.type] || row.type || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <span
                class="status-text"
                :class="`is-${statusMap[row.status]?.type || 'info'}`"
              >
                {{ statusMap[row.status]?.text || row.status || '未知' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="优先级" width="90" align="center">
            <template #default="{ row }">
              <span
                class="status-text"
                :class="`is-${priorityMap[row.priority]?.type || 'info'}`"
              >
                {{ priorityMap[row.priority]?.text || row.priority || '中' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">
              <span class="time-value">{{ formatTime(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="goDetail(row)">查看详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.tickets-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页头 ============
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.head-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .eyebrow {
    display: block;
  }
}

.page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.15;
  letter-spacing: -0.3px;
}

// ============ 筛选栏 ============
.filter-bar {
  padding: 16px 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
  white-space: nowrap;
}

.filter-actions {
  display: flex;
  gap: 10px;
}

// ============ 表格卡 ============
.table-card {
  padding: 4px 8px 8px;
  overflow: visible;
  min-width: 0;
}

// 表格包裹：移动端水平滚动
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  :deep(.el-table) {
    min-width: 720px;
  }
}

// 虚线分隔表格：覆盖 el-table 内部边框
:deep(.dashed-table) {
  --el-table-border-color: transparent;

  .el-table__body tr.el-table__row--striped td {
    background: transparent;
  }

  .el-table__cell {
    border-bottom: 1px dashed var(--border-base) !important;
  }

  th.el-table__cell {
    border-bottom: 1px solid var(--border-base) !important;
    background: transparent;
    .cell {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-tertiary);
    }
  }

  .el-table__body tr:hover > td {
    background: var(--bg-hover) !important;
  }
}

.ticket-no {
  color: var(--text-gold);
  cursor: pointer;
  font-size: 13px;

  &:hover {
    text-decoration: underline;
  }
}

.type-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.time-value {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
}

// ============ 状态文字 ============
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger { color: var(--danger); }
  &.is-info { color: var(--text-tertiary); }
}

// 分页居中
.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 8px 8px;
}

// ============ 响应式 ============
@include tablet-down {
  .tickets-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .filter-bar {
    padding: 14px 16px;
  }
  .pagination-wrap {
    padding: 12px 4px 4px;
  }
}

// 手机端：筛选纵向堆叠 + 分页居中 + 页头操作按钮全宽
@include mobile {
  .tickets-page {
    gap: 12px;
  }
  .page-head {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .page-title {
    font-size: 20px;
  }
  .page-head .btn-gold {
    width: 100%;
  }
  .filter-bar {
    padding: 12px;
  }
  .filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .filter-group {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .filter-item {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .filter-item :deep(.el-select) {
    width: 100% !important;
  }
  .filter-actions {
    justify-content: stretch;
    .el-button {
      flex: 1;
    }
  }
  .table-card {
    padding: 2px 4px 4px;
  }
  .pagination-wrap {
    padding: 10px 4px 4px;
  }
}
</style>
