<template>
  <view class="app">
    <ui-app-bar title="审计日志" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>
      <view class="list-card mt-12" v-if="filtered.length">
        <view v-for="l in filtered" :key="l.id" class="lc-item" @click="openDetail(l)">
          <view class="lc-avatar"><ui-icon name="file" :size="40" /></view>
          <view class="lc-main">
            <view class="lc-title">{{ l.action }}</view>
            <view class="lc-sub">
              <text>{{ l.adminName }}</text>
              <text>·</text>
              <text class="mono">{{ l.ip }}</text>
            </view>
          </view>
          <view class="lc-right">
            <text class="mono text-xs">#{{ l.id }}</text>
            <text class="text-xs text-muted">{{ l.createdAt }}</text>
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无日志" />
    </scroll-view>

    <ui-sheet :visible="sheetVisible" title="日志详情" @close="sheetVisible = false">
      <view class="sheet-row">
        <text class="k">日志ID</text>
        <text class="v mono">#{{ selected?.id }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">管理员</text>
        <text class="v">{{ selected?.adminName }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">操作类型</text>
        <text class="v">{{ selected?.action }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">操作对象</text>
        <text class="v">{{ selected?.targetType }} {{ selected?.targetId ? '#' + selected.targetId : '' }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">IP</text>
        <text class="v mono">{{ selected?.ip }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">User-Agent</text>
        <text class="v mono text-xs">{{ selected?.userAgent }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">操作时间</text>
        <text class="v mono">{{ selected?.createdAt }}</text>
      </view>
    </ui-sheet>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';

export default {
  data() {
    return {
      currentTab: '全部',
      tabs: ['全部', '登录', '订单', '配置'],
      list: [],
      sheetVisible: false,
      selected: null,
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab === '登录') r = r.filter((l) => l.targetType === 'auth');
      else if (this.currentTab === '订单') r = r.filter((l) => l.targetType === 'order');
      else if (this.currentTab === '配置') r = r.filter((l) => l.targetType === 'config');
      return r;
    },
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    async loadData() {
      try {
        const r = await adminApi.auditLogs();
        this.list = r.list || [];
      } catch (e) {}
    },
    openDetail(l) {
      this.selected = l;
      this.sheetVisible = true;
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 180rpx; }
.sheet-row .k { color: var(--color-text-muted); flex: 1; }
.sheet-row .v { font-weight: 500; text-align: right; }
</style>
