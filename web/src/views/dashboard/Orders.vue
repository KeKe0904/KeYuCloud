<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { orderApi } from '@/api/order';

const router = useRouter();

// 列表数据
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 筛选条件
const query = reactive({
  status: '' as string,
  page: 1,
  pageSize: 10,
});

// 状态选项
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '待支付', value: 'pending' },
  { label: '已支付', value: 'paid' },
  { label: '已取消', value: 'cancelled' },
  { label: '已退款', value: 'refunded' },
];

// 状态映射
const statusMap: Record<string, { text: string; type: string }> = {
  pending: { text: '待支付', type: 'warning' },
  paid: { text: '已支付', type: 'success' },
  cancelled: { text: '已取消', type: 'info' },
  refunded: { text: '已退款', type: 'danger' },
};

// 支付弹窗
const payDialog = reactive({
  visible: false,
  loading: false,
  orderId: 0,
  orderNo: '',
  amount: 0,
  method: 'balance' as 'balance' | 'epay',
});

// 格式化金额
function formatMoney(val: number | string) {
  const num = Number(val || 0);
  return `¥${num.toFixed(2)}`;
}

// 格式化时间
function formatTime(val: string) {
  if (!val) return '-';
  try {
    return new Date(val).toLocaleString('zh-CN');
  } catch {
    return val;
  }
}

// 时长描述
function formatDuration(val: any) {
  if (!val && val !== 0) return '-';
  const num = Number(val);
  if (num >= 12 && num % 12 === 0) return `${num / 12} 年`;
  if (num >= 1) return `${num} 个月`;
  if (num > 0 && num < 1) return `${Math.round(num * 30)} 天`;
  return `${num} 个月`;
}

// 加载订单列表
async function loadList() {
  loading.value = true;
  try {
    const res = await orderApi.list({
      status: query.status || undefined,
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
  router.push(`/dashboard/orders/${row.id}`);
}

// 打开支付弹窗
function openPayDialog(row: any) {
  payDialog.orderId = row.id;
  payDialog.orderNo = row.orderNo || `#${row.id}`;
  payDialog.amount = Number(row.amount || row.totalAmount || 0);
  payDialog.method = 'balance';
  payDialog.visible = true;
}

// 确认支付
async function confirmPay() {
  if (!payDialog.orderId) return;
  payDialog.loading = true;
  try {
    if (payDialog.method === 'balance') {
      const res = await orderApi.payWithBalance(payDialog.orderId);
      ElMessage.success('余额支付成功');
      payDialog.visible = false;
      await loadList();
    } else {
      const res = await orderApi.payWithEpay(payDialog.orderId);
      const url = res.data?.url || res.data?.payUrl || res.data;
      if (url) {
        // 跳转到易支付页面
        window.location.href = typeof url === 'string' ? url : String(url);
      } else {
        ElMessage.warning('未获取到支付链接，请稍后重试');
      }
    }
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    payDialog.loading = false;
  }
}

// 取消订单
async function onCancel(row: any) {
  try {
    await ElMessageBox.confirm(
      `确定要取消订单 ${row.orderNo || `#${row.id}`} 吗？取消后无法恢复。`,
      '取消订单确认',
      { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning', confirmButtonText: '确定取消', cancelButtonText: '再想想' },
    );
  } catch {
    return;
  }
  try {
    await orderApi.cancel(row.id);
    ElMessage.success('订单已取消');
    await loadList();
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <div class="orders-page">
    <!-- 页头 -->
    <header class="page-head">
      <span class="eyebrow">MY ORDERS</span>
      <h1 class="page-title font-display">我的订单</h1>
    </header>

    <!-- 筛选区 -->
    <section class="filter-bar card">
      <div class="filter-row">
        <div class="filter-item">
          <label class="filter-label eyebrow">订单状态</label>
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 160px" @change="onSearch">
            <el-option v-for="opt in statusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
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

    <!-- 订单表格 -->
    <section class="table-card card">
      <div class="table-wrap">
        <el-table
          v-loading="loading"
          :data="list"
          style="width: 100%"
          empty-text="暂无订单数据"
          class="dashed-table"
        >
          <el-table-column label="订单号" min-width="180">
            <template #default="{ row }">
              <span class="order-no font-mono" @click="goDetail(row)">{{ row.orderNo || `#${row.id}` }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="productName" label="商品名称" min-width="180" show-overflow-tooltip />
          <el-table-column label="时长" width="100" align="center">
            <template #default="{ row }">{{ formatDuration(row.duration) }}</template>
          </el-table-column>
          <el-table-column label="金额" width="120" align="right">
            <template #default="{ row }">
              <span class="amount">{{ formatMoney(row.amount || row.totalAmount || 0) }}</span>
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
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button
                  v-if="row.status === 'pending'"
                  class="btn-gold"
                  size="small"
                  @click="openPayDialog(row)"
                >
                  立即支付
                </el-button>
                <el-button
                  v-if="row.status === 'pending'"
                  size="small"
                  @click="onCancel(row)"
                >
                  取消订单
                </el-button>
                <el-button
                  v-if="row.status !== 'pending'"
                  link
                  type="primary"
                  @click="goDetail(row)"
                >
                  查看详情
                </el-button>
              </div>
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

    <!-- 支付弹窗 -->
    <el-dialog
      v-model="payDialog.visible"
      title="订单支付"
      width="460px"
      :close-on-click-modal="false"
    >
      <div class="pay-dialog-body">
        <div class="pay-summary">
          <div class="pay-summary-row">
            <span class="label">订单号</span>
            <span class="value font-mono">{{ payDialog.orderNo }}</span>
          </div>
          <div class="pay-summary-row">
            <span class="label">应付金额</span>
            <span class="value amount">{{ formatMoney(payDialog.amount) }}</span>
          </div>
        </div>

        <div class="pay-method-title">请选择支付方式</div>
        <el-radio-group v-model="payDialog.method" class="pay-method-group">
          <el-radio value="balance" border class="pay-method-item">
            <div class="method-content">
              <el-icon class="method-icon"><Wallet /></el-icon>
              <div class="method-text">
                <div class="method-name">余额支付</div>
                <div class="method-desc">使用账户余额即时抵扣</div>
              </div>
            </div>
          </el-radio>
          <el-radio value="epay" border class="pay-method-item">
            <div class="method-content">
              <el-icon class="method-icon"><CreditCard /></el-icon>
              <div class="method-text">
                <div class="method-name">易支付</div>
                <div class="method-desc">跳转第三方支付页面</div>
              </div>
            </div>
          </el-radio>
        </el-radio-group>
      </div>

      <template #footer>
        <el-button @click="payDialog.visible = false">取消</el-button>
        <el-button class="btn-gold" :loading="payDialog.loading" @click="confirmPay">
          确认支付
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.orders-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页头 ============
.page-head {
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

  // 去掉斑马纹背景
  .el-table__body tr.el-table__row--striped td {
    background: transparent;
  }

  // 单元格底部虚线
  .el-table__cell {
    border-bottom: 1px dashed var(--border-base) !important;
  }

  // 表头：底部实线 + eyebrow 风格
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

  // 行 hover
  .el-table__body tr:hover > td {
    background: var(--bg-hover) !important;
  }
}

.order-no {
  color: var(--text-gold);
  cursor: pointer;
  font-size: 13px;

  &:hover {
    text-decoration: underline;
  }
}

.amount {
  font-weight: 600;
  color: var(--text-gold);
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
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

.row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

// 分页居中
.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 8px 8px;
}

// ============ 支付弹窗 ============
.pay-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pay-summary {
  background: var(--bg-subtle);
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pay-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .label {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .value {
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 500;

    &.amount {
      font-size: 20px;
      color: var(--text-gold);
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }
  }
}

.pay-method-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.pay-method-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.pay-method-item {
  width: 100%;
  margin-right: 0 !important;
  height: auto !important;
  padding: 14px 16px !important;
  border-radius: 8px !important;

  :deep(.el-radio__label) {
    width: 100%;
  }
}

.method-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.method-icon {
  font-size: 24px;
  color: var(--text-gold);
}

.method-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.method-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

// ============ 响应式 ============
@include tablet-down {
  .orders-page {
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

// 手机端：筛选纵向堆叠 + 分页居中
@include mobile {
  .orders-page {
    gap: 12px;
  }
  .page-title {
    font-size: 20px;
  }
  .filter-bar {
    padding: 12px;
  }
  .filter-row {
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
  .row-actions {
    gap: 4px;
  }
  .pagination-wrap {
    padding: 10px 4px 4px;
  }
}
</style>
