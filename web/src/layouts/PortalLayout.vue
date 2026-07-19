<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { publicApi } from '@/api/public';
import { useResponsive } from '@/composables/useResponsive';

const router = useRouter();
const route = useRoute();
const theme = useThemeStore();
const auth = useAuthStore();

const siteName = ref('云服分销');
const announcements = ref<any[]>([]);

// 移动端抽屉
const mobileMenuOpen = ref(false);
const { isMobile } = useResponsive();

// 路由切换时自动关闭移动端菜单
watch(() => route.path, () => {
  mobileMenuOpen.value = false;
});

onMounted(async () => {
  try {
    const [info, annRes] = await Promise.all([publicApi.siteInfo(), publicApi.announcements()]);
    if (info.success) siteName.value = info.data.siteName;
    if (annRes.success) announcements.value = annRes.data || [];
  } catch {}
});

function goLogin() {
  router.push('/login');
}
function goRegister() {
  router.push('/register');
}
function goDashboard() {
  router.push('/dashboard');
}
function logout() {
  auth.logout();
  router.push('/');
}
</script>

<template>
  <div class="portal-layout" :class="{ 'is-mobile': isMobile }">
    <!-- 顶部导航 -->
    <header class="portal-header">
      <div class="header-inner">
        <div class="logo" @click="router.push('/')">
          <LogoMark :size="28" />
          <span class="logo-text font-display">{{ siteName }}</span>
        </div>

        <!-- PC 端导航 -->
        <nav v-if="!isMobile" class="nav">
          <router-link to="/" class="nav-link">首页</router-link>
          <router-link to="/products" class="nav-link">云服务器</router-link>
          <a href="#" class="nav-link" @click.prevent>帮助文档</a>
        </nav>

        <div class="header-right">
          <button v-if="theme.allowSwitch" type="button"
            class="icon-btn theme-btn"
            @click="theme.toggle()"
            :title="theme.isDark ? '切换日间' : '切换夜晚'"
            aria-label="切换主题"
          >
            <ThemeToggleIcon :is-dark="theme.isDark" :size="16" />
          </button>

          <!-- PC 端：直接显示登录/注册按钮 -->
          <template v-if="!isMobile">
            <template v-if="auth.isLoggedIn">
              <button type="button" class="btn-outline" @click="goDashboard">用户中心</button>
              <button type="button" class="btn-outline" @click="logout">退出</button>
            </template>
            <template v-else>
              <button type="button" class="btn-outline" @click="goLogin">登录</button>
              <button type="button" class="btn-gold" @click="goRegister">注册</button>
            </template>
          </template>

          <!-- 移动端：汉堡按钮 -->
          <button type="button"
            v-if="isMobile"
            class="icon-btn hamburger"
            :class="{ 'is-open': mobileMenuOpen }"
            @click="mobileMenuOpen = !mobileMenuOpen"
            aria-label="切换菜单"
          >
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
          </button>
        </div>
      </div>
    </header>

    <!-- 公告条 -->
    <div v-if="announcements.length" class="announcement-bar">
      <span class="announcement-text">{{ announcements[0].title }}：{{ announcements[0].content }}</span>
    </div>

    <!-- 移动端抽屉菜单 -->
    <transition name="drawer-fade">
      <div v-if="isMobile && mobileMenuOpen" class="mobile-mask" @click="mobileMenuOpen = false">
        <div class="mobile-drawer" @click.stop>
          <nav class="mobile-nav">
            <router-link to="/" class="mobile-nav-link">首页</router-link>
            <router-link to="/products" class="mobile-nav-link">云服务器</router-link>
            <a href="#" class="mobile-nav-link" @click.prevent>帮助文档</a>
          </nav>
          <div class="mobile-divider"></div>
          <div class="mobile-actions">
            <template v-if="auth.isLoggedIn">
              <button type="button" class="btn-outline mobile-btn" @click="goDashboard">用户中心</button>
              <button type="button" class="btn-gold mobile-btn" @click="logout">退出登录</button>
            </template>
            <template v-else>
              <button type="button" class="btn-outline mobile-btn" @click="goLogin">登录</button>
              <button type="button" class="btn-gold mobile-btn" @click="goRegister">注册</button>
            </template>
          </div>
        </div>
      </div>
    </transition>

    <!-- 内容区 -->
    <main class="portal-main">
      <router-view />
    </main>

    <!-- 底部 -->
    <footer class="portal-footer">
      <div class="footer-inner">
        <div class="footer-col footer-brand">
          <div class="footer-brand-row">
            <LogoMark :size="20" />
            <h4 class="font-display">{{ siteName }}</h4>
          </div>
          <p>高性能云服务器分销平台</p>
        </div>
        <div class="footer-col">
          <h5>产品</h5>
          <router-link to="/products">云服务器</router-link>
          <a href="#">即将上线：云应用</a>
        </div>
        <div class="footer-col">
          <h5>支持</h5>
          <a href="#">帮助文档</a>
          <a href="#">服务条款</a>
          <a href="#">隐私政策</a>
        </div>
        <div class="footer-col">
          <h5>联系</h5>
          <p>客服工单：登录后提交</p>
        </div>
      </div>
      <div class="footer-bottom font-mono">
        <span>© 2026 {{ siteName }} · Powered by 雨云</span>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.portal-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  max-width: 100vw;
  overflow-x: hidden;
}

// ============ 顶栏（苹果玻璃质感）============
.portal-header {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  border-bottom: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  position: sticky;
  top: 0;
  z-index: 1100;

  .header-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    height: 64px;
    display: flex;
    align-items: center;
    gap: 32px;
    min-width: 0;

    @include mobile {
      padding: 0 16px;
      gap: 12px;
      height: 56px;
    }
  }
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex-shrink: 0;
  min-width: 0;
  color: var(--gold-500);

  .logo-text {
    font-size: 18px;
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: -0.2px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;

    @include mobile {
      font-size: 16px;
    }
  }
}

.nav {
  display: flex;
  gap: 32px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
  padding: 6px 10px;
  border-radius: 6px;
  transition: color 0.2s var(--ease-out-expo), letter-spacing 0.2s var(--ease-out-expo),
    background 0.2s var(--ease-out-expo);

  &:hover,
  &.router-link-active {
    color: var(--gold-500);
    letter-spacing: 0.3px;
    background: var(--glass-bg-subtle);
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

// 圆形图标按钮（主题切换 / 汉堡）
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid var(--border-base);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.2s var(--ease-out-expo), color 0.2s var(--ease-out-expo);
  font-family: inherit;

  &:hover {
    border-color: var(--gold-400);
    color: var(--text-gold);
  }
}

.theme-btn {
  color: var(--gold-500);
}

// 汉堡按钮（3 条横线，1.5px stroke，16x16）
.hamburger {
  flex-direction: column;
  gap: 3px;

  .hamburger-line {
    display: block;
    width: 16px;
    height: 1.5px;
    background: currentColor;
    transition: transform 0.2s var(--ease-out-expo), opacity 0.2s var(--ease-out-expo);
  }

  &.is-open {
    .hamburger-line:nth-child(1) {
      transform: translateY(4.5px) rotate(45deg);
    }
    .hamburger-line:nth-child(2) {
      opacity: 0;
    }
    .hamburger-line:nth-child(3) {
      transform: translateY(-4.5px) rotate(-45deg);
    }
  }
}

// PC 端按钮对齐
.btn-outline,
.btn-gold {
  height: 32px;
  padding: 0 16px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

// ============ 公告条 ============
.announcement-bar {
  background: var(--gold-50);
  border-bottom: 1px solid var(--gold-200);
  padding: 8px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-gold);
  letter-spacing: 0.3px;
  max-width: 100vw;
  overflow: hidden;

  .announcement-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    display: inline-block;
    vertical-align: middle;
  }

  @include mobile {
    padding: 8px 16px;
    font-size: 11px;
  }
}

// ============ 移动端抽屉（玻璃质感）============
.mobile-mask {
  position: fixed;
  inset: 0;
  background: rgba(10, 6, 18, 0.4);
  z-index: 1200;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.mobile-drawer {
  position: absolute;
  top: 0;
  right: 0;
  width: 280px;
  max-width: 80vw;
  height: 100%;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  border-left: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  padding: 24px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  z-index: 1201;
}

.mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mobile-nav-link {
  position: relative;
  display: block;
  padding: 12px 14px 12px 18px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 14px;
  text-align: left;
  transition: color 0.2s var(--ease-out-expo);

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%) scaleY(0);
    width: 2px;
    height: 18px;
    background: var(--gold-400);
    transition: transform 0.2s var(--ease-out-expo);
  }

  &:hover,
  &.router-link-active {
    color: var(--text-gold);

    &::before {
      transform: translateY(-50%) scaleY(1);
    }
  }
}

.mobile-divider {
  height: 1px;
  background: var(--border-base);
  margin: 8px 0;
}

.mobile-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .mobile-btn {
    width: 100%;
    height: 40px;
  }
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.25s var(--ease-out-expo);

  .mobile-drawer {
    transition: transform 0.25s var(--ease-out-expo);
  }
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;

  .mobile-drawer {
    transform: translateX(100%);
  }
}

.portal-main {
  flex: 1;
  min-width: 0;
  width: 100%;
  overflow-x: hidden;
}

// ============ Footer（玻璃质感）============
.portal-footer {
  background: var(--glass-bg-subtle);
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  border-top: 1px solid var(--glass-border);
  margin-top: 80px;

  @include mobile {
    margin-top: 40px;
  }

  .footer-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 64px 24px 32px;
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 48px;

    @include tablet {
      grid-template-columns: 1fr 1fr;
      gap: 32px;
    }

    @include mobile {
      grid-template-columns: 1fr;
      gap: 24px;
      padding: 32px 16px 16px;
    }
  }
}

.footer-col {
  h4 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--text-primary);
  }

  h5 {
    color: var(--text-secondary);
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
  }

  a,
  p {
    display: block;
    color: var(--text-tertiary);
    text-decoration: none;
    font-size: 13px;
    margin-bottom: 8px;
    transition: color 0.2s var(--ease-out-expo);

    &:hover {
      color: var(--text-secondary);
    }
  }
}

.footer-brand {
  .footer-brand-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: var(--gold-500);

    h4 {
      margin: 0;
    }
  }

  p {
    margin: 0;
    max-width: 280px;
    line-height: 1.6;
  }
}

.footer-bottom {
  border-top: 1px solid var(--glass-border);
  padding: 16px 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 11px;
  letter-spacing: 0.5px;

  @include mobile {
    padding: 12px 16px;
  }
}
</style>
