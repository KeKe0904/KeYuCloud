<template>
  <view class="app">
    <ui-app-bar title="SMTP 日志" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>

      <view class="list-card mt-12" v-if="filtered.length">
        <view
          v-for="l in filtered"
          :key="l.id"
          class="lc-item"
          @click="openDetail(l)"
        >
          <view class="lc-avatar">
            <ui-icon :name="l.status === 'SUCCESS' ? 'check' : 'circle-minus'" :size="40" />
          </view>
          <view class="lc-main">
            <view class="lc-title mono">{{ l.to }}</view>
            <view class="lc-sub">
              <text>{{ l.templateName }}</text>
              <text>·</text>
              <text class="mono">{{ l.templateCode }}</text>
              <text>·</text>
              <text class="mono">{{ formatTime(l.sentAt) }}</text>
            </view>
          </view>
          <view class="lc-right">
            <ui-pill
              v-if="l.status === 'SUCCESS'"
              variant="success"
              icon="check"
              text="成功"
            />
            <ui-pill v-else variant="danger" icon="circle-minus" text="失败" />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无日志" />

      <p class="section-label mt-16">
        共 {{ filtered.length }} 条记录 · 成功 {{ successCount }} · 失败 {{ failedCount }}
      </p>
    </scroll-view>

    <ui-sheet :visible="sheetVisible" title="邮件详情" @close="sheetVisible = false">
      <view class="sheet-row">
        <text class="k">收件人</text>
        <text class="v mono">{{ selected?.to }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">主题</text>
        <text class="v">{{ selected?.templateName }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">模板</text>
        <text class="v mono">{{ selected?.templateCode }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">状态</text>
        <view class="v">
          <ui-pill
            v-if="selected?.status === 'SUCCESS'"
            variant="success"
            icon="check"
            text="成功"
          />
          <ui-pill v-else variant="danger" icon="circle-minus" text="失败" />
        </view>
      </view>
      <view class="sheet-row">
        <text class="k">发送时间</text>
        <text class="v mono">{{ selected?.sentAt }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">SMTP 响应</text>
        <text class="v mono">{{ selected?.status === 'SUCCESS' ? '250 OK' : '550 Failed' }}</text>
      </view>
      <view class="sheet-row" v-if="selected?.error">
        <text class="k">错误信息</text>
        <text class="v mono text-xs">{{ selected?.error }}</text>
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
      tabs: ['全部', '成功', '失败'],
      list: [],
      sheetVisible: false,
      selected: null,
    };
  },
  computed: {
    filtered() {
      if (this.currentTab === '成功') return this.list.filter((l) => l.status === 'SUCCESS');
      if (this.currentTab === '失败') return this.list.filter((l) => l.status === 'FAILED');
      return this.list;
    },
    successCount() {
      return this.list.filter((l) => l.status === 'SUCCESS').length;
    },
    failedCount() {
      return this.list.filter((l) => l.status === 'FAILED').length;
    },
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    async loadData() {
      try {
        const r = await adminApi.smtpLogs();
        this.list = r.list || [];
      } catch (e) {}
    },
    openDetail(l) {
      this.selected = l;
      this.sheetVisible = true;
    },
    formatTime(dt) {
      if (!dt) return '';
      // "2025-07-20 10:30:15" -> "10:30:15"
      const parts = String(dt).split(' ');
      return parts[1] || parts[0];
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 180rpx; }
.lc-avatar {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}
.sheet-row .k { color: var(--color-text-muted); flex: 1; }
.sheet-row .v { font-weight: 500; text-align: right; }
</style>
