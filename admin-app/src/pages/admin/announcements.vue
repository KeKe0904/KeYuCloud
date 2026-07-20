<template>
  <view class="app">
    <ui-app-bar title="公告" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>
      <view class="list-card mt-12" v-if="filtered.length">
        <view v-for="a in filtered" :key="a.id" class="lc-item" @click="onEdit(a)">
          <view class="lc-main">
            <view class="lc-title">{{ a.title }}</view>
            <view class="lc-sub">
              <text>{{ a.summary }}</text>
            </view>
            <view class="lc-sub">
              <text>{{ a.publishedAt || '未发布' }}</text>
              <text>·</text>
              <text>阅读 {{ a.readCount }}</text>
            </view>
          </view>
          <view class="lc-right">
            <ui-pill
              :variant="announcementStatus(a.status).variant"
              :icon="announcementStatus(a.status).icon"
              :text="announcementStatus(a.status).label"
            />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无公告" />
    </scroll-view>
    <ui-fab icon="circle-plus" @click="onAdd" />
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { ANNOUNCEMENT_STATUS, pickStatus } from '../../common/format';

export default {
  data() {
    return {
      currentTab: '已发布',
      tabs: ['已发布', '草稿'],
      list: [],
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab === '已发布') r = r.filter((a) => a.status === 'PUBLISHED');
      else if (this.currentTab === '草稿') r = r.filter((a) => a.status === 'DRAFT');
      return r;
    },
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    announcementStatus(s) { return pickStatus(ANNOUNCEMENT_STATUS, s); },
    async loadData() {
      try {
        const r = await adminApi.announcements();
        this.list = r.list || [];
      } catch (e) {}
    },
    onAdd() {
      uni.showToast({ title: '发布公告功能开发中', icon: 'none' });
    },
    onEdit(a) {
      uni.showToast({ title: `编辑 ${a.title}`, icon: 'none' });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 220rpx; }
</style>
