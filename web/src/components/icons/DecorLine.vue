<script setup lang="ts">
// 装饰线条 —— 3 种简约变体（gradient / dashed / solid）
// 去 AI 味：静态显示，无 clip-path 入场动画
interface Props {
  width?: string;
  variant?: 'gradient' | 'dashed' | 'solid';
}

withDefaults(defineProps<Props>(), {
  width: '100%',
  variant: 'gradient',
});
</script>

<template>
  <div
    class="decor-line"
    :class="`decor-line--${variant}`"
    :style="{ width }"
    aria-hidden="true"
  ></div>
</template>

<style scoped lang="scss">
.decor-line {
  height: 1px;
  width: 100%;
}

// 渐变：透明 → 中性灰 → 透明（淡化）
.decor-line--gradient {
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--border-base) 25%,
    var(--border-base) 75%,
    transparent 100%
  );
}

// 虚线：中性灰 dashed
.decor-line--dashed {
  height: 0;
  border-top: 1px dashed var(--border-base);
  background: transparent;
}

// 实线：1px 中性灰细线
.decor-line--solid {
  background: var(--gold-300);
}
</style>
