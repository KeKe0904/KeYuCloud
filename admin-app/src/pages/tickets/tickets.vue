<template>
  <view class="app">
    <ui-app-bar title="工单管理" :show-menu="true" :show-avatar="true" @menu="drawerVisible = true" @avatar="goProfile" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>

      <view class="list-card mt-12" v-if="filtered.length">
        <view
          v-for="t in filtered"
          :key="t.id"
          class="lc-item"
          @click="goDetail(t)"
        >
          <view class="lc-avatar"><ui-icon name="message-circle-more" :size="40" /></view>
          <view class="lc-main">
            <view class="lc-title">{{ t.title }}</view>
            <view class="lc-sub">
              <text class="mono">{{ t.no }}</text>
              <text>·</text>
              <text>{{ t.userName }}</text>
              <text>·</text>
              <text>最后回复 {{ t.lastReply }}</text>
            </view>
          </view>
          <view class="lc-right">
            <ui-pill v-if="t.priority === 'URGENT'" variant="warn" text="紧急" />
            <ui-pill
              :variant="ticketStatus(t.status).variant"
              :icon="ticketStatus(t.status).icon"
              :text="ticketStatus(t.status).label"
            />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>

      <ui-empty v-else text="暂无工单" />
    </scroll-view>

    <ui-drawer :visible="drawerVisible" :active-path="currentPath" @close="drawerVisible = false" @logout="onLogout" />
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { useAuthStore } from '../../store/auth';
import { TICKET_STATUS, pickStatus } from '../../common/format';

export default {
  data() {
    return {
      drawerVisible: false,
      currentPath: '/pages/tickets/tickets',
      currentTab: '全部',
      tabs: ['全部', '待处理', '处理中', '紧急', '已关闭'],
      list: [],
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab === '待处理') r = r.filter((t) => t.status === 'PENDING');
      else if (this.currentTab === '处理中') r = r.filter((t) => t.status === 'PROCESSING');
      else if (this.currentTab === '紧急') r = r.filter((t) => t.priority === 'URGENT');
      else if (this.currentTab === '已关闭') r = r.filter((t) => t.status === 'CLOSED' || t.status === 'RESOLVED');
      return r;
    },
  },
  onShow() {
    this.checkAuth();
    this.loadData();
  },
  onPullDownRefresh() {
    this.loadData().finally(() => uni.stopPullDownRefresh());
  },
  methods: {
    ticketStatus(s) { return pickStatus(TICKET_STATUS, s); },
    checkAuth() {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) uni.reLaunch({ url: '/pages/admin/login' });
    },
    async loadData() {
      try {
        const r = await adminApi.tickets();
        this.list = r.list || [];
      } catch (e) { console.error(e); }
    },
    goDetail(t) {
      uni.navigateTo({ url: `/pages/admin/ticket-detail?id=${t.id}` });
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
