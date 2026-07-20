<template>
  <header class="app-bar" :class="{ 'no-shadow': flat }" :style="{ paddingTop: (statusBarHeight || 20) + 'px' }">
    <view v-if="showBack" class="ic-btn" @click="onBack">
      <ui-icon name="chevron-left" :size="40" />
    </view>
    <view v-else-if="showMenu" class="ic-btn" @click="$emit('menu')">
      <ui-icon name="grip" :size="40" />
    </view>
    <view v-else class="spacer"></view>

    <view class="title">{{ title }}</view>

    <view v-if="showAvatar" class="avatar-btn" @click="$emit('avatar')">
      <ui-icon name="user" :size="32" />
    </view>
    <view v-else-if="$slots.right" class="slot-right"><slot name="right" /></view>
    <view v-else class="spacer"></view>
  </header>
</template>

<script>
export default {
  name: 'AppBar',
  props: {
    title: { type: String, default: '' },
    showBack: { type: Boolean, default: false },
    showMenu: { type: Boolean, default: false },
    showAvatar: { type: Boolean, default: false },
    flat: { type: Boolean, default: false },
  },
  emits: ['menu', 'avatar', 'back'],
  data() {
    return { statusBarHeight: 20 };
  },
  created() {
    try {
      const app = getApp();
      this.statusBarHeight = (app && app.globalData && app.globalData.statusBarHeight) || 20;
    } catch (e) {}
  },
  methods: {
    onBack() {
      this.$emit('back');
      const pages = getCurrentPages();
      if (pages.length > 1) {
        uni.navigateBack({ delta: 1 });
      } else {
        uni.switchTab({ url: '/pages/dashboard/dashboard' });
      }
    },
  },
};
</script>

<style scoped>
.app-bar { background: var(--color-surface); }
.no-shadow { border-bottom: 0; }
.slot-right { display: inline-flex; align-items: center; min-width: 80rpx; height: 80rpx; }
</style>
