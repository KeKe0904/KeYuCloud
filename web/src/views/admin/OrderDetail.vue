<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

const route = useRoute();
const router = useRouter();

const orderId = computed(() => Number(route.params.id));
const loading = ref(false);

const order = ref<any>({});
const user = ref<any>({});
const product = ref<any>({});
const logs = ref<any[]>([]);

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

// 状态
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
    balance: '余额', alipay: '支付宝', wechat: '微信',
    stripe: 'Stripe', paypal: 'PayPal', manual: '人工',
  };
  return map[m] || m || '-';
};

const logTypeLabel = (t: string) => {
  const map: Record<string, string> = {
    create: '创建', pay: '支付', open: '开通', refund: '退款',
    retry: '重试', close: '关闭', cancel: '取消',
  };
  return map[t] || t;
};

// 加载详情
const loadDetail = async () => {
  if (!orderId.value) return;
  loading.value = true;
  try {
    const res: any = await adminApi.orderDetail(orderId.value);
    if (res?.success) {
      const d = res.data || {};
      order.value = d.order || d;
      user.value = d.user || order.value.user || {};
      product.value = d.product || order.value.product || {};
      logs.value = d.logs ?? d.operationLogs ?? order.value.logs ?? [];
    }
  } catch {} finally {
    loading.value = false;
  }
};

// 退款
const refundDialog = reactive({ visible: false, loading: false, reason: '' });
const openRefund = () => {
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
    const res: any = await adminApi.refundOrder(orderId.value, refundDialog.reason.trim());
    if (res?.success) {
      ElMessage.success('退款已发起');
      refundDialog.visible = false;
      loadDetail();
    }
  } catch {} finally {
    refundDialog.loading = false;
  }
};

// 重试开通
const onRetryOpen = () => {
  ElMessageBox.confirm('确认要重试开通此订单吗？', '重试开通', { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning' })
    .then(async () => {
      try {
        const res: any = await adminApi.retryOpen(orderId.value);
        if (res?.success) {
          ElMessage.success('已触发重试开通');
          loadDetail();
        }
      } catch {}
    })
    .catch(() => {});
};

const goBack = () => router.push('/admin/orders');
const goUser = (id: number) => router.push(`/admin/users/${id}`);

onMounted(() => loadDetail());
</script>

<template>
  <div v-loading="loading" class="order-detail">
    <!-- 顶部 -->
    <div class="page-header">
      <div class="header-left">
        <el-button :icon="'ArrowLeft'" @click="goBack">返回</el-button>
        <div class="header-title">
          <span class="eyebrow">ORDER DETAIL</span>
          <h2 class="page-title font-display">
            <span class="order-no font-mono">{{ order.orderNo || `#${orderId}` }}</span>
          </h2>
          <span v-if="order.status" class="status-text" :class="`is-${statusTag(order.status)}`">
            {{ statusLabel(order.status) }}
          </span>
        </div>
      </div>
      <div class="header-right">
        <el-button
          v-if="['paid', 'completed'].includes(order.status)"
          type="danger" :icon="'RefreshLeft'"
          @click="openRefund"
        >退款</el-button>
        <el-button
          v-if="['paid', 'failed', 'opening'].includes(order.status)"
          type="warning" :icon="'RefreshRight'"
          @click="onRetryOpen"
        >重试开通</el-button>
      </div>
    </div>

    <div class="detail-grid">
      <!-- 左列 -->
      <div class="detail-left">
        <!-- 订单基本信息 -->
        <div class="card section-card">
          <div class="card-head">
            <span class="card-title">订单基本信息</span>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label eyebrow">订单号</span>
              <span class="info-value font-mono">{{ order.orderNo || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label eyebrow">订单状态</span>
              <span v-if="order.status" class="status-text" :class="`is-${statusTag(order.status)}`">
                {{ statusLabel(order.status) }}
              </span>
              <span v-else>-</span>
            </div>
            <div class="info-item">
              <span class="info-label eyebrow">支付方式</span>
              <span class="info-value">{{ payMethodLabel(order.payMethod) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label eyebrow">创建时间</span>
              <span class="info-value">{{ formatDate(order.createdAt) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label eyebrow">支付时间</span>
              <span class="info-value">{{ formatDate(order.paidAt) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label eyebrow">完成时间</span>
              <span class="info-value">{{ formatDate(order.completedAt) }}</span>
            </div>
            <div class="info-item" v-if="order.upstreamOrderNo">
              <span class="info-label eyebrow">上游订单号</span>
              <span class="info-value font-mono">{{ order.upstreamOrderNo }}</span>
            </div>
            <div class="info-item" v-if="order.couponCode">
              <span class="info-label eyebrow">优惠券</span>
              <span class="info-value">{{ order.couponCode }}</span>
            </div>
          </div>
        </div>

        <!-- 金额明细 -->
        <div class="card section-card">
          <div class="card-head">
            <span class="card-title">金额明细</span>
          </div>
          <div class="amount-list">
            <div class="amount-row">
              <span>商品原价</span>
              <span class="money">{{ formatMoney(order.originalAmount) }}</span>
            </div>
            <div class="amount-row" v-if="Number(order.discountAmount) > 0">
              <span>优惠金额</span>
              <span class="money discount">- {{ formatMoney(order.discountAmount) }}</span>
            </div>
            <div class="amount-row" v-if="Number(order.taxAmount) > 0">
              <span>税费</span>
              <span class="money">+ {{ formatMoney(order.taxAmount) }}</span>
            </div>
            <div class="divider-gold" />
            <div class="amount-row total">
              <span>实付金额</span>
              <span class="money total-amount">{{ formatMoney(order.amount) }}</span>
            </div>
            <div class="amount-row" v-if="Number(order.refundAmount) > 0">
              <span>已退款</span>
              <span class="money discount">{{ formatMoney(order.refundAmount) }}</span>
            </div>
          </div>
        </div>

        <!-- 操作日志/时间线 -->
        <div class="card section-card">
          <div class="card-head">
            <span class="card-title">操作日志</span>
          </div>
          <div class="timeline-wrap">
            <el-timeline v-if="logs.length">
              <el-timeline-item
                v-for="(log, idx) in logs"
                :key="idx"
                :timestamp="formatDate(log.createdAt || log.time)"
                placement="top"
                :type="log.type === 'refund' ? 'danger' : (log.type === 'pay' ? 'success' : 'primary')"
              >
                <div class="log-item">
                  <span class="log-type-tag">{{ logTypeLabel(log.type) }}</span>
                  <span class="log-content">{{ log.content || log.message || log.remark || '-' }}</span>
                </div>
                <div class="log-operator" v-if="log.operator">
                  操作人：{{ log.operator.nickname || log.operator.username || log.operatorName }}
                </div>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无操作日志" :image-size="80" />
          </div>
        </div>
      </div>

      <!-- 右列 -->
      <div class="detail-right">
        <!-- 用户信息 -->
        <div class="card section-card">
          <div class="card-head">
            <span class="card-title">用户信息</span>
          </div>
          <div class="user-block">
            <el-avatar :size="56" class="user-avatar">
              {{ (user.nickname || user.username || '?').charAt(0).toUpperCase() }}
            </el-avatar>
            <div class="user-info">
              <div class="user-name">{{ user.nickname || user.username || '-' }}</div>
              <div class="user-phone">{{ user.phone || '-' }}</div>
              <el-button
                v-if="user.id"
                link type="primary" size="small"
                @click="goUser(user.id)"
              >查看用户 →</el-button>
            </div>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label eyebrow">用户 ID</span>
              <span class="info-value">{{ user.id || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label eyebrow">邮箱</span>
              <span class="info-value">{{ user.email || '-' }}</span>
            </div>
          </div>
        </div>

        <!-- 商品信息 -->
        <div class="card section-card">
          <div class="card-head">
            <span class="card-title">商品信息</span>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label eyebrow">商品名称</span>
              <span class="info-value">{{ product.name || order.productName || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label eyebrow">商品分类</span>
              <span class="info-value">{{ product.category || '-' }}</span>
            </div>
            <div class="info-item" v-if="order.spec">
              <span class="info-label eyebrow">购买规格</span>
              <span class="info-value">
                {{ typeof order.spec === 'object' ? JSON.stringify(order.spec) : order.spec }}
              </span>
            </div>
            <div class="info-item" v-if="order.cycle">
              <span class="info-label eyebrow">购买周期</span>
              <span class="info-value">{{ order.cycle }}</span>
            </div>
            <div class="info-item" v-if="order.quantity">
              <span class="info-label eyebrow">数量</span>
              <span class="info-value">{{ order.quantity }}</span>
            </div>
            <div class="info-item" v-if="product.upstreamProductId">
              <span class="info-label eyebrow">上游商品 ID</span>
              <span class="info-value font-mono">{{ product.upstreamProductId }}</span>
            </div>
          </div>
          <div class="product-desc" v-if="product.description">
            {{ product.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- 退款弹窗 -->
    <el-dialog v-model="refundDialog.visible" title="订单退款" width="460px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="订单号">
          <span class="money">{{ order.orderNo }}</span>
        </el-form-item>
        <el-form-item label="退款金额">
          <span class="money">{{ formatMoney(order.amount) }}</span>
        </el-form-item>
        <el-form-item label="退款原因" required>
          <el-input
            v-model="refundDialog.reason"
            type="textarea"
            :rows="4"
            placeholder="请详细说明退款原因"
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
.order-detail {
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

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .header-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-right {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .page-title {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    letter-spacing: -0.2px;
    display: flex;
    align-items: baseline;
    gap: 10px;

    .order-no {
      font-size: 16px;
      color: var(--text-secondary);
      font-weight: 500;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      letter-spacing: 0;
    }
  }

  @include mobile {
    .page-title { font-size: 20px; }
    .page-title .order-no { font-size: 13px; }
  }
}

// ============ 详情栅格 ============
.detail-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  align-items: start;
}

.detail-left, .detail-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// ============ 卡片头 ============
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-base);

  .card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.2px;
  }
}

// ============ 信息字段 ============
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .info-value {
    font-size: 14px;
    color: var(--text-primary);
    word-break: break-all;
    line-height: 1.5;
  }
}

// ============ 金额明细 ============
.money {
  color: var(--text-gold);
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  &.discount { color: var(--danger); }
}

.amount-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
}

.amount-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: var(--text-secondary);

  &.total {
    font-size: 15px;
    color: var(--text-primary);
    font-weight: 600;
  }

  .total-amount {
    font-size: 22px;
    font-weight: 600;
    font-family: 'Fraunces', 'Source Han Serif SC', 'Noto Serif SC', serif;
    letter-spacing: -0.2px;
    line-height: 1.2;
  }
}

.divider-gold {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold-300) 20%, var(--gold-400) 50%, var(--gold-300) 80%, transparent);
  margin: 4px 0;
}

// ============ 状态纯文字 ============
.status-text {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--text-gold); }
  &.is-danger { color: var(--danger); }
  &.is-primary { color: var(--text-gold); }
  &.is-info { color: var(--text-tertiary); }
}

// ============ 操作日志时间线 ============
.timeline-wrap {
  padding: 20px;

  :deep(.el-timeline) {
    padding-left: 14px;
  }

  :deep(.el-timeline-item__timestamp) {
    font-size: 11px;
    color: var(--text-tertiary);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    letter-spacing: 0.5px;
  }
}

.log-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  flex-wrap: wrap;

  .log-content { color: var(--text-secondary); }
}

.log-type-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-gold);
  border: 1px solid var(--gold-300);
  border-radius: 3px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  line-height: 1.6;
}

.log-operator {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

// ============ 用户信息块 ============
.user-block {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px dashed var(--border-base);
}

.user-avatar {
  background: var(--gradient-gold);
  color: var(--text-inverse);
  font-size: 22px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .user-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .user-phone {
    font-size: 12px;
    color: var(--text-tertiary);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }
}

// ============ 商品描述 ============
.product-desc {
  margin: 0 20px 20px;
  padding: 12px 16px;
  background: var(--bg-subtle);
  border-left: 2px solid var(--gold-300);
  border-radius: 0 4px 4px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

// ============ 工具类 ============
.font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
}

// ============ 响应式 ============
@media (max-width: 992px) {
  .detail-grid { grid-template-columns: 1fr; }
}

// 平板：操作按钮允许换行
@include tablet {
  .page-header .header-right { flex-wrap: wrap; }
}

// 手机：信息字段单列，用户信息块堆叠，标题缩小
@include mobile {
  .order-detail { gap: 12px; }
  .page-header {
    flex-direction: column;
    align-items: stretch;
    .header-left { flex-wrap: wrap; }
    .header-right {
      flex-wrap: wrap;
      .el-button { flex: 1; min-width: 0; }
    }
    .page-title { font-size: 18px; }
    .page-title .order-no { font-size: 12px; }
  }
  .card-head { padding: 12px 14px; }
  .info-grid {
    grid-template-columns: 1fr;
    padding: 14px;
    gap: 12px;
  }
  .amount-list { padding: 14px; }
  .timeline-wrap { padding: 14px; }
  .user-block {
    flex-direction: column;
    text-align: center;
    gap: 8px;
    padding: 16px 14px;
  }
  .product-desc {
    margin: 0 14px 14px;
    padding: 10px 12px;
  }
  .amount-row.total { font-size: 14px; }
  .amount-row .total-amount { font-size: 18px; }
}
</style>
