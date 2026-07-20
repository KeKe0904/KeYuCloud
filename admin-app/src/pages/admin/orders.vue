<template>
  <view class="app">
    <ui-app-bar title="订单管理" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>
      <view class="list-card mt-12" v-if="filtered.length">
        <view
          v-for="o in filtered"
          :key="o.id"
          class="lc-item"
          @click="goDetail(o)"
        >
          <view class="lc-main">
            <view class="lc-title mono">{{ o.orderNo }}</view>
            <view class="lc-sub">
              <text>用户 {{ o.userName }}</text>
              <text>·</text>
              <text>{{ o.productName }}</text>
              <text>·</text>
              <text>{{ o.period }}</text>
            </view>
          </view>
          <view class="lc-right">
            <text class="lc-amount">¥{{ formatNum(o.amount) }}</text>
            <ui-pill
              :variant="orderStatus(o.status).variant"
              :icon="orderStatus(o.status).icon"
              :text="orderStatus(o.status).label"
            />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无订单" />
    </scroll-view>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { ORDER_STATUS, pickStatus, formatNum } from '../../common/format';

export default {
  data() {
    return {
      currentTab: '全部',
      tabs: ['全部', '待支付', '已支付', '已开通', '已退款'],
      list: [],
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab !== '全部') {
        const map = { '待支付': 'PENDING', '已支付': 'PAID', '已开通': 'OPENED', '已退款': 'REFUNDED' };
        r = r.filter((o) => o.status === map[this.currentTab]);
      }
      return r;
    },
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    formatNum,
    orderStatus(s) { return pickStatus(ORDER_STATUS, s); },
    async loadData() {
      try {
        const r = await adminApi.orders();
        this.list = r.list || [];
      } catch (e) {}
    },
    goDetail(o) {
      uni.navigateTo({ url: `/pages/admin/order-detail?id=${o.id}` });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 180rpx; }
</style>
