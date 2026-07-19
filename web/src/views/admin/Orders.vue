<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

const router = useRouter();

// 筛选
const filters = reactive({
  orderNo: '',
  status: '',
  userId: '',
  username: '',
  dateRange: [] as string[],
  page: 1,
  pageSize: 20,
});

// 列表
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 格式化
const formatMoney = (v: any): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '¥0.00';
  return '¥' + Number(v).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (v: any): string => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
};

// 状态映射
const statusTag = (s: string) => {
  const map: Record<string, string> = {
    pending: 'warning', paid: 'success', opening: 'primary',
    completed: 'success', refunded: 'info', failed: 'danger', cancelled: 'info',
  };
  return map[s] || 'info';
};

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    pending: '待支付', paid: '已支付', opening: '开通中',
    completed: '已完成', refunded: '已退款', failed: '失败', cancelled: '已取消',
  };
  return map[s] || s;
};

const payMethodLabel = (m: string) => {
  const map: Record<string, string> = {
    balance: '余额', alipay: '支付宝', wechat: '微信', stripe: 'Stripe',
    paypal: 'PayPal', manual: '人工',
  };
  return map[m] || m || '-';
};

// 统计行
const stats = computed(() => {
  const totalAmount = list.value.reduce(
    (sum, o) => sum + (Number(o.amount) || 0), 0,
  );
  const paidAmount = list.value
    .filter((o) => ['paid', 'opening', 'completed'].includes(o.status))
    .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const pendingAmount = list.value
    .filter((o) => o.status === 'pending')
    .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  return { totalAmount, paidAmount, pendingAmount };
});

// 加载列表
const loadList = async () => {
  loading.value = true;
  try {
    const params: any = {
      orderNo: filters.orderNo || undefined,
      status: filters.status || undefined,
      userId: filters.userId || undefined,
      username: filters.username || undefined,
      page: filters.page,
      pageSize: filters.pageSize,
    };
    if (filters.dateRange && filters.dateRange.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }
    const res: any = await adminApi.orders(params);
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
  filters.orderNo = ''; filters.status = ''; filters.userId = '';
  filters.username = ''; filters.dateRange = [];
  filters.page = 1; loadList();
};
const onPageChange = (p: number) => { filters.page = p; loadList(); };
const onSizeChange = (s: number) => { filters.pageSize = s; filters.page = 1; loadList(); };

// 退款弹窗
const refundDialog = reactive({
  visible: false, loading: false,
  orderId: 0, orderNo: '', reason: '',
});
const openRefund = (row: any) => {
  refundDialog.orderId = row.id;
  refundDialog.orderNo = row.orderNo;
  refundDialog.reason = '';
  refundDialog.visible = true;
};
const submitRefund = async () => {
  if (!refundDialog.reason.trim()) {
    ElMessage.warning('请输入退款原因');
    return;
  }
  refundDialog.loading = true;
  try {
    const res: any = await adminApi.refundOrder(refundDialog.orderId, refundDialog.reason.trim());
    if (res?.success) {
      ElMessage.success('退款已发起');
      refundDialog.visible = false;
      loadList();
    }
  } catch {} finally {
    refundDialog.loading = false;
  }
};

// 重试开通
const onRetryOpen = (row: any) => {
  ElMessageBox.confirm(
    `确认要重试开通订单「${row.orderNo}」吗？`,
    '重试开通',
    { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning' },
  )
    .then(async () => {
      try {
        const res: any = await adminApi.retryOpen(row.id);
        if (res?.success) {
          ElMessage.success('已触发重试开通');
          loadList();
        }
      } catch {}
    })
    .catch(() => {});
};

const goDetail = (id: number) => router.push(`/admin/orders/${id}`);

onMounted(() => loadList());
</script>

<template>
  <div class="admin-orders">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="page-header-left">
        <span class="eyebrow">ORDER MANAGEMENT</span>
        <h2 class="page-title font-display">订单管理</h2>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="card filter-card">
      <el-form :inline="true" :model="filters" @submit.prevent>
        <el-form-item label="订单号">
          <el-input
            v-model="filters.orderNo"
            placeholder="订单号"
            clearable
            style="width: 200px"
            @keyup.enter="onSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable style="width: 130px">
            <el-option label="待支付" value="pending" />
            <el-option label="已支付" value="paid" />
            <el-option label="开通中" value="opening" />
            <el-option label="已完成" value="completed" />
            <el-option label="已退款" value="refunded" />
            <el-option label="失败" value="failed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户">
          <el-input
            v-model="filters.username"
            placeholder="用户名 / 手机号"
            clearable
            style="width: 160px"
          />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DD"
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item>
          <el-button class="admin-btn admin-btn-primary" :icon="'Search'" @click="onSearch">搜索</el-button>
          <el-button :icon="'Refresh'" @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 列表 -->
    <div class="card table-card">
      <div class="table-wrap">
        <el-table v-loading="loading" :data="list" show-summary :summary-method="() => [
          '统计 (当前页)',
          '', '', '',
          formatMoney(stats.totalAmount),
          '', '', '',
        ]">
          <el-table-column prop="orderNo" label="订单号" min-width="170" show-overflow-tooltip />
          <el-table-column label="用户" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.user?.nickname || row.user?.username || row.userName || row.userId || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="商品" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.productName || row.product?.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="120" align="right">
            <template #default="{ row }">
              <span class="money">{{ formatMoney(row.amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${statusTag(row.status)}`">
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="payMethod" label="支付方式" width="100" align="center">
            <template #default="{ row }">{{ payMethodLabel(row.payMethod) }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button class="admin-btn admin-btn-sm" @click="goDetail(row.id)">详情</el-button>
              <el-button
                v-if="['paid', 'completed'].includes(row.status)"
                class="admin-btn admin-btn-sm admin-btn-danger"
                @click="openRefund(row)"
              >退款</el-button>
              <el-button
                v-if="['paid', 'failed', 'opening'].includes(row.status)"
                class="admin-btn admin-btn-sm admin-btn-warn"
                @click="onRetryOpen(row)"
              >重试开通</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无订单" /></template>
        </el-table>
      </div>

      <div class="pager">
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

    <!-- 退款弹窗 -->
    <el-dialog v-model="refundDialog.visible" title="订单退款" width="460px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="订单号">
          <span class="money">{{ refundDialog.orderNo }}</span>
        </el-form-item>
        <el-form-item label="退款原因" required>
          <el-input
            v-model="refundDialog.reason"
            type="textarea"
            :rows="4"
            placeholder="请详细说明退款原因，便于审计"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundDialog.visible = false">取消</el-button>
        <el-button type="danger" :loading="refundDialog.loading" @click="submitRefund">确认退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;
.admin-orders {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页面头 ============
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;

  .page-header-left {
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
    letter-spacing: -0.2px;
  }

  @include mobile {
    .page-title { font-size: 22px; }
  }
}

// ============ 筛选卡 ============
.filter-card {
  padding: 16px 20px;

  :deep(.el-form-item) {
    margin-bottom: 16px;
    margin-right: 12px;
  }
}

// ============ 表格卡 ============
.table-card {
  overflow: visible;
  min-width: 0;

  :deep(.el-table) {
    --el-table-border-color: var(--border-light);
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
      font-size: 11px;
      letter-spacing: 2px;
      color: var(--text-tertiary);
      font-weight: 500;
      text-transform: uppercase;
      font-family: 'JetBrains Mono', monospace;
      padding: 12px 0;
    }

    .el-table__cell {
      border-bottom: 1px dashed var(--border-base);
      padding: 12px 0;
    }

    // 合计行
    .el-table__footer-wrapper .el-table__cell {
      border-bottom: none;
      border-top: 1px solid var(--border-base);
      background: var(--bg-subtle);
      font-weight: 600;
      color: var(--text-primary);
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
    min-width: 1000px;
  }
}

.money {
  color: var(--text-gold);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

// 状态纯文字
.status-text {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--text-gold); }
  &.is-danger { color: var(--danger); }
  &.is-primary { color: var(--text-gold); }
  &.is-info { color: var(--text-tertiary); }
}

.pager {
  padding: 16px;
  display: flex;
  justify-content: center;
}

// ===== 响应式适配 =====
// 平板及以下：筛选表单允许换行
@include tablet-down {
  .filter-card :deep(.el-form--inline .el-form-item) { margin-right: 0; }
}

// 手机：筛选表单纵向堆叠，分页居中
@include mobile {
  .filter-card {
    padding: 12px 12px 0;
    :deep(.el-form--inline) {
      display: flex;
      flex-direction: column;
      .el-form-item {
        margin-right: 0;
        width: 100%;
        .el-input, .el-select, .el-date-editor { width: 100% !important; }
      }
    }
  }
  .pager {
    padding: 12px;
    justify-content: center;
  }
}
</style>
