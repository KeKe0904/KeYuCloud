<template>
  <view class="chart-card">
    <view class="chart-head">
      <view class="chart-title">{{ title }}</view>
      <slot name="extra" />
    </view>
    <view class="chart-area">
      <slot />
    </view>
  </view>
</template>

<script>
export default {
  name: 'ChartCard',
  props: {
    title: { type: String, default: '' },
  },
};
</script>
