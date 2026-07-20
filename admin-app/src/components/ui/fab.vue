<template>
  <view class="fab" @click="$emit('click', $event)">
    <ui-icon :name="icon" :size="48" />
  </view>
</template>

<script>
export default {
  name: 'Fab',
  props: {
    icon: { type: String, default: 'circle-plus' },
  },
  emits: ['click'],
};
</script>
