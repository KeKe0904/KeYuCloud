<template>
  <view class="app">
    <ui-app-bar title="商品管理" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>
      <view class="list-card mt-12" v-if="filtered.length">
        <view v-for="p in filtered" :key="p.id" class="lc-item" @click="onEdit(p)">
          <view class="lc-main">
            <view class="lc-title">{{ p.name }}</view>
            <view class="lc-sub">
              <text>规格:</text>
              <text class="mono">{{ p.spec }}</text>
              <text>·</text>
              <text>上游:</text>
              <text>{{ p.upstream }}</text>
            </view>
          </view>
          <view class="lc-right">
            <text class="lc-amount">¥{{ formatNum(p.price) }}/{{ p.period }}</text>
            <ui-pill
              :variant="productStatus(p.status).variant"
              :icon="productStatus(p.status).icon"
              :text="productStatus(p.status).label"
            />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无商品" />
    </scroll-view>
    <ui-fab icon="circle-plus" @click="onAdd" />
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { PRODUCT_STATUS, pickStatus, formatNum } from '../../common/format';

export default {
  data() {
    return {
      currentTab: '全部',
      tabs: ['全部', '上架', '下架'],
      list: [],
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab === '上架') r = r.filter((p) => p.status === 'ON_SALE');
      else if (this.currentTab === '下架') r = r.filter((p) => p.status === 'OFF_SHELF');
      return r;
    },
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    formatNum,
    productStatus(s) { return pickStatus(PRODUCT_STATUS, s); },
    async loadData() {
      try {
        const r = await adminApi.products();
        this.list = r.list || [];
      } catch (e) {}
    },
    onAdd() {
      uni.showToast({ title: '新增商品功能开发中', icon: 'none' });
    },
    onEdit(p) {
      uni.showToast({ title: `编辑 ${p.name}`, icon: 'none' });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 220rpx; }
</style>
