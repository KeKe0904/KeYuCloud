<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { orderApi } from '@/api/order';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const order = ref<any>(null);

// 支付弹窗
const payDialog = ref({
  visible: false,
  loading: false,
  method: 'balance' as 'balance' | 'epay',
});

// 订单 ID
const orderId = computed(() => Number(route.params.id));

// 状态映射
const statusMap: Record<string, { text: string; type: string }> = {
  pending: { text: '待支付', type: 'warning' },
  paid: { text: '已支付', type: 'success' },
  cancelled: { text: '已取消', type: 'info' },
  refunded: { text: '已退款', type: 'danger' },
};

// 时间线
const timeline = computed(() => {
  if (!order.value) return [];
  const items: Array<{ time: string; title: string; type: string }> = [];
  if (order.value.createdAt) {
    items.push({ time: order.value.createdAt, title: '订单创建', type: 'primary' });
  }
  if (order.value.paidAt) {
    items.push({ time: order.value.paidAt, title: '订单支付完成', type: 'success' });
  }
  if (order.value.cancelledAt) {
    items.push({ time: order.value.cancelledAt, title: '订单已取消', type: 'info' });
  }
  if (order.value.refundedAt) {
    items.push({ time: order.value.refundedAt, title: '订单已退款', type: 'danger' });
  }
  if (order.value.openedAt || order.value.provisionedAt) {
    items.push({
      time: order.value.openedAt || order.value.provisionedAt,
      title: '产品开通成功',
      type: 'success',
    });
  }
  return items;
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

// 加载订单详情
async function loadDetail() {
  if (!orderId.value) return;
  loading.value = true;
  try {
    const res = await orderApi.detail(orderId.value);
    order.value = res.data;
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false;
  }
}

// 打开支付弹窗
function openPayDialog() {
  payDialog.value.method = 'balance';
  payDialog.value.visible = true;
}

// 确认支付
async function confirmPay() {
  payDialog.value.loading = true;
  try {
    if (payDialog.value.method === 'balance') {
      await orderApi.payWithBalance(orderId.value);
      ElMessage.success('余额支付成功');
      payDialog.value.visible = false;
      await loadDetail();
    } else {
      const res = await orderApi.payWithEpay(orderId.value);
      const url = res.data?.url || res.data?.payUrl || res.data;
      if (url) {
        window.location.href = typeof url === 'string' ? url : String(url);
      } else {
        ElMessage.warning('未获取到支付链接，请稍后重试');
      }
    }
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    payDialog.value.loading = false;
  }
}

// 取消订单
async function onCancel() {
  try {
    await ElMessageBox.confirm('确定要取消此订单吗？取消后无法恢复。', '取消订单确认', { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary', 
      type: 'warning',
      confirmButtonText: '确定取消',
      cancelButtonText: '再想想',
    });
  } catch {
    return;
  }
  try {
    await orderApi.cancel(orderId.value);
    ElMessage.success('订单已取消');
    await loadDetail();
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

// 查看产品
function goProduct() {
  if (order.value?.userProductId) {
    router.push(`/dashboard/products/${order.value.userProductId}`);
  } else {
    ElMessage.info('该订单暂未关联产品');
  }
}

// 返回列表
function goBack() {
  router.push('/dashboard/orders');
}

onMounted(() => {
  loadDetail();
});
</script>

<template>
  <div class="order-detail-page" v-loading="loading">
    <!-- 页头 -->
    <header class="page-head">
      <el-button link class="back-btn" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <div class="head-meta">
        <span class="eyebrow">ORDER DETAIL</span>
        <h1 class="page-title font-display">
          订单详情
          <span class="order-no font-mono">{{ order?.orderNo || `#${order?.id}` }}</span>
        </h1>
      </div>
      <div class="head-actions" v-if="order">
        <el-button
          v-if="order.status === 'pending'"
          class="btn-gold"
          @click="openPayDialog"
        >
          立即支付
        </el-button>
        <el-button
          v-if="order.status === 'pending'"
          class="btn-outline"
          @click="onCancel"
        >
          取消订单
        </el-button>
        <el-button
          v-if="order.status === 'paid' && order.userProductId"
          class="btn-outline"
          @click="goProduct"
        >
          查看产品
        </el-button>
      </div>
    </header>

    <template v-if="order">
      <!-- 状态卡 -->
      <section class="status-card card">
        <div class="status-row">
          <span class="eyebrow">当前状态</span>
          <span
            class="status-text is-large"
            :class="`is-${statusMap[order.status]?.type || 'info'}`"
          >
            {{ statusMap[order.status]?.text || order.status || '未知' }}
          </span>
        </div>
        <div class="status-extra">
          <span class="extra-label">创建时间</span>
          <span class="extra-value">{{ formatTime(order.createdAt) }}</span>
        </div>
      </section>

      <!-- 订单信息 -->
      <section class="detail-card card">
        <div class="card-header">
          <h2 class="card-title">订单信息</h2>
        </div>
        <div class="card-body">
          <el-descriptions :column="3" class="dashed-desc">
            <el-descriptions-item label="订单号">
              <span class="mono-value">{{ order.orderNo || `#${order.id}` }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatTime(order.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="支付时间">
              {{ formatTime(order.paidAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="取消时间">
              {{ formatTime(order.cancelledAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="退款时间">
              {{ formatTime(order.refundedAt) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </section>

      <!-- 商品信息 -->
      <section class="detail-card card">
        <div class="card-header">
          <h2 class="card-title">商品信息</h2>
        </div>
        <div class="card-body">
          <el-descriptions :column="3" class="dashed-desc">
            <el-descriptions-item label="商品名称">
              {{ order.productName || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="规格">
              {{ order.spec || order.specName || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="时长">
              {{ formatDuration(order.duration) }}
            </el-descriptions-item>
            <el-descriptions-item label="单价">
              {{ formatMoney(order.unitPrice || 0) }}
            </el-descriptions-item>
            <el-descriptions-item label="数量">
              {{ order.quantity || 1 }}
            </el-descriptions-item>
            <el-descriptions-item label="区域">
              {{ order.zoneName || order.zone || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </section>

      <!-- 金额明细 -->
      <section class="detail-card card">
        <div class="card-header">
          <h2 class="card-title">金额明细</h2>
        </div>
        <div class="card-body amount-detail">
          <div class="amount-row">
            <span class="amount-label">商品金额</span>
            <span class="amount-value font-mono">{{ formatMoney(order.originalAmount || order.amount || 0) }}</span>
          </div>
          <div class="amount-row">
            <span class="amount-label">优惠金额</span>
            <span class="amount-value discount font-mono">- {{ formatMoney(order.discountAmount || 0) }}</span>
          </div>
          <div class="divider-gold"></div>
          <div class="amount-row total">
            <span class="amount-label">实付金额</span>
            <span class="amount-value total-value font-display">{{ formatMoney(order.amount || order.totalAmount || 0) }}</span>
          </div>
        </div>
      </section>

      <!-- 时间线 -->
      <section class="detail-card card" v-if="timeline.length">
        <div class="card-header">
          <h2 class="card-title">状态变更</h2>
        </div>
        <div class="card-body">
          <el-timeline>
            <el-timeline-item
              v-for="(item, idx) in timeline"
              :key="idx"
              :type="(item.type as any)"
              :timestamp="formatTime(item.time)"
              placement="top"
            >
              {{ item.title }}
            </el-timeline-item>
          </el-timeline>
        </div>
      </section>
    </template>

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
            <span class="value font-mono">{{ order?.orderNo || `#${order?.id}` }}</span>
          </div>
          <div class="pay-summary-row">
            <span class="label">应付金额</span>
            <span class="value amount">{{ formatMoney(order?.amount || order?.totalAmount || 0) }}</span>
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

.order-detail-page {
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

.back-btn {
  color: var(--text-tertiary);
  padding: 0;
  font-size: 13px;

  &:hover {
    color: var(--text-gold);
  }
}

.head-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
  letter-spacing: -0.3px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.order-no {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-gold);
}

.head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

// ============ 状态卡 ============
.status-card {
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-text {
  font-size: 13px;
  font-weight: 500;

  &.is-large {
    font-size: 16px;
    font-weight: 600;
  }

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger { color: var(--danger); }
  &.is-info { color: var(--text-tertiary); }
}

.status-extra {
  display: flex;
  align-items: center;
  gap: 8px;
}

.extra-label {
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.extra-value {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
}

// ============ 详情卡 ============
.detail-card {
  overflow: hidden;
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-base);
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-body {
  padding: 20px;
}

.mono-value {
  color: var(--text-gold);
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
}

// 虚线分隔的 descriptions
:deep(.dashed-desc) {
  .el-descriptions__body {
    background: transparent;
  }
  .el-descriptions__table {
    table-layout: fixed;
  }
  // 表头 label：eyebrow 风格
  .el-descriptions__label {
    background: transparent !important;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text-tertiary) !important;
  }
  .el-descriptions__content {
    font-size: 14px;
    color: var(--text-primary);
  }
  // 去掉默认边框，改用虚线
  .el-descriptions__table td,
  .el-descriptions__table th {
    border: none !important;
    border-bottom: 1px dashed var(--border-base) !important;
  }
  // 去掉 label 列右边的竖线
  .el-descriptions__table tr td:first-child,
  .el-descriptions__table tr th:first-child {
    border-right: 1px dashed var(--border-base) !important;
  }
}

// ============ 金额明细 ============
.amount-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 480px;
  margin-left: auto;
}

.amount-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.amount-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.amount-value {
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;

  &.discount {
    color: var(--success);
  }

  &.total-value {
    font-size: 24px;
    color: var(--text-gold);
    font-weight: 600;
    letter-spacing: -0.5px;
  }
}

.amount-row.total {
  .amount-label {
    font-size: 15px;
    color: var(--text-primary);
    font-weight: 600;
  }
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
  .order-detail-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .card-header {
    padding: 14px 16px;
  }
  .card-body {
    padding: 16px;
  }
  :deep(.dashed-desc) .el-descriptions__table {
    table-layout: fixed;
  }
}

// 手机端：单列描述 + 紧凑布局
@include mobile {
  .order-detail-page {
    gap: 12px;
  }
  .page-title {
    font-size: 19px;
  }
  .page-head {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .head-actions {
    flex-wrap: wrap;
    .el-button {
      flex: 1;
      min-width: 0;
    }
  }
  .status-card {
    padding: 14px 16px;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .card-header {
    padding: 12px 14px;
  }
  .card-title {
    font-size: 15px;
  }
  .card-body {
    padding: 12px;
  }
  // 描述列表单列堆叠
  :deep(.dashed-desc) {
    .el-descriptions__table {
      display: block;
      tbody {
        display: block;
      }
      tr {
        display: flex;
        flex-direction: column;
        width: 100% !important;
        padding-bottom: 8px;
      }
      td {
        display: block;
        width: 100% !important;
        border-right: none !important;
      }
      .el-descriptions__label {
        width: 100% !important;
        min-width: 0 !important;
        padding: 8px 12px 2px !important;
      }
      .el-descriptions__content {
        padding: 0 12px 8px !important;
      }
    }
  }

  // 金额明细
  .amount-detail {
    max-width: 100%;
    gap: 12px;
  }
  .amount-value.total-value {
    font-size: 22px;
  }

  // 支付弹窗
  .pay-summary {
    padding: 12px 14px;
  }
  .pay-method-item {
    padding: 12px 14px !important;
  }
}
</style>
