<template>
  <view class="app">
    <ui-app-bar title="仪表盘" :show-menu="true" :show-avatar="true" @menu="drawerVisible = true" @avatar="goProfile" />
    <scroll-view class="app-content" scroll-y>
      <!-- metric grid -->
      <view class="metric-grid" v-if="data.metrics">
        <ui-metric-card eyebrow="销售额" :value="formatMoney(data.metrics.sales.value)" :delta="data.metrics.sales.delta" :delta-type="data.metrics.sales.deltaType" />
        <ui-metric-card eyebrow="用户数" :value="formatNum(data.metrics.users.value)" :delta="data.metrics.users.delta" :delta-type="data.metrics.users.deltaType" />
        <ui-metric-card eyebrow="订单数" :value="formatNum(data.metrics.orders.value)" :delta="data.metrics.orders.delta" :delta-type="data.metrics.orders.deltaType" />
      </view>

      <!-- sales trend -->
      <view class="mt-12" v-if="data.charts">
        <ui-chart-card title="销售额趋势 (近7日)">
          <ui-echart
            type="line"
            :categories="data.charts.salesTrend.map(d => d.date)"
            :series="[{ name: '销售额', data: data.charts.salesTrend.map(d => d.value) }]"
          />
        </ui-chart-card>
      </view>

      <!-- user growth -->
      <view class="mt-12" v-if="data.charts">
        <ui-chart-card title="用户增长 (近7日)">
          <ui-echart
            type="line"
            :categories="data.charts.userTrend.map(d => d.date)"
            :series="[{ name: '新增', data: data.charts.userTrend.map(d => d.value) }]"
          />
        </ui-chart-card>
      </view>

      <!-- order distribution -->
      <view class="mt-12 mb-12" v-if="data.charts">
        <ui-chart-card title="订单分布">
          <ui-echart
            type="donut"
            :categories="data.charts.orderDist.map(d => d.name)"
            :series="[{ name: '订单', data: data.charts.orderDist.map(d => d.value) }]"
          />
        </ui-chart-card>
      </view>
    </scroll-view>

    <ui-drawer :visible="drawerVisible" :active-path="currentPath" @close="drawerVisible = false" @logout="onLogout" />
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { useAuthStore } from '../../store/auth';
import { formatMoney, formatNum } from '../../common/format';

export default {
  data() {
    return {
      drawerVisible: false,
      currentPath: '/pages/dashboard/dashboard',
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
    checkAuth() {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) {
        uni.reLaunch({ url: '/pages/admin/login' });
        return;
      }
      if (!auth.profile) auth.fetchProfile().catch(() => {});
    },
    async loadData() {
      try {
        this.data = await adminApi.dashboard();
      } catch (e) {
        console.error(e);
      }
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
</style>
