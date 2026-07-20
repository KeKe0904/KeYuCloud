<template>
  <view class="action-bar" :class="{ 'action-bar-safe': safe }">
    <slot />
  </view>
</template>

<script>
export default {
  name: 'ActionBar',
  props: {
    safe: { type: Boolean, default: true },
  },
};
</script>

<style scoped>
.action-bar-safe { padding-bottom: calc(var(--safe-area-bottom) + 24rpx); }
</style>
