<template>
  <view class="app">
    <ui-app-bar title="优惠券" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>
      <view class="list-card mt-12" v-if="filtered.length">
        <view v-for="c in filtered" :key="c.id" class="lc-item" @click="onEdit(c)">
          <view class="lc-avatar"><ui-icon name="tag" :size="40" /></view>
          <view class="lc-main">
            <view class="lc-title">{{ c.name }}</view>
            <view class="lc-sub">
              <text class="mono">{{ c.code }}</text>
              <text>·</text>
              <text>{{ c.type === 'AMOUNT' ? `满${c.minSpend}减${c.value}` : `满${c.minSpend}打${10 - c.value}折` }}</text>
              <text>·</text>
              <text>{{ c.validFrom }} 至 {{ c.validTo }}</text>
            </view>
          </view>
          <view class="lc-right">
            <ui-pill
              :variant="couponStatus(c.status).variant"
              :icon="couponStatus(c.status).icon"
              :text="couponStatus(c.status).label"
            />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无优惠券" />
    </scroll-view>
    <ui-fab icon="circle-plus" @click="onAdd" />
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { COUPON_STATUS, pickStatus } from '../../common/format';

export default {
  data() {
    return {
      currentTab: '全部',
      tabs: ['全部', '生效中', '已过期'],
      list: [],
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab === '生效中') r = r.filter((c) => c.status === 'ACTIVE');
      else if (this.currentTab === '已过期') r = r.filter((c) => c.status === 'EXPIRED');
      return r;
    },
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    couponStatus(s) { return pickStatus(COUPON_STATUS, s); },
    async loadData() {
      try {
        const r = await adminApi.coupons();
        this.list = r.list || [];
      } catch (e) {}
    },
    onAdd() {
      uni.showToast({ title: '创建优惠券功能开发中', icon: 'none' });
    },
    onEdit(c) {
      uni.showToast({ title: `编辑 ${c.name}`, icon: 'none' });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 220rpx; }
</style>
