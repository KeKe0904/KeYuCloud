<template>
  <view class="search-bar">
    <ui-icon class="ic-search" name="search" :size="32" />
    <input
      class="search-input"
      :placeholder="placeholder"
      :value="modelValue"
      :confirm-type="confirmType"
      @input="$emit('update:modelValue', $event.detail.value)"
      @confirm="$emit('confirm', $event)"
    />
  </view>
</template>

<script>
export default {
  name: 'SearchBar',
  props: {
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: '搜索' },
    confirmType: { type: String, default: 'search' },
  },
  emits: ['update:modelValue', 'confirm'],
};
</script>
