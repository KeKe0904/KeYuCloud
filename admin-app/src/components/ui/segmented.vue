<template>
  <view class="segmented">
    <view
      v-for="(item, i) in items"
      :key="i"
      class="seg-item"
      :class="{ 'is-active': modelValue === getValue(item) }"
      @click="$emit('update:modelValue', getValue(item))"
    >
      {{ getLabel(item) }}
    </view>
  </view>
</template>

<script>
export default {
  name: 'Segmented',
  props: {
    items: { type: Array, default: () => [] }, // ['全部','正常'] 或 [{label,value}]
    modelValue: { type: [String, Number], default: '' },
  },
  emits: ['update:modelValue', 'change'],
  methods: {
    getValue(item) {
      return item && typeof item === 'object' ? item.value : item;
    },
    getLabel(item) {
      return item && typeof item === 'object' ? item.label : item;
    },
  },
};
</script>
