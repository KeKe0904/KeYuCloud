<script setup lang="ts">
// 品牌标志 —— 使用本地 logo.png（public/logo.png）
// 通过 size 控制显示尺寸，保持宽高比
interface Props {
  size?: number | string;
  // 兼容旧调用（不再使用，仅保留以避免类型错误）
  animated?: boolean;
}

withDefaults(defineProps<Props>(), {
  size: 28,
  animated: false,
});
</script>

<template>
  <img
    src="/logo.png"
    :width="size"
    :height="size"
    alt="Logo"
    class="logo-mark"
    draggable="false"
  />
</template>

<style scoped lang="scss">
.logo-mark {
  display: inline-block;
  vertical-align: middle;
  // 保持宽高比，避免变形
  object-fit: contain;
  // 防止图片被选中和拖拽
  user-select: none;
  -webkit-user-drag: none;
}
</style>
