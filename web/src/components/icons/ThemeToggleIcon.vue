<script setup lang="ts">
// 主题切换图标 —— 简约太阳 ↔ 月亮
// 太阳：中心圆 + 8 条射线；月亮：mask 切出月牙
// 切换：简单的 opacity 淡入淡出（去 AI 味）
interface Props {
  isDark: boolean;
  size?: number | string;
}

withDefaults(defineProps<Props>(), {
  size: 16,
});

// 唯一 mask ID，避免多实例冲突
const maskId = `theme-toggle-mask-${useId()}`;
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="theme-toggle-icon"
    :class="{ 'is-dark': isDark }"
    role="img"
    :aria-label="isDark ? '当前为暗色模式' : '当前为亮色模式'"
  >
    <defs>
      <mask :id="maskId">
        <rect width="32" height="32" fill="white" />
        <!-- 偏移到右上角的遮罩圆，形成月牙 -->
        <circle cx="20" cy="13" r="6.5" fill="black" />
      </mask>
    </defs>

    <!-- 太阳射线（8 条） -->
    <g
      class="sun-rays"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      fill="none"
    >
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="16" y1="26" x2="16" y2="30" />
      <line x1="2" y1="16" x2="6" y2="16" />
      <line x1="26" y1="16" x2="30" y2="16" />
      <line x1="5.86" y1="5.86" x2="8.7" y2="8.7" />
      <line x1="23.3" y1="23.3" x2="26.14" y2="26.14" />
      <line x1="23.3" y1="8.7" x2="26.14" y2="5.86" />
      <line x1="5.86" y1="26.14" x2="8.7" y2="23.3" />
    </g>

    <!-- 太阳核心（描边圆） -->
    <circle
      class="sun-core"
      cx="16"
      cy="16"
      r="6.5"
      stroke="currentColor"
      stroke-width="1.7"
      fill="none"
    />

    <!-- 月亮主体（填充圆，通过 mask 切出月牙） -->
    <circle
      class="moon-body"
      cx="16"
      cy="16"
      r="7"
      fill="currentColor"
      :mask="`url(#${maskId})`"
    />
  </svg>
</template>

<style scoped lang="scss">
.theme-toggle-icon {
  color: var(--gold-500);
  display: inline-block;
  vertical-align: middle;
}

// 简化切换：只用 opacity 淡入淡出（去射线缩放/旋转）
.sun-rays,
.sun-core,
.moon-body {
  transition: opacity 0.3s var(--ease-out-expo);
}

// 亮色状态：太阳可见，月亮隐藏
.sun-rays,
.sun-core {
  opacity: 1;
}

.moon-body {
  opacity: 0;
}

// 暗色状态：太阳淡出，月亮浮现
.is-dark {
  .sun-rays,
  .sun-core {
    opacity: 0;
  }

  .moon-body {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sun-rays,
  .sun-core,
  .moon-body {
    transition: none;
  }
}
</style>
