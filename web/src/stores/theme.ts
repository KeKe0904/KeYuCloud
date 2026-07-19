import { defineStore } from 'pinia';
import http from '@/api/http';

type ThemeMode = 'light' | 'dark' | 'auto';

// 用户手动切换过的标记：localStorage 有 'theme' 键视为已手动设置
// 用户未手动切换时，使用后端配置的 default_theme
function readLocalMode(): ThemeMode | null {
  const v = localStorage.getItem('theme');
  if (v === 'light' || v === 'dark' || v === 'auto') return v;
  return null;
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    // 用户手动选择（localStorage 持久化）。null 表示用户未手动选择 → 用后端默认
    mode: readLocalMode() as ThemeMode | null,
    // 后端配置的默认主题（admin → 系统配置 → 主题设置）
    defaultMode: 'auto' as ThemeMode,
    // 是否允许用户切换主题（后端 allow_theme_switch）
    allowSwitch: true,
    systemPrefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    // 是否已从后端拉取过配置
    loaded: false,
  }),
  getters: {
    // 实际生效的主题模式（用户手动选择 > 后端默认 > auto）
    effectiveMode(): ThemeMode {
      if (!this.allowSwitch) return this.defaultMode;
      return this.mode ?? this.defaultMode;
    },
    isDark(): boolean {
      const m = this.effectiveMode;
      return m === 'dark' || (m === 'auto' && this.systemPrefersDark);
    },
    isLight(): boolean {
      return !this.isDark;
    },
  },
  actions: {
    applyTheme() {
      const theme = this.isDark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      // 同步 Element Plus
      document.documentElement.classList.toggle('dark', this.isDark);
    },
    setMode(mode: ThemeMode) {
      // 若后端禁止切换，忽略
      if (!this.allowSwitch) return;
      this.mode = mode;
      localStorage.setItem('theme', mode);
      this.applyTheme();
    },
    toggle() {
      if (!this.allowSwitch) return;
      this.setMode(this.isDark ? 'light' : 'dark');
    },
    init() {
      // 监听系统主题变化
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this.systemPrefersDark = e.matches;
        if (this.effectiveMode === 'auto') this.applyTheme();
      });
      this.applyTheme();
      // 异步从后端拉取默认主题配置（不阻塞首屏）
      this.loadFromBackend();
    },
    // 从后端拉取 default_theme / allow_theme_switch
    // 注：失败时静默回退到本地配置（不影响首屏体验）
    async loadFromBackend() {
      if (this.loaded) return;
      try {
        const res: any = await http.get('/public/configs');
        if (res?.success && res.data) {
          const d = res.data;
          if (d.default_theme === 'light' || d.default_theme === 'dark' || d.default_theme === 'auto') {
            this.defaultMode = d.default_theme;
          }
          // allow_theme_switch 后端存储为 'true'/'false' 字符串
          if (typeof d.allow_theme_switch === 'string') {
            this.allowSwitch = d.allow_theme_switch === 'true' || d.allow_theme_switch === '1';
          }
          this.loaded = true;
          // 用户未手动切换过 → 应用后端默认主题
          // 用户已手动切换过 → 尊重用户选择
          // allowSwitch=false → 强制使用默认主题
          this.applyTheme();
        }
      } catch {
        // 静默失败：使用本地默认（auto）
      }
    },
  },
});
