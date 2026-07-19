<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { orderApi } from '@/api/order';
import { userProductApi } from '@/api/user-product';
import { ticketApi } from '@/api/ticket';

const router = useRouter();
const auth = useAuthStore();

// 加载状态
const loading = ref(false);

// 统计数据
const stats = ref({
  orderTotal: 0,
  productRunning: 0,
  ticketPending: 0,
  balance: 0,
});

// 运行中产品列表
const runningProducts = ref<any[]>([]);
// 最近订单列表
const recentOrders = ref<any[]>([]);

// 当前用户信息
const user = computed(() => auth.user);

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

// 状态映射
const statusMap: Record<string, { text: string; type: string }> = {
  pending: { text: '待支付', type: 'warning' },
  paid: { text: '已支付', type: 'success' },
  cancelled: { text: '已取消', type: 'info' },
  refunded: { text: '已退款', type: 'danger' },
};

const productStateMap: Record<string, { text: string; type: string }> = {
  running: { text: '运行中', type: 'success' },
  expired: { text: '已到期', type: 'danger' },
  paused: { text: '已暂停', type: 'warning' },
  pending: { text: '开通中', type: 'info' },
};

// 加载概览数据
async function loadOverview() {
  loading.value = true;
  try {
    // 并行请求所有数据
    const [ordersRes, productsRes, ticketsRes] = await Promise.all([
      orderApi.list({ page: 1, pageSize: 5 }),
      userProductApi.list({ state: 'running', page: 1, pageSize: 5 }),
      ticketApi.list({ status: 'open', page: 1, pageSize: 1 }),
    ]);

    recentOrders.value = ordersRes.data?.list || ordersRes.data?.items || [];
    runningProducts.value = productsRes.data?.list || productsRes.data?.items || [];

    // 统计数字
    stats.value.orderTotal = ordersRes.data?.total || 0;
    stats.value.productRunning = productsRes.data?.total || 0;
    stats.value.ticketPending = ticketsRes.data?.total || 0;
    stats.value.balance = user.value?.balance || 0;
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false;
  }
}

// 快捷操作
function goRecharge() {
  router.push('/dashboard/finance');
}

function goBuyProduct() {
  router.push('/products');
}

function goNewTicket() {
  router.push('/dashboard/tickets/new');
}

function goProfile() {
  router.push('/dashboard/profile');
}

function goOrders() {
  router.push('/dashboard/orders');
}

function goProducts() {
  router.push('/dashboard/products');
}

function goTickets() {
  router.push('/dashboard/tickets');
}

function goProductDetail(id: number) {
  router.push(`/dashboard/products/${id}`);
}

function goOrderDetail(id: number) {
  router.push(`/dashboard/orders/${id}`);
}

onMounted(async () => {
  // 若用户信息未加载则先加载
  if (!auth.user) {
    await auth.fetchProfile();
  }
  await loadOverview();
});
</script>

<template>
  <div class="dashboard-home" v-loading="loading">
    <!-- 页面头 -->
    <header class="page-head reveal" style="--reveal-i: 0">
      <span class="eyebrow">DASHBOARD</span>
      <h1 class="page-title font-display">
        欢迎回来，{{ user?.nickname || '尊贵用户' }}
      </h1>
      <p class="page-subtitle">管理您的云服务与订单</p>
    </header>

    <!-- 统计卡片 -->
    <section class="stats-grid">
      <div class="stat-card card card-hover reveal" style="--reveal-i: 1" @click="goOrders">
        <el-icon class="stat-icon"><List /></el-icon>
        <div class="stat-info">
          <div class="stat-label eyebrow">订单总数</div>
          <div class="stat-value font-display">{{ stats.orderTotal }}</div>
        </div>
      </div>

      <div class="stat-card card card-hover reveal" style="--reveal-i: 2" @click="goProducts">
        <el-icon class="stat-icon"><Monitor /></el-icon>
        <div class="stat-info">
          <div class="stat-label eyebrow">运行中产品</div>
          <div class="stat-value font-display">{{ stats.productRunning }}</div>
        </div>
      </div>

      <div class="stat-card card card-hover reveal" style="--reveal-i: 3" @click="goTickets">
        <el-icon class="stat-icon"><ChatLineSquare /></el-icon>
        <div class="stat-info">
          <div class="stat-label eyebrow">待处理工单</div>
          <div class="stat-value font-display">{{ stats.ticketPending }}</div>
        </div>
      </div>

      <div class="stat-card card card-hover reveal" style="--reveal-i: 4" @click="goRecharge">
        <el-icon class="stat-icon"><Coin /></el-icon>
        <div class="stat-info">
          <div class="stat-label eyebrow">账户余额</div>
          <div class="stat-value font-display">{{ formatMoney(stats.balance) }}</div>
        </div>
      </div>
    </section>

    <!-- 快捷操作 -->
    <section class="quick-grid">
      <div class="quick-card card card-hover reveal" style="--reveal-i: 1" @click="goRecharge">
        <el-icon class="quick-icon"><Wallet /></el-icon>
        <div class="quick-title">账户充值</div>
        <div class="quick-desc">为账户余额充值以购买服务</div>
      </div>
      <div class="quick-card card card-hover reveal" style="--reveal-i: 2" @click="goBuyProduct">
        <el-icon class="quick-icon"><ShoppingCart /></el-icon>
        <div class="quick-title">购买产品</div>
        <div class="quick-desc">浏览可购买的服务器产品</div>
      </div>
      <div class="quick-card card card-hover reveal" style="--reveal-i: 3" @click="goNewTicket">
        <el-icon class="quick-icon"><EditPen /></el-icon>
        <div class="quick-title">提交工单</div>
        <div class="quick-desc">遇到问题随时联系客服</div>
      </div>
      <div class="quick-card card card-hover reveal" style="--reveal-i: 4" @click="goProfile">
        <el-icon class="quick-icon"><Setting /></el-icon>
        <div class="quick-title">账号设置</div>
        <div class="quick-desc">修改资料、密码与安全设置</div>
      </div>
    </section>

    <!-- 列表区 -->
    <section class="list-grid">
      <!-- 最近订单 -->
      <div class="list-card card">
        <div class="list-header">
          <h2 class="list-title">最近订单</h2>
          <span class="list-link" @click="goOrders">查看全部 →</span>
        </div>
        <div class="list-body">
          <el-empty v-if="!recentOrders.length" description="暂无订单" :image-size="64" />
          <div v-else class="row-list">
            <div
              v-for="item in recentOrders"
              :key="item.id"
              class="row-item"
              @click="goOrderDetail(item.id)"
            >
              <div class="row-main">
                <div class="row-no font-mono">{{ item.orderNo || `#${item.id}` }}</div>
                <div class="row-sub">
                  <span class="row-product">{{ item.productName || '商品' }}</span>
                  <span class="row-time">{{ formatTime(item.createdAt) }}</span>
                </div>
              </div>
              <div class="row-side">
                <div class="row-amount">{{ formatMoney(item.amount || item.totalAmount || 0) }}</div>
                <span
                  class="status-text"
                  :class="`is-${statusMap[item.status]?.type || 'info'}`"
                >
                  {{ statusMap[item.status]?.text || item.status || '未知' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 我的产品 -->
      <div class="list-card card">
        <div class="list-header">
          <h2 class="list-title">运行中产品</h2>
          <span class="list-link" @click="goProducts">查看全部 →</span>
        </div>
        <div class="list-body">
          <el-empty v-if="!runningProducts.length" description="暂无运行中产品" :image-size="64" />
          <div v-else class="row-list">
            <div
              v-for="item in runningProducts"
              :key="item.id"
              class="row-item"
              @click="goProductDetail(item.id)"
            >
              <div class="row-main">
                <div class="row-name">{{ item.name || item.productName || '未命名产品' }}</div>
                <div class="row-sub">
                  <span class="row-time">到期：{{ formatTime(item.expireAt) }}</span>
                </div>
              </div>
              <div class="row-side">
                <span
                  class="status-text"
                  :class="`is-${productStateMap[item.state]?.type || 'info'}`"
                >
                  {{ productStateMap[item.state]?.text || item.state || '未知' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

// ============ staggered reveal 关键帧 ============
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.reveal {
  opacity: 0;
  animation: fadeUp 0.6s var(--ease-out-expo) forwards;
  animation-delay: calc(var(--reveal-i, 0) * 0.08s + 0.05s);
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    animation: none;
    opacity: 1;
  }
}

.dashboard-home {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页面头 ============
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
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.15;
  letter-spacing: -0.3px;
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

// ============ 统计卡片 ============
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  cursor: pointer;
}

// 统计图标：纯图标 + 金色，无背景圆
.stat-icon {
  font-size: 22px;
  color: var(--text-gold);
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.5px;
}

// ============ 快捷操作 ============
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.quick-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 20px;
  cursor: pointer;
}

.quick-icon {
  font-size: 22px;
  color: var(--text-gold);
  margin-bottom: 12px;
}

.quick-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.quick-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

// ============ 列表网格 ============
.list-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.list-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-base);
}

.list-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.list-link {
  font-size: 13px;
  color: var(--text-gold);
  cursor: pointer;
  transition: opacity 0.2s var(--ease-out-expo);

  &:hover {
    opacity: 0.7;
  }
}

.list-body {
  padding: 4px 12px 8px;
  flex: 1;
}

// 行列表（虚线分隔）
.row-list {
  display: flex;
  flex-direction: column;
}

.row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 8px;
  cursor: pointer;
  border-bottom: 1px dashed var(--border-base);
  transition: background 0.2s var(--ease-out-expo);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--bg-hover);
  }
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-no {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.row-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.row-product {
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.row-amount {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-gold);
  font-family: 'JetBrains Mono', monospace;
}

// ============ 状态文字（纯文字 + 颜色，无背景）============
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger { color: var(--danger); }
  &.is-info { color: var(--text-tertiary); }
}

// ============ 响应式 ============
// 平板及以下：统计与快捷变 2 列，列表单栏
@include tablet-down {
  .dashboard-home {
    gap: 16px;
  }
  .page-title {
    font-size: 24px;
  }
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .list-grid {
    grid-template-columns: 1fr;
  }
  .stat-card {
    padding: 16px;
    gap: 12px;
  }
  .stat-value {
    font-size: 24px;
  }
  .stat-icon,
  .quick-icon {
    font-size: 20px;
  }
  .quick-card {
    padding: 16px;
  }
  .list-header {
    padding: 14px 16px;
  }
}

// 手机端：单列堆叠
@include mobile {
  .dashboard-home {
    gap: 12px;
  }
  .page-title {
    font-size: 22px;
  }
  .page-subtitle {
    font-size: 12px;
  }
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .stat-card {
    padding: 14px;
    gap: 12px;
  }
  .stat-value {
    font-size: 22px;
  }
  .quick-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .quick-card {
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 14px;
  }
  .quick-icon {
    margin-bottom: 0;
    font-size: 20px;
  }
  .quick-title {
    font-size: 14px;
    margin-bottom: 2px;
  }
  .quick-desc {
    font-size: 11px;
  }
  .list-header {
    padding: 12px 14px;
  }
  .list-body {
    padding: 2px 8px 6px;
  }
  .row-item {
    padding: 12px 6px;
  }
  .row-product {
    max-width: 120px;
  }
}

// 小屏手机横屏：统计与快捷双列
@include sm-only {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
