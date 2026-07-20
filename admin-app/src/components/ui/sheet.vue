<template>
  <view v-if="visible" class="sheet-root">
    <view class="sheet-scrim" @click="$emit('close')" />
    <view class="sheet">
      <view class="sheet-handle" />
      <view v-if="title" class="sheet-title">{{ title }}</view>
      <slot />
    </view>
  </view>
</template>

<script>
export default {
  name: 'Sheet',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '' },
  },
  emits: ['close'],
};
</script>

<style scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 55;
}
</style>
