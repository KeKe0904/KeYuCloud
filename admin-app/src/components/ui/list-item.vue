<template>
  <view class="lc-item" :hover="hoverClass" hover-class="lc-hover" @click="$emit('click', $event)">
    <view v-if="$slots.avatar || avatar" class="lc-avatar">
      <slot name="avatar">
        <ui-icon :name="avatarIcon || 'user'" :size="40" />
      </slot>
    </view>
    <view class="lc-main">
      <view class="lc-title">
        <slot name="title">{{ title }}</slot>
      </view>
      <view v-if="$slots.sub || sub" class="lc-sub">
        <slot name="sub">{{ sub }}</slot>
      </view>
    </view>
    <view v-if="$slots.right" class="lc-right">
      <slot name="right" />
    </view>
    <view v-if="chevron" class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
  </view>
</template>

<script>
export default {
  name: 'ListItem',
  props: {
    avatar: { type: Boolean, default: false },
    avatarIcon: { type: String, default: '' },
    title: { type: String, default: '' },
    sub: { type: String, default: '' },
    chevron: { type: Boolean, default: true },
    hoverClass: { type: String, default: 'lc-hover' },
  },
  emits: ['click'],
};
</script>

<style scoped>
.lc-hover { background: var(--color-surface-muted); }
</style>
