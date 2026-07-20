<template>
  <view v-if="visible" class="drawer-root">
    <view class="drawer-scrim" @click="$emit('close')" />
    <view class="drawer is-open">
      <view class="drawer-head">
        <view class="brand-logo">
          <ui-icon name="cloud" :size="40" />
        </view>
        <view>
          <view class="brand">柯羽云</view>
          <view class="brand-sub">管理后台</view>
        </view>
      </view>
      <scroll-view class="drawer-body" scroll-y>
        <view v-for="(section, si) in menu" :key="si">
          <view class="drawer-section-label">{{ section.label }}</view>
          <view
            v-for="(item, ii) in section.items"
            :key="ii"
            class="drawer-item"
            :class="{ 'is-active': activePath === item.path }"
            @click="onSelect(item)"
          >
            <ui-icon :name="item.icon" :size="40" />
            <text>{{ item.label }}</text>
          </view>
        </view>
        <view class="drawer-section-label">账户</view>
        <view class="drawer-item" @click="onLogout">
          <ui-icon name="logout" :size="40" />
          <text>退出登录</text>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script>
export const DRAWER_MENU = [
  {
    label: '账户管理',
    items: [
      { label: '商品管理', icon: 'box', path: '/pages/admin/products' },
      { label: '订单管理', icon: 'file', path: '/pages/admin/orders' },
      { label: '用户产品', icon: 'folder', path: '/pages/admin/user-products' },
    ],
  },
  {
    label: '运营管理',
    items: [
      { label: '工单管理', icon: 'message-circle-more', path: '/pages/tickets/tickets' },
      { label: '财务管理', icon: 'box', path: '/pages/finance/finance' },
    ],
  },
  {
    label: '系统配置',
    items: [
      { label: '上游配置', icon: 'external-link', path: '/pages/admin/upstream' },
      { label: 'SMTP 配置', icon: 'mail', path: '/pages/admin/smtp' },
      { label: 'SMTP 模板', icon: 'file', path: '/pages/admin/smtp-templates' },
      { label: 'SMTP 日志', icon: 'file', path: '/pages/admin/smtp-logs' },
      { label: '短信配置', icon: 'send-horizontal', path: '/pages/admin/sms' },
    ],
  },
  {
    label: '营销工具',
    items: [
      { label: '优惠券', icon: 'tag', path: '/pages/admin/coupons' },
      { label: '公告管理', icon: 'message-circle-more', path: '/pages/admin/announcements' },
    ],
  },
  {
    label: '系统管理',
    items: [
      { label: '系统配置', icon: 'settings', path: '/pages/admin/system' },
      { label: '管理员列表', icon: 'user', path: '/pages/admin/admins' },
      { label: '审计日志', icon: 'file', path: '/pages/admin/audit-logs' },
    ],
  },
];

export default {
  name: 'Drawer',
  props: {
    visible: { type: Boolean, default: false },
    activePath: { type: String, default: '' },
  },
  emits: ['close', 'select', 'logout'],
  data() {
    return { menu: DRAWER_MENU };
  },
  methods: {
    onSelect(item) {
      this.$emit('close');
      this.$emit('select', item);
      // tab 页用 switchTab, 其他用 navigateTo
      setTimeout(() => {
        if (item.path.startsWith('/pages/dashboard/') || item.path.startsWith('/pages/users/') || item.path.startsWith('/pages/tickets/') || item.path.startsWith('/pages/finance/') || item.path.startsWith('/pages/profile/')) {
          uni.switchTab({ url: item.path });
        } else {
          uni.navigateTo({ url: item.path });
        }
      }, 180);
    },
    onLogout() {
      this.$emit('close');
      this.$emit('logout');
    },
  },
};
</script>

<style scoped>
.drawer-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  width: 100%;
  max-width: 720rpx;
}
.drawer { width: 100%; max-width: 720rpx; }
</style>
