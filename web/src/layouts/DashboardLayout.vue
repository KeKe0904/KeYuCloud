<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { notificationApi } from '@/api/ticket';
import { useResponsive } from '@/composables/useResponsive';

const router = useRouter();
const route = useRoute();
const theme = useThemeStore();
const auth = useAuthStore();

const unreadCount = ref(0);
const menuCollapse = ref(false);
// 移动端抽屉
const mobileSidebarOpen = ref(false);
const { isMobile } = useResponsive();

const activeMenu = computed(() => route.path);

// 路由变化时关闭移动端抽屉
watch(() => route.path, () => {
  mobileSidebarOpen.value = false;
});

// 切换设备时复位
watch(isMobile, (v) => {
  if (!v) {
    mobileSidebarOpen.value = false;
    menuCollapse.value = false;
  }
});

// 面包屑映射（基于路由 path 段）
const routeLabelMap: Record<string, string> = {
  '': '概览',
  orders: '我的订单',
  products: '我的产品',
  tickets: '工单中心',
  finance: '财务中心',
  profile: '账号设置',
  notifications: '消息通知',
};

const detailLabelMap: Record<string, string> = {
  orders: '订单详情',
  products: '产品详情',
  tickets: '工单详情',
};

const breadcrumbs = computed<{ label: string; path?: string }[]>(() => {
  const path = route.path.replace(/^\/dashboard\/?/, '');
  if (!path) return [{ label: '概览' }];
  const segs = path.split('/');
  const items: { label: string; path?: string }[] = [];
  // 一级
  const first = segs[0];
  items.push({
    label: routeLabelMap[first] || first,
    path: first,
  });
  // 二级（详情/新建）
  if (segs.length > 1) {
    if (segs[1] === 'new') {
      items.push({ label: '新建工单' });
    } else {
      items.push({ label: detailLabelMap[first] || '详情' });
    }
  }
  return items;
});

onMounted(async () => {
  if (auth.isLoggedIn) {
    await auth.fetchProfile();
    try {
      const res = await notificationApi.unreadCount();
      unreadCount.value = res.data?.count || 0;
    } catch {}
  }
});

function logout() {
  auth.logout();
  router.push('/');
}

function toggleSidebar() {
  if (isMobile.value) {
    mobileSidebarOpen.value = !mobileSidebarOpen.value;
  } else {
    menuCollapse.value = !menuCollapse.value;
  }
}

function goNotifications() {
  router.push('/dashboard/notifications');
}
</script>

<template>
  <div class="dashboard-layout" :class="{ 'is-mobile': isMobile }">
    <!-- PC 端侧边栏 -->
    <aside v-if="!isMobile" class="sidebar" :class="{ collapsed: menuCollapse }">
      <div class="sidebar-logo" @click="router.push('/dashboard')">
        <LogoMark :size="26" />
        <span v-if="!menuCollapse" class="logo-text font-display">用户中心</span>
      </div>
      <el-menu :default-active="activeMenu" :collapse="menuCollapse" router class="sidebar-menu">
        <el-menu-item index="/dashboard">
          <el-icon><HomeFilled /></el-icon>
          <span>概览</span>
        </el-menu-item>
        <el-menu-item index="/dashboard/orders">
          <el-icon><List /></el-icon>
          <span>我的订单</span>
        </el-menu-item>
        <el-menu-item index="/dashboard/products">
          <el-icon><Monitor /></el-icon>
          <span>我的产品</span>
        </el-menu-item>
        <el-menu-item index="/dashboard/tickets">
          <el-icon><ChatLineSquare /></el-icon>
          <span>工单中心</span>
        </el-menu-item>
        <el-menu-item index="/dashboard/finance">
          <el-icon><Wallet /></el-icon>
          <span>财务中心</span>
        </el-menu-item>
        <el-menu-item index="/dashboard/notifications">
          <el-icon><Bell /></el-icon>
          <span>消息通知</span>
          <el-badge v-if="unreadCount > 0" :value="unreadCount" class="menu-badge" />
        </el-menu-item>
        <el-menu-item index="/dashboard/profile">
          <el-icon><User /></el-icon>
          <span>账号设置</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <!-- 移动端抽屉侧边栏 -->
    <transition name="drawer-slide">
      <div v-if="isMobile && mobileSidebarOpen" class="mobile-mask" @click="mobileSidebarOpen = false">
        <aside class="sidebar mobile-sidebar" @click.stop>
          <div class="sidebar-logo">
            <LogoMark :size="26" />
            <span class="logo-text font-display">用户中心</span>
          </div>
          <el-menu :default-active="activeMenu" router class="sidebar-menu">
            <el-menu-item index="/dashboard">
              <el-icon><HomeFilled /></el-icon>
              <span>概览</span>
            </el-menu-item>
            <el-menu-item index="/dashboard/orders">
              <el-icon><List /></el-icon>
              <span>我的订单</span>
            </el-menu-item>
            <el-menu-item index="/dashboard/products">
              <el-icon><Monitor /></el-icon>
              <span>我的产品</span>
            </el-menu-item>
            <el-menu-item index="/dashboard/tickets">
              <el-icon><ChatLineSquare /></el-icon>
              <span>工单中心</span>
            </el-menu-item>
            <el-menu-item index="/dashboard/finance">
              <el-icon><Wallet /></el-icon>
              <span>财务中心</span>
            </el-menu-item>
            <el-menu-item index="/dashboard/notifications">
              <el-icon><Bell /></el-icon>
              <span>消息通知</span>
              <el-badge v-if="unreadCount > 0" :value="unreadCount" class="menu-badge" />
            </el-menu-item>
            <el-menu-item index="/dashboard/profile">
              <el-icon><User /></el-icon>
              <span>账号设置</span>
            </el-menu-item>
          </el-menu>
        </aside>
      </div>
    </transition>

    <!-- 主区域 -->
    <div class="main-area">
      <header class="topbar">
        <div class="topbar-left">
          <el-button link class="menu-toggle" @click="toggleSidebar" aria-label="切换菜单">
            <el-icon size="20">
              <Fold v-if="!isMobile && !menuCollapse" />
              <Expand v-else-if="!isMobile" />
              <Menu v-else />
            </el-icon>
          </el-button>
          <nav class="breadcrumb" aria-label="面包屑">
            <span class="breadcrumb-crumb is-root">用户中心</span>
            <template v-for="(item, idx) in breadcrumbs" :key="idx">
              <span class="breadcrumb-sep">/</span>
              <span
                v-if="item.path && idx < breadcrumbs.length - 1"
                class="breadcrumb-crumb is-link"
                @click="router.push(`/dashboard/${item.path}`)"
              >{{ item.label }}</span>
              <span v-else class="breadcrumb-crumb is-current">{{ item.label }}</span>
            </template>
          </nav>
        </div>
        <div class="topbar-right">
          <button v-if="theme.allowSwitch" type="button" class="theme-toggle" @click="theme.toggle()" aria-label="切换主题">
            <ThemeToggleIcon :is-dark="theme.isDark" :size="16" />
          </button>
          <button type="button" class="icon-action" @click="goNotifications" aria-label="消息通知">
            <el-icon :size="18"><Bell /></el-icon>
            <span v-if="unreadCount > 0" class="notif-dot"></span>
          </button>
          <el-dropdown>
            <span class="user-info">
              <el-avatar :size="32" class="user-avatar">{{ auth.user?.nickname?.[0] || 'U' }}</el-avatar>
              <span class="user-name">{{ auth.user?.nickname || '用户' }}</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/dashboard/profile')">账号设置</el-dropdown-item>
                <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.dashboard-layout {
  display: flex;
  min-height: 100vh;
  background: transparent;
  max-width: 100vw;
  overflow-x: hidden;
}

// ============ 侧边栏（苹果玻璃质感）============
.sidebar {
  width: 220px;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  border-right: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  transition: width 0.25s var(--ease-out-expo);
  flex-shrink: 0;

  &.collapsed {
    width: 64px;
  }
}

// 移动端抽屉
.mobile-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 240px;
  max-width: 80vw;
  z-index: 1201;
  box-shadow: var(--glass-shadow);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;

  // 顶部 2px 金色渐变线
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--gold-300) 20%,
      var(--gold-400) 50%,
      var(--gold-300) 80%,
      transparent
    );
    z-index: 2;
  }
}

.sidebar-logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--glass-border);

  .logo-text {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    letter-spacing: 0.2px;
  }
}

// ============ 菜单简约化 ============
.sidebar-menu {
  border-right: none;
  padding: 8px 0;
  background: transparent;

  :deep(.el-menu-item) {
    height: 40px;
    line-height: 40px;
    padding: 0 16px !important;
    margin: 2px 8px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
    transition: color 0.2s var(--ease-out-expo), background 0.2s var(--ease-out-expo);

    .el-icon {
      color: var(--text-tertiary);
      transition: color 0.2s var(--ease-out-expo);
    }

    &:hover {
      background: var(--glass-bg-subtle);
      color: var(--text-primary);

      .el-icon {
        color: var(--text-secondary);
      }
    }

    // active：左侧 2px 金线 + 文字/图标变金
    &.is-active {
      background: transparent;
      color: var(--text-gold);
      position: relative;

      .el-icon {
        color: var(--text-gold);
      }

      &::before {
        content: '';
        position: absolute;
        left: -8px;
        top: 8px;
        bottom: 8px;
        width: 2px;
        background: var(--gold-500);
        border-radius: 0 2px 2px 0;
      }
    }
  }
}

.menu-badge {
  margin-left: 8px;
}

// ============ 移动端遮罩 ============
.mobile-mask {
  position: fixed;
  inset: 0;
  background: rgba(10, 6, 18, 0.4);
  z-index: 1200;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: opacity 0.3s var(--ease-out-expo);

  .mobile-sidebar {
    transition: transform 0.3s var(--ease-out-expo);
  }
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;

  .mobile-sidebar {
    transform: translateX(-100%);
  }
}

// ============ 主区域 ============
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar {
  height: 56px;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  border-bottom: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 1100;
  min-width: 0;

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  @include mobile {
    padding: 0 12px;
  }
}

// 简约化汉堡按钮：去掉背景，纯图标
.menu-toggle {
  padding: 4px;
  color: var(--text-secondary);

  &:hover {
    color: var(--text-primary);
    background: transparent;
  }
}

// 面包屑：极简文字 + 斜杠分隔
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-tertiary);
  min-width: 0;

  @include mobile {
    display: none;
  }
}

.breadcrumb-crumb {
  white-space: nowrap;

  &.is-root {
    color: var(--text-tertiary);
  }

  &.is-link {
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.2s var(--ease-out-expo);

    &:hover {
      color: var(--text-gold);
    }
  }

  &.is-current {
    color: var(--text-primary);
    font-weight: 500;
  }
}

.breadcrumb-sep {
  color: var(--border-base);
  font-size: 12px;
}

// 主题切换 / 通知按钮：纯图标
.theme-toggle,
.icon-action {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-secondary);
  transition: color 0.2s var(--ease-out-expo), background 0.2s var(--ease-out-expo);

  &:hover {
    color: var(--text-gold);
    background: var(--bg-hover);
  }
}

// 通知红点：樱花粉（二次元属性，克制点缀）
// 定位到铃铛图标的右上角（图标 18px 居中于 32x32 按钮，约位于 7-25px 区域）
// 用 top:4px right:4px 让红点压在铃铛图标的右上角，符合通知徽标的常规位置
.notif-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sakura);
  box-shadow: 0 0 0 2px var(--bg-elevated);
  z-index: 1;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s var(--ease-out-expo);

  &:hover {
    background: var(--bg-hover);
  }

  @include mobile {
    padding: 4px 6px;
  }
}

.user-avatar {
  background: var(--gradient-gold);
  color: var(--text-inverse);
  font-weight: 600;
}

.user-name {
  font-size: 14px;
  color: var(--text-primary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @include mobile {
    display: none;
  }
}

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  background: transparent;
  min-width: 0;

  @include tablet-down {
    padding: 16px;
  }

  @include mobile {
    padding: 12px;
  }
}
</style>
