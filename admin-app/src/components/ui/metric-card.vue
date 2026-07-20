<template>
  <view class="metric-card">
    <view class="metric-eyebrow">{{ eyebrow }}</view>
    <view class="metric-value">{{ value }}</view>
    <view v-if="delta" class="metric-delta" :class="deltaClass">
      <ui-icon :name="deltaIcon" :size="24" />
      <text>{{ delta }}</text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'MetricCard',
  props: {
    eyebrow: { type: String, default: '' },
    value: { type: [String, Number], default: '' },
    delta: { type: String, default: '' },
    deltaType: { type: String, default: 'up' }, // up/down
  },
  computed: {
    deltaClass() {
      return this.deltaType === 'down' ? 'down' : 'up';
    },
    deltaIcon() {
      return this.deltaType === 'down' ? 'arrow-down' : 'arrow-up';
    },
  },
};
</script>
