<template>
  <view class="empty">
    <ui-icon :name="icon" :size="80" />
    <view class="empty-text">
      <slot>{{ text }}</slot>
    </view>
  </view>
</template>

<script>
export default {
  name: 'Empty',
  props: {
    icon: { type: String, default: 'folder' },
    text: { type: String, default: '暂无数据' },
  },
};
</script>
