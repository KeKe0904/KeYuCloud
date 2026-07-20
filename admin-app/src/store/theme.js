import { defineStore } from 'pinia';

const STORAGE_KEY = 'admin_theme_mode';

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: uni.getStorageSync(STORAGE_KEY) || 'light', // light | dark
    systemPrefersDark: false,
  }),
  getters: {
    isDark: (s) => s.mode === 'dark',
    isLight: (s) => s.mode === 'light',
  },
  actions: {
    init() {
      this.applyTheme();
    },
    applyTheme() {
      // #ifdef APP-PLUS
      try {
        plus.navigator.setStatusBarStyle(this.isDark ? 'light' : 'dark');
      } catch (e) {}
      // #endif
      // 通过 globalData 通知 page 更新 class
      // 实际生效在 App.vue 与各 page 的 themeClass 上
    },
    setMode(m) {
      this.mode = m;
      uni.setStorageSync(STORAGE_KEY, m);
      this.applyTheme();
    },
    toggle() {
      this.setMode(this.isDark ? 'light' : 'dark');
    },
  },
});
