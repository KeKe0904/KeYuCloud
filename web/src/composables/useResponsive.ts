// 响应式工具 composable：监听窗口尺寸并提供语义化状态
import { ref, onMounted, onUnmounted } from 'vue';

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'wide';

const BREAKPOINTS = {
  sm: 768,
  md: 992,
  lg: 1200,
};

export function useResponsive() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const device = ref<DeviceType>('desktop');
  const isMobile = ref(false);
  const isTablet = ref(false);
  const isDesktop = ref(true);

  function update() {
    if (typeof window === 'undefined') return;
    const w = window.innerWidth;
    width.value = w;
    if (w < BREAKPOINTS.sm) {
      device.value = 'mobile';
      isMobile.value = true;
      isTablet.value = false;
      isDesktop.value = false;
    } else if (w < BREAKPOINTS.md) {
      device.value = 'tablet';
      isMobile.value = false;
      isTablet.value = true;
      isDesktop.value = false;
    } else if (w < BREAKPOINTS.lg) {
      device.value = 'desktop';
      isMobile.value = false;
      isTablet.value = false;
      isDesktop.value = true;
    } else {
      device.value = 'wide';
      isMobile.value = false;
      isTablet.value = false;
      isDesktop.value = true;
    }
  }

  let mounted = false;
  onMounted(() => {
    mounted = true;
    update();
    window.addEventListener('resize', update, { passive: true });
  });
  onUnmounted(() => {
    if (mounted) {
      window.removeEventListener('resize', update);
      mounted = false;
    }
  });

  return { width, device, isMobile, isTablet, isDesktop };
}
