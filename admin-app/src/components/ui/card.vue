<template>
  <view class="card" :class="{ 'card-flush': flush }">
    <slot />
  </view>
</template>

<script>
export default {
  name: 'Card',
  props: {
    flush: { type: Boolean, default: false },
  },
};
</script>

<style scoped>
.card-flush { padding: 0; }
</style>
