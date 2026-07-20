import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import './styles/variables.scss';
import './styles/responsive.scss';
import './styles/element-overrides.scss';

const app = createApp(App);

// ============ 全局错误处理器 ============
// 捕获组件渲染/生命周期中的未处理异常，避免白屏且便于诊断
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue Global Error]', err, '\nInfo:', info);
  // 在页面顶部叠加红色诊断条，让用户/开发者直观看到错误
  try {
    const existing = document.getElementById('__vue_error_banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = '__vue_error_banner';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0',
      'background:#ef4444', 'color:#fff', 'padding:8px 16px',
      'font-size:13px', 'font-family:monospace', 'z-index:99999',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)', 'word-break:break-all',
      'max-height:30vh', 'overflow-y:auto',
    ].join(';');
    banner.textContent = `[Vue 错误] ${err instanceof Error ? err.message : String(err)} | 位置: ${info || '未知'}`;
    document.body.appendChild(banner);
    // 15 秒后自动移除
    setTimeout(() => banner.remove(), 15000);
  } catch {}
};

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.mount('#app');
