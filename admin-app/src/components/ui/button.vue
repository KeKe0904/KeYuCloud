<template>
  <view
    class="btn"
    :class="['btn-' + variant, { 'btn-sm': small, 'btn-block': block }]"
    :hover="true"
    hover-class="btn-hover"
    :disabled="disabled"
    @click="!disabled && $emit('click', $event)"
  >
    <ui-icon v-if="icon" :name="icon" :size="small ? 28 : 32" />
    <text v-if="$slots.default"><slot /></text>
  </view>
</template>

<script>
export default {
  name: 'Button',
  props: {
    variant: { type: String, default: 'primary' }, // primary/secondary/ghost/danger
    icon: { type: String, default: '' },
    small: { type: Boolean, default: false },
    block: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
};
</script>

<style scoped>
.btn-hover { opacity: .85; }
</style>
