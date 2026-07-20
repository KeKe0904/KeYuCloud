<template>
  <view class="app">
    <ui-app-bar title="SMTP 模板" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <p class="section-label">邮件模板</p>
      <view class="list-card" v-if="list.length">
        <view
          v-for="t in list"
          :key="t.id"
          class="lc-item"
          @click="openDetail(t)"
        >
          <view class="lc-avatar"><ui-icon name="mail" :size="40" /></view>
          <view class="lc-main">
            <view class="lc-title">{{ t.name }}</view>
            <view class="lc-sub">
              <text class="mono">{{ t.code }}</text>
              <text>·</text>
              <text>{{ t.description }}</text>
            </view>
            <view class="lc-sub">
              <text>最后修改 {{ t.updatedAt }}</text>
            </view>
          </view>
          <view class="lc-right">
            <ui-pill
              v-if="t.status === 'ACTIVE'"
              variant="success"
              icon="check"
              text="启用"
            />
            <ui-pill v-else variant="muted" text="停用" />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无模板" />

      <p class="section-label mt-16">共 {{ list.length }} 个模板</p>
    </scroll-view>

    <ui-fab icon="circle-plus" @click="onNew" />

    <ui-sheet :visible="sheetVisible" :title="selected ? selected.name : '模板详情'" @close="sheetVisible = false">
      <view class="sheet-row">
        <text class="k">模板名称</text>
        <text class="v">{{ selected?.name }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">模板代码</text>
        <text class="v mono">{{ selected?.code }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">描述</text>
        <text class="v">{{ selected?.description }}</text>
      </view>
      <view class="sheet-row">
        <text class="k">状态</text>
        <view class="v">
          <ui-pill
            v-if="selected?.status === 'ACTIVE'"
            variant="success"
            icon="check"
            text="启用"
          />
          <ui-pill v-else variant="muted" text="停用" />
        </view>
      </view>
      <view class="sheet-row">
        <text class="k">最后修改</text>
        <text class="v mono">{{ selected?.updatedAt }}</text>
      </view>
      <view class="sheet-actions">
        <ui-button variant="secondary" block @click="onToggleStatus">
          {{ selected?.status === 'ACTIVE' ? '停用模板' : '启用模板' }}
        </ui-button>
        <ui-button variant="danger" block @click="onDelete">
          删除模板
        </ui-button>
      </view>
    </ui-sheet>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';

export default {
  data() {
    return {
      list: [],
      sheetVisible: false,
      selected: null,
    };
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    async loadData() {
      try {
        const r = await adminApi.smtpTemplates();
        this.list = r.list || [];
      } catch (e) {}
    },
    openDetail(t) {
      this.selected = t;
      this.sheetVisible = true;
    },
    onNew() {
      uni.showToast({ title: '新建模板功能开发中', icon: 'none' });
    },
    onToggleStatus() {
      if (!this.selected) return;
      const next = this.selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      uni.showLoading({ title: '更新中' });
      adminApi.updateSmtpTemplate(this.selected.id, { status: next })
        .then(() => {
          this.selected.status = next;
          const item = this.list.find((x) => x.id === this.selected.id);
          if (item) item.status = next;
          uni.showToast({ title: '已更新', icon: 'success' });
        })
        .catch(() => {})
        .finally(() => uni.hideLoading());
    },
    onDelete() {
      if (!this.selected) return;
      uni.showModal({
        title: '删除模板',
        content: `确认删除模板「${this.selected.name}」？此操作不可撤销。`,
        confirmColor: '#dc2626',
        success: (res) => {
          if (res.confirm) {
            uni.showLoading({ title: '删除中' });
            adminApi.deleteSmtpTemplate(this.selected.id)
              .then(() => {
                this.list = this.list.filter((x) => x.id !== this.selected.id);
                this.sheetVisible = false;
                uni.showToast({ title: '已删除', icon: 'success' });
              })
              .catch(() => {})
              .finally(() => uni.hideLoading());
          }
        },
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 180rpx; }
.lc-avatar {
  background: var(--color-brand-subtle);
  color: var(--color-primary);
}
.sheet-row .k { color: var(--color-text-muted); flex: 1; }
.sheet-row .v { font-weight: 500; text-align: right; }
.sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 24rpx;
}
</style>
