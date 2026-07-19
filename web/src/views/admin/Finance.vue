<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api/admin';
import { useThemeStore } from '@/stores/theme';
import * as echarts from 'echarts';
import dayjs from 'dayjs';

const theme = useThemeStore();

interface FinanceOverview {
  todayRevenue: number;
  monthRevenue: number;
  totalRevenue: number;
  pendingRefund: number;
  // 收入构成
  balanceRevenue?: number;
  epayRevenue?: number;
  // 30 天趋势
  trend?: Array<{ date: string; amount: number }>;
  // 今日发送
  todaySent?: number;
  dailyLimit?: number;
}

interface Transaction {
  id: number;
  type: string;
  userId: number;
  username: string;
  amount: number;
  payMethod: string;
  createdAt: string;
  remark?: string;
}

const loading = ref(false);
const tableLoading = ref(false);
const overview = ref<FinanceOverview | null>(null);

// 趋势 / 饼图
const trendChartRef = ref<HTMLElement | null>(null);
const pieChartRef = ref<HTMLElement | null>(null);
let trendChart: echarts.ECharts | null = null;
let pieChart: echarts.ECharts | null = null;

// 流水筛选
const filters = reactive({
  type: '',
  username: '',
  dateRange: [] as string[],
  page: 1,
  pageSize: 10,
});

const total = ref(0);
const transactions = ref<Transaction[]>([]);

const typeMap: Record<string, { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info' }> = {
  RECHARGE: { label: '充值', type: 'success' },
  ORDER: { label: '订单', type: '' },
  REFUND: { label: '退款', type: 'warning' },
  ADJUST: { label: '调整', type: 'info' },
  COUPON: { label: '优惠券', type: 'danger' },
};

const payMethodMap: Record<string, string> = {
  BALANCE: '余额支付',
  EPAY: '易支付',
  ALIPAY: '支付宝',
  WECHAT: '微信',
};

// 金额格式化
function formatMoney(n?: number) {
  if (n === null || n === undefined) return '¥0.00';
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function formatDate(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD') : '-';
}

// 获取 ECharts 主题色
function chartColors() {
  const root = getComputedStyle(document.documentElement);
  return {
    gold400: root.getPropertyValue('--gold-400').trim() || '#d4a249',
    gold500: root.getPropertyValue('--gold-500').trim() || '#b8860b',
    gold300: root.getPropertyValue('--gold-300').trim() || '#e0b865',
    textPrimary: root.getPropertyValue('--text-primary').trim() || '#1f1b14',
    textSecondary: root.getPropertyValue('--text-secondary').trim() || '#5c5446',
    borderBase: root.getPropertyValue('--border-base').trim() || '#e8dfcb',
    success: root.getPropertyValue('--success').trim() || '#4f7a3f',
    info: root.getPropertyValue('--info').trim() || '#3d6e8c',
    bgElevated: root.getPropertyValue('--bg-elevated').trim() || '#ffffff',
  };
}

function renderTrendChart() {
  if (!trendChartRef.value) return;
  if (!trendChart) trendChart = echarts.init(trendChartRef.value);
  const c = chartColors();
  const data = overview.value?.trend || [];
  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: c.bgElevated, borderColor: c.borderBase, textStyle: { color: c.textPrimary } },
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: data.map((d) => formatDate(d.date)),
      axisLine: { lineStyle: { color: c.borderBase } },
      axisLabel: { color: c.textSecondary, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: c.borderBase, type: 'dashed' } },
      axisLabel: { color: c.textSecondary, fontSize: 11, formatter: (v: number) => '¥' + v },
    },
    series: [
      {
        name: '营收',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.map((d) => d.amount),
        lineStyle: { color: c.gold400, width: 3 },
        itemStyle: { color: c.gold500 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(212, 162, 73, 0.35)' },
            { offset: 1, color: 'rgba(212, 162, 73, 0.02)' },
          ]),
        },
      },
    ],
  });
  trendChart.resize();
}

function renderPieChart() {
  if (!pieChartRef.value) return;
  if (!pieChart) pieChart = echarts.init(pieChartRef.value);
  const c = chartColors();
  const balance = overview.value?.balanceRevenue || 0;
  const epay = overview.value?.epayRevenue || 0;
  pieChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: c.bgElevated, borderColor: c.borderBase, textStyle: { color: c.textPrimary }, formatter: '{b}: {c} ({d}%)' },
    legend: {
      bottom: 10,
      textStyle: { color: c.textSecondary },
    },
    series: [
      {
        name: '收入构成',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: balance, name: '余额支付', itemStyle: { color: c.gold400 } },
          { value: epay, name: '易支付', itemStyle: { color: c.info } },
        ],
      },
    ],
  });
  pieChart.resize();
}

async function loadOverview() {
  loading.value = true;
  try {
    const res: any = await adminApi.financeOverview();
    if (res?.success) {
      overview.value = res.data;
      await nextTick();
      renderTrendChart();
      renderPieChart();
    }
  } catch (e) {
    // 忽略
  } finally {
    loading.value = false;
  }
}

async function loadTransactions() {
  tableLoading.value = true;
  try {
    const params: any = {
      page: filters.page,
      pageSize: filters.pageSize,
    };
    if (filters.type) params.type = filters.type;
    if (filters.username) params.username = filters.username;
    if (filters.dateRange?.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }
    const res: any = await adminApi.financeTransactions(params);
    if (res?.success) {
      transactions.value = res.data?.list || res.data?.items || [];
      total.value = res.data?.total || 0;
    }
  } catch (e) {
    // 忽略
  } finally {
    tableLoading.value = false;
  }
}

function handleSearch() {
  filters.page = 1;
  loadTransactions();
}

function handleReset() {
  filters.type = '';
  filters.username = '';
  filters.dateRange = [];
  filters.page = 1;
  loadTransactions();
}

async function handleExport() {
  try {
    const params: any = {};
    if (filters.type) params.type = filters.type;
    if (filters.username) params.username = filters.username;
    if (filters.dateRange?.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }
    const res: any = await adminApi.financeExport(params);
    if (res?.success) {
      ElMessage.success('导出任务已创建，请稍后在下载中心查看');
    }
  } catch (e) {
    // 忽略
  }
}

// 主题切换重绘
watch(
  () => theme.isDark,
  () => {
    nextTick(() => {
      renderTrendChart();
      renderPieChart();
    });
  },
);

function handleResize() {
  trendChart?.resize();
  pieChart?.resize();
}

onMounted(() => {
  loadOverview();
  loadTransactions();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  trendChart?.dispose();
  pieChart?.dispose();
});
</script>

<template>
  <div class="finance-page">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">FINANCE</span>
        <h2 class="page-title font-display">财务管理</h2>
      </div>
      <div class="header-actions">
        <el-button class="btn-outline" @click="handleExport">
          <el-icon style="margin-right: 6px;"><Download /></el-icon>
          导出流水
        </el-button>
      </div>
    </div>

    <!-- 统计卡 -->
    <div class="stat-grid" v-loading="loading">
      <div class="card stat-card">
        <div class="stat-eyebrow">TODAY REVENUE</div>
        <div class="stat-value text-gold">{{ formatMoney(overview?.todayRevenue) }}</div>
        <div class="stat-label">今日营收</div>
      </div>
      <div class="card stat-card">
        <div class="stat-eyebrow">MONTH REVENUE</div>
        <div class="stat-value">{{ formatMoney(overview?.monthRevenue) }}</div>
        <div class="stat-label">本月营收</div>
      </div>
      <div class="card stat-card">
        <div class="stat-eyebrow">TOTAL REVENUE</div>
        <div class="stat-value">{{ formatMoney(overview?.totalRevenue) }}</div>
        <div class="stat-label">累计营收</div>
      </div>
      <div class="card stat-card is-danger">
        <div class="stat-eyebrow">PENDING REFUND</div>
        <div class="stat-value danger">{{ formatMoney(overview?.pendingRefund) }}</div>
        <div class="stat-label">待退款金额</div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-grid">
      <div class="card chart-card">
        <div class="card-head">
          <span class="card-title">营收趋势</span>
          <span class="card-extra">最近 30 天</span>
        </div>
        <div ref="trendChartRef" class="chart-box" v-loading="loading"></div>
      </div>
      <div class="card chart-card">
        <div class="card-head">
          <span class="card-title">收入构成</span>
          <span class="card-extra">按支付方式</span>
        </div>
        <div ref="pieChartRef" class="chart-box" v-loading="loading"></div>
      </div>
    </div>

    <!-- 流水筛选 -->
    <div class="card filter-card">
      <div class="filter-bar">
        <el-form :inline="true" :model="filters" @submit.prevent>
          <el-form-item label="类型">
            <el-select v-model="filters.type" placeholder="全部" clearable style="width: 140px">
              <el-option v-for="(v, k) in typeMap" :key="k" :label="v.label" :value="k" />
            </el-select>
          </el-form-item>
          <el-form-item label="用户">
            <el-input v-model="filters.username" placeholder="用户名" clearable style="width: 160px" @keyup.enter="handleSearch" />
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
            <el-button class="btn-gold" @click="handleSearch">搜索</el-button>
            <el-button class="btn-outline" @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 流水表 -->
    <div class="card table-card">
      <div class="table-wrap">
        <el-table :data="transactions" v-loading="tableLoading">
          <el-table-column prop="id" label="流水号" width="90">
            <template #default="{ row }">
              <span class="mono">{{ row.id }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${typeMap[row.type]?.type || 'info'}`">
                {{ typeMap[row.type]?.label || row.type }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="用户" min-width="160">
            <template #default="{ row }">
              <span class="mono">{{ row.username }}</span>
              <span class="user-id">#{{ row.userId }}</span>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="160" align="right">
            <template #default="{ row }">
              <span :class="['money', row.amount >= 0 ? 'plus' : 'minus']">
                {{ row.amount >= 0 ? '+' : '' }}{{ formatMoney(row.amount) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="支付方式" width="120">
            <template #default="{ row }">
              <span class="pay-method">{{ payMethodMap[row.payMethod] || row.payMethod || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="170">
            <template #default="{ row }">
              <span class="mono">{{ formatTime(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="remark">{{ row.remark || '-' }}</span>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无流水" /></template>
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
          @current-change="loadTransactions"
          @size-change="loadTransactions"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;
.finance-page {
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
    .header-actions { width: 100%; }
    .header-actions .el-button { flex: 1; }
  }
}

// ============ 统计卡 ============
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;

  @include tablet-down {
    grid-template-columns: repeat(2, 1fr);
  }
  @include mobile {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

.stat-card {
  padding: 20px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--gradient-gold);
  }

  &.is-danger::before {
    background: var(--danger);
  }

  .stat-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 1.5px;
    color: var(--text-tertiary);
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-tertiary);
    letter-spacing: 0.3px;
  }

  .stat-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 26px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.5px;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;

    &.text-gold {
      color: var(--text-gold);
    }

    &.danger {
      color: var(--danger);
    }

    @include mobile {
      font-size: 22px;
    }
  }
}

// ============ 图表卡 ============
.chart-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;

  @include tablet-down {
    grid-template-columns: 1fr;
  }
}

.chart-card {
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

.chart-box {
  width: 100%;
  height: 320px;

  @include mobile {
    height: 240px;
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


.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.user-id {
  margin-left: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-tertiary);
}

.money {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  &.plus {
    color: var(--success);
  }

  &.minus {
    color: var(--danger);
  }
}

.pay-method {
  font-size: 13px;
  color: var(--text-secondary);
}

.remark {
  color: var(--text-secondary);
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
</style>
