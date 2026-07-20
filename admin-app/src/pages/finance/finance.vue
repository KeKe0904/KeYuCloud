<template>
  <view class="app">
    <ui-app-bar title="财务管理" :show-menu="true" :show-avatar="true" @menu="drawerVisible = true" @avatar="goProfile" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>

      <view class="metric-grid mt-12" v-if="data.period">
        <ui-metric-card eyebrow="收入" :value="formatMoney(data.period.income)" />
        <ui-metric-card eyebrow="支出" :value="formatMoney(data.period.expense)" />
        <ui-metric-card eyebrow="净利" :value="formatMoney(data.period.net)" />
      </view>

      <view class="mt-12" v-if="data.charts">
        <ui-chart-card title="收支趋势 (近7日)">
          <ui-echart
            type="line"
            :categories="data.charts.trend.map(d => d.date)"
            :series="[
              { name: '收入', data: data.charts.trend.map(d => d.income) },
              { name: '支出', data: data.charts.trend.map(d => d.expense) }
            ]"
            :colors="['#18181b', '#dc2626']"
          />
        </ui-chart-card>
      </view>

      <view class="mt-12" v-if="data.charts">
        <ui-chart-card title="收入分类">
          <ui-echart
            type="donut"
            :categories="data.charts.incomeDist.map(d => d.name)"
            :series="[{ name: '收入', data: data.charts.incomeDist.map(d => d.value) }]"
          />
        </ui-chart-card>
      </view>

      <view class="section-label mt-12">近期明细</view>
      <view class="list-card" v-if="data.transactions && data.transactions.length">
        <view v-for="t in data.transactions" :key="t.id" class="lc-item">
          <view class="lc-avatar">
            <ui-icon :name="txType(t.type).icon" :size="32" />
          </view>
          <view class="lc-main">
            <view class="lc-title">{{ t.description }}</view>
            <view class="lc-sub">
              <text>用户 {{ t.userName }}</text>
              <text>·</text>
              <text>{{ t.createdAt }}</text>
            </view>
          </view>
          <view class="lc-right">
            <text class="lc-amount" :class="t.type === 'INCOME' ? 'text-success' : 'text-danger'">
              {{ t.type === 'INCOME' ? '+' : '-' }}¥{{ formatNum(t.amount) }}
            </text>
            <ui-pill :variant="txType(t.type).variant" :text="txType(t.type).label" />
          </view>
        </view>
      </view>
      <ui-empty v-else text="暂无明细" />
    </scroll-view>

    <ui-drawer :visible="drawerVisible" :active-path="currentPath" @close="drawerVisible = false" @logout="onLogout" />
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { useAuthStore } from '../../store/auth';
import { FINANCE_TX_TYPE, pickStatus, formatMoney, formatNum } from '../../common/format';

export default {
  data() {
    return {
      drawerVisible: false,
      currentPath: '/pages/finance/finance',
      currentTab: '本月',
      tabs: ['今日', '本周', '本月', '全年'],
      data: {},
    };
  },
  onShow() {
    this.checkAuth();
    this.loadData();
  },
  onPullDownRefresh() {
    this.loadData().finally(() => uni.stopPullDownRefresh());
  },
  methods: {
    formatMoney, formatNum,
    txType(t) { return pickStatus(FINANCE_TX_TYPE, t); },
    checkAuth() {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) uni.reLaunch({ url: '/pages/admin/login' });
    },
    async loadData() {
      try {
        this.data = await adminApi.financeOverview();
      } catch (e) { console.error(e); }
    },
    goProfile() {
      uni.switchTab({ url: '/pages/profile/profile' });
    },
    onLogout() {
      const auth = useAuthStore();
      auth.logout();
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 180rpx; }
.text-success { color: var(--color-success-700); }
.text-danger { color: var(--color-danger-700); }
</style>
