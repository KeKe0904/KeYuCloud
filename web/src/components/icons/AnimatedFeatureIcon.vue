<script setup lang="ts">
// 特性图标 —— 4 种静态简约线条图标（cpu / network / billing / service）
// 去 AI 味：stroke-width 1.5，linecap round，颜色 currentColor
type FeatureType = 'cpu' | 'network' | 'billing' | 'service';

interface Props {
  type: FeatureType;
  size?: number | string;
}

withDefaults(defineProps<Props>(), {
  size: 48,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="feature-icon"
    :class="`feature-icon--${type}`"
    aria-hidden="true"
  >
    <!-- ============ CPU 方形芯片 + 引脚 ============ -->
    <g
      v-if="type === 'cpu'"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    >
      <!-- 引脚（8 条） -->
      <path d="M13 6 V10 M19 6 V10 M13 22 V26 M19 22 V26 M6 13 H10 M6 19 H10 M22 13 H26 M22 19 H26" />
      <!-- 芯片主体（方形） -->
      <rect x="10" y="10" width="12" height="12" />
    </g>

    <!-- ============ Network 3 节点 + 连线 ============ -->
    <g
      v-else-if="type === 'network'"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    >
      <!-- 连线 -->
      <path d="M16 7 L8 23" />
      <path d="M16 7 L24 23" />
      <path d="M8 23 L24 23" />
      <!-- 节点（小方块） -->
      <rect x="14" y="5" width="4" height="4" fill="currentColor" stroke="none" />
      <rect x="6" y="21" width="4" height="4" fill="currentColor" stroke="none" />
      <rect x="22" y="21" width="4" height="4" fill="currentColor" stroke="none" />
    </g>

    <!-- ============ Billing 圆形 + 4 个刻度 ============ -->
    <g
      v-else-if="type === 'billing'"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    >
      <!-- 外圆 -->
      <circle cx="16" cy="16" r="10" />
      <!-- 4 个刻度（上/右/下/左） -->
      <line x1="16" y1="8" x2="16" y2="10" />
      <line x1="24" y1="16" x2="22" y2="16" />
      <line x1="16" y1="24" x2="16" y2="22" />
      <line x1="8" y1="16" x2="10" y2="16" />
      <!-- 中心点 -->
      <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none" />
    </g>

    <!-- ============ Service 耳机轮廓 ============ -->
    <g
      v-else-if="type === 'service'"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    >
      <!-- 头梁 -->
      <path d="M9 15 L9 14 Q9 6 16 6 Q23 6 23 14 L23 15" />
      <!-- 左右耳罩 -->
      <rect x="6" y="13" width="5" height="9" />
      <rect x="21" y="13" width="5" height="9" />
    </g>
  </svg>
</template>

<style scoped lang="scss">
.feature-icon {
  color: var(--gold-500);
  display: inline-block;
  vertical-align: middle;
}
</style>
