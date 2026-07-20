<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { useThemeStore } from './store/theme';
import { useAuthStore } from './store/auth';

onLaunch(() => {
  // 取系统信息 (statusBarHeight / safeArea)
  try {
    const sys = uni.getSystemInfoSync();
    uni.$statusBarHeight = sys.statusBarHeight || 20;
    uni.$safeAreaTop = sys.safeArea ? sys.safeArea.top : 0;
    uni.$safeAreaBottom = sys.safeArea ? sys.safeArea.bottom : 0;
    // 设置全局 CSS 变量 (uni-app 在每个 page 都需要重新设置)
    // 这里通过 globalData 暴露
    getApp().globalData = getApp().globalData || {};
    getApp().globalData.statusBarHeight = sys.statusBarHeight || 20;
  } catch (e) {
    console.warn('getSystemInfoSync failed', e);
  }

  // 初始化主题
  const theme = useThemeStore();
  theme.init();

  // 检查登录状态
  const auth = useAuthStore();
  auth.restore();
});

onShow(() => {});
onHide(() => {});
</script>

<style lang="scss">
@import './styles/global.scss';

/* 全局页面背景 */
page {
  background: var(--color-surface-muted);
}
</style>
