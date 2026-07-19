<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { adminApi } from '@/api/admin';
import { useThemeStore } from '@/stores/theme';

echarts.use([
  LineChart,
  BarChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer,
]);

const router = useRouter();
const theme = useThemeStore();

const loading = ref(false);
const dashboardData = ref<any>({});

// 图表实例
let revenueChart: echarts.ECharts | null = null;
let userChart: echarts.ECharts | null = null;
const revenueChartRef = ref<HTMLDivElement>();
const userChartRef = ref<HTMLDivElement>();

// 金额格式化
const formatMoney = (v: any): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '¥0.00';
  return '¥' + Number(v).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// 日期格式化
const formatDate = (v: any): string => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
};

const formatDateShort = (v: any): string => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 统计卡数据（带兜底）
const stats = ref({
  newUsersToday: 0,
  newUsersTrend: 0,
  ordersToday: 0,
  ordersTrend: 0,
  revenueToday: 0,
  revenueTrend: 0,
  activeProducts: 0,
});

// 待办
const todos = ref({
  pendingTickets: 0,
  pendingOrders: 0,
  lowStockProducts: 0,
});

// 最近订单与用户
const recentOrders = ref<any[]>([]);
const recentUsers = ref<any[]>([]);

// 营收与用户增长趋势数据
const revenueTrend = ref<{ date: string; amount: number }[]>([]);
const userTrend = ref<{ date: string; count: number }[]>([]);

// 状态色
const statusTagType = (status: string) => {
  const map: Record<string, string> = {
    paid: 'success',
    pending: 'warning',
    refunded: 'info',
    failed: 'danger',
  };
  return map[status] || 'info';
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: '待支付',
    paid: '已支付',
    opening: '开通中',
    completed: '已完成',
    refunded: '已退款',
    failed: '失败',
    cancelled: '已取消',
  };
  return map[status] || status;
};

const userStatusTag = (status: string) => {
  const map: Record<string, string> = {
    active: 'success',
    disabled: 'danger',
    banned: 'danger',
  };
  return map[status] || 'info';
};

const userStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    active: '正常',
    disabled: '禁用',
    banned: '封禁',
  };
  return map[status] || status;
};

// 加载仪表盘数据
const loadDashboard = async () => {
  loading.value = true;
  try {
    const res: any = await adminApi.dashboard();
    if (res?.success) {
      const d = res.data || {};
      dashboardData.value = d;
      stats.value = {
        newUsersToday: d.newUsersToday ?? d.newUsers ?? 0,
        newUsersTrend: d.newUsersTrend ?? 0,
        ordersToday: d.ordersToday ?? 0,
        ordersTrend: d.ordersTrend ?? 0,
        revenueToday: d.revenueToday ?? 0,
        revenueTrend: d.revenueTrend ?? 0,
        activeProducts: d.activeProducts ?? 0,
      };
      todos.value = {
        pendingTickets: d.pendingTickets ?? 0,
        pendingOrders: d.pendingOrders ?? 0,
        lowStockProducts: d.lowStockProducts ?? 0,
      };
      recentOrders.value = d.recentOrders ?? [];
      recentUsers.value = d.recentUsers ?? [];
      revenueTrend.value = d.revenueTrend ?? d.revenue7d ?? [];
      userTrend.value = d.userTrend ?? d.userGrowth7d ?? [];

      await nextTick();
      renderCharts();
    }
  } catch (e) {
    // 错误已由拦截器处理
  } finally {
    loading.value = false;
  }
};

// 趋势图标
const trendIcon = (t: number) => (t >= 0 ? 'Top' : 'Bottom');
const trendClass = (t: number) => (t >= 0 ? 'up' : 'down');
const trendText = (t: number) => `${t >= 0 ? '+' : ''}${Number(t || 0).toFixed(1)}%`;

// 渲染图表
const renderCharts = () => {
  renderRevenueChart();
  renderUserChart();
};

const renderRevenueChart = () => {
  if (!revenueChartRef.value) return;
  if (!revenueChart) revenueChart = echarts.init(revenueChartRef.value);
  const data = revenueTrend.value;
  const isDark = theme.isDark;
  const axisColor = isDark ? '#a89c84' : '#7a6f5d';
  const splitColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(20,18,14,0.04)';
  revenueChart.setOption({
    tooltip: { trigger: 'axis', valueFormatter: (v: any) => formatMoney(v) },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map((i) => formatDateShort(i.date)),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: axisColor,
        fontSize: 11,
        formatter: (v: number) => (v >= 1000 ? v / 1000 + 'k' : String(v)),
      },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: '营收',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.map((i) => Number(i.amount || 0)),
        lineStyle: { color: '#b8860b', width: 2.5 },
        itemStyle: { color: '#b8860b', borderColor: isDark ? '#16161a' : '#ffffff', borderWidth: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(184,134,11,0.28)' },
            { offset: 1, color: 'rgba(184,134,11,0.02)' },
          ]),
        },
      },
    ],
  });
};

const renderUserChart = () => {
  if (!userChartRef.value) return;
  if (!userChart) userChart = echarts.init(userChartRef.value);
  const data = userTrend.value;
  const isDark = theme.isDark;
  const axisColor = isDark ? '#a89c84' : '#7a6f5d';
  const splitColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(20,18,14,0.04)';
  userChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map((i) => formatDateShort(i.date)),
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: axisColor, fontSize: 11 },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: '新增用户',
        type: 'bar',
        data: data.map((i) => Number(i.count || 0)),
        barWidth: '40%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#d4a249' },
            { offset: 1, color: '#966a0a' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  });
};

const handleResize = () => {
  revenueChart?.resize();
  userChart?.resize();
};

onMounted(async () => {
  await loadDashboard();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  revenueChart?.dispose();
  userChart?.dispose();
  revenueChart = null;
  userChart = null;
});

// 跳转
const goOrders = () => router.push('/admin/orders');
const goUsers = () => router.push('/admin/users');
const goProducts = () => router.push('/admin/products');
const goTickets = () => router.push('/admin/tickets');
const goUserDetail = (id: number) => router.push(`/admin/users/${id}`);
const goOrderDetail = (id: number) => router.push(`/admin/orders/${id}`);

const refresh = () => loadDashboard();
</script>

<template>
  <div v-loading="loading" class="admin-dashboard">
    <!-- 标题栏 -->
    <div class="page-header">
      <div class="page-header-left">
        <span class="eyebrow">ADMIN OVERVIEW</span>
        <h2 class="page-title font-display">仪表盘</h2>
        <p class="page-desc">平台核心指标与运营动向</p>
      </div>
      <button type="button" class="btn-outline refresh-btn" @click="refresh">
        <el-icon style="margin-right: 6px;"><Refresh /></el-icon>
        刷新
      </button>
    </div>

    <!-- 统计卡片 -->
    <div class="section-label">
      <span class="eyebrow">BY THE NUMBERS · 核心指标</span>
    </div>
    <div class="stat-grid">
      <div class="stat-card card card-hover reveal" style="--reveal-i: 0">
        <el-icon class="stat-icon"><User /></el-icon>
        <div class="stat-meta">
          <div class="stat-label eyebrow">今日新增用户</div>
          <div class="stat-value">{{ stats.newUsersToday }}</div>
          <div class="stat-trend" :class="trendClass(stats.newUsersTrend)">
            <el-icon><component :is="trendIcon(stats.newUsersTrend)" /></el-icon>
            <span>{{ trendText(stats.newUsersTrend) }}</span>
            <span class="trend-vs">较昨日</span>
          </div>
        </div>
      </div>

      <div class="stat-card card card-hover reveal" style="--reveal-i: 1">
        <el-icon class="stat-icon"><ShoppingCart /></el-icon>
        <div class="stat-meta">
          <div class="stat-label eyebrow">今日订单数</div>
          <div class="stat-value">{{ stats.ordersToday }}</div>
          <div class="stat-trend" :class="trendClass(stats.ordersTrend)">
            <el-icon><component :is="trendIcon(stats.ordersTrend)" /></el-icon>
            <span>{{ trendText(stats.ordersTrend) }}</span>
            <span class="trend-vs">较昨日</span>
          </div>
        </div>
      </div>

      <div class="stat-card card card-hover reveal" style="--reveal-i: 2">
        <el-icon class="stat-icon"><Wallet /></el-icon>
        <div class="stat-meta">
          <div class="stat-label eyebrow">今日营收</div>
          <div class="stat-value">{{ formatMoney(stats.revenueToday) }}</div>
          <div class="stat-trend" :class="trendClass(stats.revenueTrend)">
            <el-icon><component :is="trendIcon(stats.revenueTrend)" /></el-icon>
            <span>{{ trendText(stats.revenueTrend) }}</span>
            <span class="trend-vs">较昨日</span>
          </div>
        </div>
      </div>

      <div class="stat-card card card-hover reveal" style="--reveal-i: 3">
        <el-icon class="stat-icon"><Goods /></el-icon>
        <div class="stat-meta">
          <div class="stat-label eyebrow">活跃产品数</div>
          <div class="stat-value">{{ stats.activeProducts }}</div>
          <div class="stat-trend up">
            <el-icon><DataLine /></el-icon>
            <span>实时</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 待办事项 -->
    <div class="section-label">
      <span class="eyebrow">PENDING TASKS · 待办事项</span>
    </div>
    <div class="todo-grid">
      <div class="todo-card card card-hover" @click="goTickets">
        <div class="todo-content">
          <div class="todo-num">{{ todos.pendingTickets }}</div>
          <div class="todo-label eyebrow">待处理工单</div>
        </div>
        <el-icon class="todo-arrow"><ArrowRight /></el-icon>
      </div>
      <div class="todo-card card card-hover" @click="goOrders">
        <div class="todo-content">
          <div class="todo-num">{{ todos.pendingOrders }}</div>
          <div class="todo-label eyebrow">待开通订单</div>
        </div>
        <el-icon class="todo-arrow"><ArrowRight /></el-icon>
      </div>
      <div class="todo-card card card-hover" @click="goProducts">
        <div class="todo-content">
          <div class="todo-num">{{ todos.lowStockProducts }}</div>
          <div class="todo-label eyebrow">低库存预警</div>
        </div>
        <el-icon class="todo-arrow"><ArrowRight /></el-icon>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="section-label">
      <span class="eyebrow">TRENDS · 趋势分析</span>
    </div>
    <div class="chart-grid">
      <div class="chart-card card">
        <div class="card-header">
          <span class="card-title">营收趋势 · 最近 7 天</span>
          <span class="accent-tag">营收</span>
        </div>
        <div ref="revenueChartRef" class="chart-box" />
      </div>
      <div class="chart-card card">
        <div class="card-header">
          <span class="card-title">用户增长 · 最近 7 天</span>
          <span class="accent-tag">新增</span>
        </div>
        <div ref="userChartRef" class="chart-box" />
      </div>
    </div>

    <!-- 最近订单 & 用户 -->
    <div class="section-label">
      <span class="eyebrow">RECENT ACTIVITY · 最近动态</span>
    </div>
    <div class="recent-grid">
      <div class="recent-card card">
        <div class="card-header recent-header">
          <span class="card-title">最近订单</span>
          <el-button class="admin-btn admin-btn-md" @click="goOrders">查看全部 →</el-button>
        </div>
        <div class="table-wrap">
          <el-table :data="recentOrders" size="small" :show-header="true" class="recent-table">
            <el-table-column prop="orderNo" label="订单号" min-width="160" show-overflow-tooltip />
            <el-table-column prop="user.nickname" label="用户" min-width="100">
              <template #default="{ row }">
                {{ row.user?.nickname || row.user?.username || row.userName || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" min-width="100" align="right">
              <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" min-width="90">
              <template #default="{ row }">
                <span class="status-text" :class="`is-${statusTagType(row.status)}`">
                  {{ statusLabel(row.status) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button class="admin-btn admin-btn-sm" size="small" @click="goOrderDetail(row.id)">详情</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无数据" :image-size="60" />
            </template>
          </el-table>
        </div>
      </div>

      <div class="recent-card card">
        <div class="card-header recent-header">
          <span class="card-title">最近用户</span>
          <el-button class="admin-btn admin-btn-md" @click="goUsers">查看全部 →</el-button>
        </div>
        <div class="table-wrap">
          <el-table :data="recentUsers" size="small" class="recent-table">
            <el-table-column label="用户" min-width="160">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :size="28" class="user-avatar">
                    {{ (row.nickname || row.username || '?').charAt(0).toUpperCase() }}
                  </el-avatar>
                  <span>{{ row.nickname || row.username || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ row.phone || '-' }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <span class="status-text" :class="`is-${userStatusTag(row.status)}`">
                  {{ userStatusLabel(row.status) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button class="admin-btn admin-btn-sm" size="small" @click="goUserDetail(row.id)">详情</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无数据" :image-size="60" />
            </template>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

// ============ staggered reveal ============
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
  animation-delay: calc(var(--reveal-i, 0) * 0.1s + 0.1s);
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    animation: none;
    opacity: 1;
  }
}

.admin-dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ section-label：eyebrow 风格 ============
.section-label {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-top: 8px;
  margin-bottom: -4px;
}

// ============ 标题栏 ============
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

  .page-desc {
    margin: 0;
    font-size: 13px;
    color: var(--text-tertiary);
    letter-spacing: 0.3px;
  }

  .refresh-btn {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    font-size: 13px;
  }

  @include mobile {
    .page-title {
      font-size: 22px;
    }
    .page-desc {
      font-size: 12px;
    }
  }
}

// ============ 统计卡片 ============
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  cursor: default;
}

// 统计图标：纯图标 + 金色，无背景圆
.stat-icon {
  font-size: 22px;
  color: var(--text-gold);
  flex-shrink: 0;
}

.stat-meta {
  flex: 1;
  min-width: 0;
}

// .stat-label 复用全局 .eyebrow

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.3px;
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
  font-family: 'Fraunces', 'Source Han Serif SC', 'Noto Serif SC', serif;
}

.stat-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  margin-top: 8px;

  &.up { color: var(--success); }
  &.down { color: var(--danger); }

  .trend-vs { color: var(--text-tertiary); }
}

// ============ 待办卡 ============
.todo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.todo-card {
  cursor: pointer;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.todo-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;

  .todo-num {
    font-size: 28px;
    font-weight: 600;
    color: var(--text-gold);
    line-height: 1;
    letter-spacing: -0.3px;
    font-variant-numeric: tabular-nums;
    font-family: 'Fraunces', 'Source Han Serif SC', 'Noto Serif SC', serif;
  }

  .todo-label {
    margin-top: 8px;
  }
}

.todo-arrow {
  color: var(--text-tertiary);
  font-size: 18px;
  transition: transform 0.25s var(--ease-out-expo), color 0.25s var(--ease-out-expo);
}

.todo-card:hover .todo-arrow {
  color: var(--text-gold);
  transform: translateX(3px);
}

// ============ 图表 ============
.chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-card {
  padding: 20px;
}

.chart-card .chart-box {
  width: 100%;
  height: 280px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;

  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .accent-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 2px;
    color: var(--text-gold);
    text-transform: uppercase;
    padding: 2px 8px;
    border: 1px solid var(--gold-300);
    border-radius: 4px;
  }
}

// ============ 最近活动 ============
.recent-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.recent-card {
  padding: 18px 20px 8px;
  overflow: visible;
  min-width: 0;
}

// 表格包裹：移动端水平滚动
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  :deep(.el-table) {
    min-width: 560px;
  }
}

.recent-header {
  margin-bottom: 8px;
}

// 表格简约化：去边框，虚线分隔
:deep(.recent-table) {
  --el-table-border-color: var(--border-light);
  --el-table-header-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-bg-color: transparent;

  &::before {
    display: none;
  }

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
    padding: 8px 0;
  }

  .el-table__cell {
    border-bottom: 1px dashed var(--border-base);
    padding: 10px 0;
  }

  // 去掉右侧固定列的阴影
  .el-table__fixed-right::before,
  .el-table__fixed::before {
    display: none;
  }
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  background: var(--gradient-gold);
  color: var(--text-inverse);
  font-weight: 600;
  font-size: 12px;
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

// ============ 响应式 ============
@media (max-width: 1200px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .chart-grid, .recent-grid { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .stat-grid, .todo-grid { grid-template-columns: 1fr; }
}

// 平板：缩小卡片内边距与图标尺寸
@include tablet {
  .stat-card { padding: 18px; }
  .stat-icon { font-size: 20px; }
  .stat-value { font-size: 24px; }
  .chart-card .chart-box { height: 240px; }
  .todo-card { padding: 18px; }
  .todo-content .todo-num { font-size: 24px; }
}

// 手机：全面紧凑化
@include mobile {
  .admin-dashboard { gap: 12px; }
  .stat-card { padding: 14px; gap: 12px; }
  .stat-icon { font-size: 18px; }
  .stat-value { font-size: 22px; }
  .stat-trend { font-size: 11px; }
  .todo-card { padding: 14px; }
  .todo-content .todo-num { font-size: 22px; }
  .chart-card { padding: 14px 14px 16px; }
  .chart-card .chart-box { height: 220px; }
  .card-header .card-title { font-size: 14px; }
  .recent-card { padding: 14px 14px 6px; }
}
</style>
