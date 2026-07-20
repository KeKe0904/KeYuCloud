<template>
  <view class="app">
    <ui-app-bar title="用户管理" :show-menu="true" :show-avatar="true" @menu="drawerVisible = true" @avatar="goProfile" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-search-bar v-model="keyword" placeholder="搜索用户 / 手机号" class="mb-8" @confirm="loadData" />
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>

      <view class="list-card mt-12" v-if="filtered.length">
        <view
          v-for="u in filtered"
          :key="u.id"
          class="lc-item"
          @click="goDetail(u)"
        >
          <view class="lc-avatar"><ui-icon name="user" :size="40" /></view>
          <view class="lc-main">
            <view class="lc-title">{{ u.name }}</view>
            <view class="lc-sub">
              <text class="mono">{{ u.phone }}</text>
              <text>·</text>
              <text>注册 {{ u.createdAt }}</text>
            </view>
          </view>
          <view class="lc-right">
            <text class="lc-amount">¥{{ formatNum(u.balance) }}</text>
            <ui-pill
              :variant="userStatus(u.status).variant"
              :icon="userStatus(u.status).icon"
              :text="userStatus(u.status).label"
            />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>

      <ui-empty v-else text="暂无用户" />
    </scroll-view>

    <ui-drawer :visible="drawerVisible" :active-path="currentPath" @close="drawerVisible = false" @logout="onLogout" />
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { useAuthStore } from '../../store/auth';
import { USER_STATUS, pickStatus, formatNum } from '../../common/format';

export default {
  data() {
    return {
      drawerVisible: false,
      currentPath: '/pages/users/users',
      keyword: '',
      currentTab: '全部',
      tabs: ['全部', '正常', '封禁'],
      list: [],
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab === '正常') r = r.filter((u) => u.status === 'ACTIVE');
      else if (this.currentTab === '封禁') r = r.filter((u) => u.status === 'BANNED');
      if (this.keyword) {
        const k = this.keyword.toLowerCase();
        r = r.filter((u) => u.name.toLowerCase().includes(k) || (u.phone || '').includes(k));
      }
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
    formatNum,
    userStatus(s) { return pickStatus(USER_STATUS, s); },
    checkAuth() {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) {
        uni.reLaunch({ url: '/pages/admin/login' });
      }
    },
    async loadData() {
      try {
        const r = await adminApi.users();
        this.list = r.list || [];
      } catch (e) { console.error(e); }
    },
    goDetail(u) {
      uni.navigateTo({ url: `/pages/admin/user-detail?id=${u.id}` });
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
