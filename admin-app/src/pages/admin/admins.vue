<template>
  <view class="app">
    <ui-app-bar title="管理员列表" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="sticky-top">
        <ui-segmented :items="tabs" v-model="currentTab" />
      </view>
      <view class="list-card mt-12" v-if="filtered.length">
        <view v-for="a in filtered" :key="a.id" class="lc-item" @click="onAssign(a)">
          <view class="lc-avatar"><ui-icon name="user" :size="40" /></view>
          <view class="lc-main">
            <view class="lc-title">{{ a.nickname || a.username }}</view>
            <view class="lc-sub">
              <text class="mono">{{ a.username }}</text>
              <text>·</text>
              <text>登录 {{ a.lastLoginAt }}</text>
              <text>·</text>
              <text class="mono">{{ a.lastLoginIp }}</text>
            </view>
          </view>
          <view class="lc-right">
            <ui-pill :variant="roleVariant(a.role)" :text="roleLabel(a.role)" />
            <ui-pill
              :variant="adminStatus(a.status).variant"
              :icon="adminStatus(a.status).icon"
              :text="adminStatus(a.status).label"
            />
          </view>
          <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
        </view>
      </view>
      <ui-empty v-else text="暂无管理员" />
    </scroll-view>
    <ui-fab icon="circle-plus" @click="onAdd" />

    <ui-sheet :visible="sheetVisible" title="角色分配" @close="sheetVisible = false">
      <view class="sheet-row" v-for="r in roleOptions" :key="r.value" @click="onSelectRole(r.value)">
        <ui-icon :name="selectedAdmin && selectedAdmin.role === r.value ? 'circle-check' : 'circle-minus'" :size="40" />
        <text class="flex-1">{{ r.label }}</text>
        <ui-pill v-if="selectedAdmin && selectedAdmin.role === r.value" variant="brand" text="已分配" />
      </view>
    </ui-sheet>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { ADMIN_STATUS, pickStatus, ADMIN_ROLE, ADMIN_ROLE_VARIANT } from '../../common/format';

export default {
  data() {
    return {
      currentTab: '全部',
      tabs: ['全部', '启用', '禁用'],
      list: [],
      sheetVisible: false,
      selectedAdmin: null,
      roleOptions: [
        { label: '超级管理员', value: 'SUPER_ADMIN' },
        { label: '管理员', value: 'ADMIN' },
        { label: '运营', value: 'OPERATOR' },
        { label: '财务', value: 'FINANCE' },
        { label: '客服', value: 'SUPPORT' },
        { label: '技术', value: 'TECH' },
      ],
    };
  },
  computed: {
    filtered() {
      let r = this.list;
      if (this.currentTab === '启用') r = r.filter((a) => a.status === 'ACTIVE');
      else if (this.currentTab === '禁用') r = r.filter((a) => a.status === 'DISABLED');
      return r;
    },
  },
  onShow() { this.loadData(); },
  onPullDownRefresh() { this.loadData().finally(() => uni.stopPullDownRefresh()); },
  methods: {
    adminStatus(s) { return pickStatus(ADMIN_STATUS, s); },
    roleLabel(r) { return ADMIN_ROLE[r] || r; },
    roleVariant(r) { return ADMIN_ROLE_VARIANT[r] || 'muted'; },
    async loadData() {
      try {
        const r = await adminApi.admins();
        this.list = r.list || [];
      } catch (e) {}
    },
    onAdd() {
      uni.showToast({ title: '新增管理员功能开发中', icon: 'none' });
    },
    onAssign(a) {
      this.selectedAdmin = a;
      this.sheetVisible = true;
    },
    async onSelectRole(role) {
      if (!this.selectedAdmin) return;
      try {
        await adminApi.updateAdmin(this.selectedAdmin.id, { role });
        uni.showToast({ title: '角色已更新', icon: 'success' });
        this.sheetVisible = false;
        this.loadData();
      } catch (e) {}
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 220rpx; }
.flex-1 { flex: 1; }
</style>
