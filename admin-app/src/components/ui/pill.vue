<template>
  <view class="pill" :class="'pill-' + variant">
    <ui-icon v-if="icon" :name="icon" :size="24" />
    <text v-if="text">{{ text }}</text>
    <slot />
  </view>
</template>

<script>
export default {
  name: 'Pill',
  props: {
    variant: { type: String, default: 'muted' }, // muted/success/danger/brand/warn
    icon: { type: String, default: '' },
    text: { type: String, default: '' },
  },
};
</script>
