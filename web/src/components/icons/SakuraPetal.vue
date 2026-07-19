<script setup lang="ts">
// 樱花花瓣装饰 —— 5 瓣花，简约线条（克制使用）
// 去 AI 味：静态显示，无旋转动画
interface Props {
  size?: number | string;
  count?: number;
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
  count: 3,
});
</script>

<template>
  <span class="sakura-cluster" aria-hidden="true">
    <span
      v-for="i in props.count"
      :key="i"
      class="sakura-item"
      :style="{
        width: typeof props.size === 'number' ? `${props.size}px` : props.size,
        height: typeof props.size === 'number' ? `${props.size}px` : props.size,
      }"
    >
      <svg
        :width="props.size"
        :height="props.size"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="sakura-flower"
      >
        <!-- 5 瓣花（简约线条，每瓣旋转 72°） -->
        <g
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        >
          <path d="M20 16 C15 12 16 4 20 2 C24 4 25 12 20 16 Z" />
          <path d="M20 16 C15 12 16 4 20 2 C24 4 25 12 20 16 Z" transform="rotate(72 20 20)" />
          <path d="M20 16 C15 12 16 4 20 2 C24 4 25 12 20 16 Z" transform="rotate(144 20 20)" />
          <path d="M20 16 C15 12 16 4 20 2 C24 4 25 12 20 16 Z" transform="rotate(216 20 20)" />
          <path d="M20 16 C15 12 16 4 20 2 C24 4 25 12 20 16 Z" transform="rotate(288 20 20)" />
          <!-- 中心点 -->
          <circle cx="20" cy="20" r="2" />
        </g>
      </svg>
    </span>
  </span>
</template>

<style scoped lang="scss">
.sakura-cluster {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--sakura-soft);
}

.sakura-item {
  display: inline-block;
  line-height: 0;
}

.sakura-flower {
  display: block;
  opacity: 0.7;
}
</style>
