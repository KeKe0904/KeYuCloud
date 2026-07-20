<template>
  <view class="app">
    <ui-app-bar title="用户产品" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-search-bar v-model="keyword" placeholder="搜索实例名 / 用户" class="mb-8" />
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>
      <view class="list-card mt-12" v-if="filtered.length">
        <view
          v-for="p in filtered"
          :key="p.id"
          class="lc-item"
          @click="openSheet(p)"
        >
          <view class="lc-avatar">
            <ui-icon name="server" :size="40" />
          </view>
          <view class="lc-main">
            <view class="lc-title">{{ p.name }}</view>
            <view class="lc-sub">
              <text>{{ p.userName }}</text>
              <text>·</text>
              <text>{{ p.type }}</text>
              <text>·</text>
              <text class="mono">{{ p.ip }}</text>
              <text>·</text>
              <text>到期 {{ p.expireAt }}</text>
            </view>
          </view>
          <view class="lc-right">
            <ui-pill
              :variant="upStatus(p.status).variant"
              :icon="upStatus(p.status).icon"
              :text="upStatus(p.status).label"
            />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-down" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无产品" />
    </scroll-view>

    <ui-sheet :visible="sheetVisible" title="实例操作" @close="sheetVisible = false">
      <view class="sheet-row" @click="onAction('start')">
        <ui-icon name="circle-play" :size="40" />
        <text class="flex-1">开机</text>
      </view>
      <view class="sheet-row" @click="onAction('stop')">
        <ui-icon name="circle-pause" :size="40" />
        <text class="flex-1">关机</text>
      </view>
      <view class="sheet-row" @click="onAction('restart')">
        <ui-icon name="circle-check" :size="40" />
        <text class="flex-1">重启</text>
      </view>
      <view class="sheet-row danger" @click="onAction('reinstall')">
        <ui-icon name="trash-2" :size="40" />
        <text class="flex-1">重装系统</text>
      </view>
    </ui-sheet>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { USER_PRODUCT_STATUS, pickStatus } from '../../common/format';

export default {
  data() {
    return {
      keyword: '',
      currentTab: '全部',
      tabs: ['全部', '运行中', '已关机'],
      list: [],
      sheetVisible: false,
      selected: null,
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab === '运行中') r = r.filter((p) => p.status === 'RUNNING');
      else if (this.currentTab === '已关机') r = r.filter((p) => p.status === 'STOPPED');
      if (this.keyword) {
        const k = this.keyword.toLowerCase();
        r = r.filter((p) => p.name.toLowerCase().includes(k) || p.userName.toLowerCase().includes(k));
      }
      return r;
    },
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    upStatus(s) { return pickStatus(USER_PRODUCT_STATUS, s); },
    async loadData() {
      try {
        const r = await adminApi.userProducts();
        this.list = r.list || [];
      } catch (e) {}
    },
    openSheet(p) {
      this.selected = p;
      this.sheetVisible = true;
    },
    async onAction(action) {
      if (!this.selected) return;
      const labels = { start: '开机', stop: '关机', restart: '重启', reinstall: '重装系统' };
      uni.showModal({
        title: `确认${labels[action]}`,
        content: `确定要对实例 ${this.selected.name} 执行 ${labels[action]} 操作吗？`,
        success: async (res) => {
          if (res.confirm) {
            try {
              await adminApi.operateUserProduct(this.selected.id, action);
              uni.showToast({ title: '操作已提交', icon: 'success' });
              this.sheetVisible = false;
              this.loadData();
            } catch (e) {}
          }
        },
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 180rpx; }
.flex-1 { flex: 1; }
</style>
