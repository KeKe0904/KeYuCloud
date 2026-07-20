<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useAdminStore } from '@/stores/admin';
import { adminApi } from '@/api/admin';
import { useResponsive } from '@/composables/useResponsive';

const router = useRouter();
const route = useRoute();
const theme = useThemeStore();
// 管理员资料统一走 admin store：Profile.vue 修改后调用 store.refresh() 即可同步右上角头像/名字
const adminStore = useAdminStore();

const menuCollapse = ref(false);
const mobileSidebarOpen = ref(false);
// 待处理工单数（用于顶栏通知红点，后续可接入实时接口）
const pendingCount = ref(0);
const { isMobile } = useResponsive();

// 兼容旧代码：从 store 派生 profile，避免大改后续逻辑
const profile = computed(() => adminStore.profile);

const activeMenu = computed(() => {
  // 高亮匹配父级菜单
  const path = route.path;
  if (path.startsWith('/admin/smtp')) return '/admin/smtp';
  if (path.startsWith('/admin/users')) return '/admin/users';
  if (path.startsWith('/admin/orders')) return '/admin/orders';
  if (path.startsWith('/admin/user-products')) return '/admin/user-products';
  if (path.startsWith('/admin/tickets')) return '/admin/tickets';
  return path;
});

// 路由切换时关闭移动端抽屉
watch(() => route.path, () => {
  mobileSidebarOpen.value = false;
});

watch(isMobile, (v) => {
  if (!v) {
    mobileSidebarOpen.value = false;
    menuCollapse.value = false;
  }
});

onMounted(async () => {
  // 拉取管理员资料到 store（右上角头像/名字响应式展示）
  await adminStore.refresh();
  // 拉取待处理工单数（用于顶栏通知红点）
  try {
    const res: any = await adminApi.tickets({ status: 'open', page: 1, pageSize: 1 });
    if (res?.success) pendingCount.value = res.data?.total || 0;
  } catch {}
});

function logout() {
  localStorage.removeItem('adminToken');
  router.push('/admin/login');
}

function goTickets() {
  router.push('/admin/tickets');
}

function toggleSidebar() {
  if (isMobile.value) {
    mobileSidebarOpen.value = !mobileSidebarOpen.value;
  } else {
    menuCollapse.value = !menuCollapse.value;
  }
}

const roleLabel = computed(() => {
  if (!profile.value) return '';
  const map: Record<string, string> = {
    SUPER_ADMIN: '超级管理员',
    ADMIN: '管理员',
    OPERATOR: '运营',
    FINANCE: '财务',
    SUPPORT: '客服',
    TECH: '技术',
  };
  return map[profile.value.role] || profile.value.role;
});

// ============ 面包屑 ============
const routeLabelMap: Record<string, string> = {
  '': '仪表盘',
  users: '用户管理',
  products: '商品管理',
  orders: '订单管理',
  'user-products': '用户产品',
  tickets: '工单中心',
  finance: '财务中心',
  upstream: '上游对接',
  smtp: '邮件系统',
  sms: '短信服务',
  coupons: '优惠券',
  announcements: '公告管理',
  system: '系统配置',
  environment: '环境依赖',
  'version-update': '版本更新',
  admins: '管理员',
  profile: '个人资料',
  'audit-logs': '审计日志',
};

const detailLabelMap: Record<string, string> = {
  users: '用户详情',
  orders: '订单详情',
  products: '商品详情',
  tickets: '工单详情',
};

const breadcrumbs = computed<{ label: string; path?: string }[]>(() => {
  const path = route.path.replace(/^\/admin\/?/, '');
  if (!path) return [];
  const segs = path.split('/');
  const items: { label: string; path?: string }[] = [];
  const first = segs[0];
  items.push({
    label: routeLabelMap[first] || first,
    path: first,
  });
  if (segs.length > 1) {
    if (segs[1] === 'templates') items.push({ label: '邮件模板' });
    else if (segs[1] === 'logs') items.push({ label: '发送日志' });
    else items.push({ label: detailLabelMap[first] || '详情' });
  }
  return items;
});
</script>

<template>
  <div class="admin-layout" :class="{ 'is-mobile': isMobile }">
    <!-- PC 端侧边栏 -->
    <aside v-if="!isMobile" class="admin-sidebar" :class="{ collapsed: menuCollapse }">
      <div class="sidebar-brand" @click="router.push('/admin')">
        <LogoMark :size="26" />
        <span v-if="!menuCollapse" class="brand-text font-display">管理后台</span>
      </div>
      <el-scrollbar class="menu-scroll">
        <el-menu
          :default-active="activeMenu"
          :collapse="menuCollapse"
          router
          class="admin-menu"
          unique-opened
        >
          <el-menu-item index="/admin">
            <el-icon><DataLine /></el-icon>
            <span>仪表盘</span>
          </el-menu-item>

          <el-sub-menu index="users-group">
            <template #title>
              <el-icon><User /></el-icon>
              <span>用户管理</span>
            </template>
            <el-menu-item index="/admin/users">用户列表</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="biz-group">
            <template #title>
              <el-icon><Goods /></el-icon>
              <span>商品与订单</span>
            </template>
            <el-menu-item index="/admin/products">商品管理</el-menu-item>
            <el-menu-item index="/admin/orders">订单管理</el-menu-item>
            <el-menu-item index="/admin/user-products">用户产品</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="service-group">
            <template #title>
              <el-icon><ChatLineSquare /></el-icon>
              <span>客户服务</span>
            </template>
            <el-menu-item index="/admin/tickets">工单中心</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="finance-group">
            <template #title>
              <el-icon><Wallet /></el-icon>
              <span>财务中心</span>
            </template>
            <el-menu-item index="/admin/finance">财务总览</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="upstream-group">
            <template #title>
              <el-icon><Connection /></el-icon>
              <span>上游对接</span>
            </template>
            <el-menu-item index="/admin/upstream">雨云 API</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="smtp-group">
            <template #title>
              <el-icon><Message /></el-icon>
              <span>邮件系统</span>
            </template>
            <el-menu-item index="/admin/smtp">SMTP 配置</el-menu-item>
            <el-menu-item index="/admin/smtp/templates">邮件模板</el-menu-item>
            <el-menu-item index="/admin/smtp/logs">发送日志</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="sms-group">
            <template #title>
              <el-icon><ChatLineRound /></el-icon>
              <span>短信服务</span>
            </template>
            <el-menu-item index="/admin/sms">阿里云 PNVS 配置</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="market-group">
            <template #title>
              <el-icon><Discount /></el-icon>
              <span>营销 &amp; 内容</span>
            </template>
            <el-menu-item index="/admin/coupons">优惠券</el-menu-item>
            <el-menu-item index="/admin/announcements">公告管理</el-menu-item>
          </el-sub-menu>

          <el-sub-menu index="system-group">
            <template #title>
              <el-icon><Setting /></el-icon>
              <span>系统管理</span>
            </template>
            <el-menu-item index="/admin/system">系统配置</el-menu-item>
            <el-menu-item index="/admin/environment">环境依赖</el-menu-item>
            <el-menu-item index="/admin/version-update">版本更新</el-menu-item>
            <el-menu-item index="/admin/admins">管理员</el-menu-item>
            <el-menu-item index="/admin/profile">个人资料</el-menu-item>
            <el-menu-item index="/admin/audit-logs">审计日志</el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-scrollbar>
    </aside>

    <!-- 移动端抽屉侧边栏 -->
    <transition name="drawer-slide">
      <div v-if="isMobile && mobileSidebarOpen" class="mobile-mask" @click="mobileSidebarOpen = false">
        <aside class="admin-sidebar mobile-sidebar" @click.stop>
          <div class="sidebar-brand">
            <LogoMark :size="26" />
            <span class="brand-text font-display">管理后台</span>
          </div>
          <el-scrollbar class="menu-scroll">
            <el-menu
              :default-active="activeMenu"
              router
              class="admin-menu"
              unique-opened
            >
              <el-menu-item index="/admin">
                <el-icon><DataLine /></el-icon>
                <span>仪表盘</span>
              </el-menu-item>

              <el-sub-menu index="users-group">
                <template #title>
                  <el-icon><User /></el-icon>
                  <span>用户管理</span>
                </template>
                <el-menu-item index="/admin/users">用户列表</el-menu-item>
              </el-sub-menu>

              <el-sub-menu index="biz-group">
                <template #title>
                  <el-icon><Goods /></el-icon>
                  <span>商品与订单</span>
                </template>
                <el-menu-item index="/admin/products">商品管理</el-menu-item>
                <el-menu-item index="/admin/orders">订单管理</el-menu-item>
                <el-menu-item index="/admin/user-products">用户产品</el-menu-item>
              </el-sub-menu>

              <el-sub-menu index="service-group">
                <template #title>
                  <el-icon><ChatLineSquare /></el-icon>
                  <span>客户服务</span>
                </template>
                <el-menu-item index="/admin/tickets">工单中心</el-menu-item>
              </el-sub-menu>

              <el-sub-menu index="finance-group">
                <template #title>
                  <el-icon><Wallet /></el-icon>
                  <span>财务中心</span>
                </template>
                <el-menu-item index="/admin/finance">财务总览</el-menu-item>
              </el-sub-menu>

              <el-sub-menu index="upstream-group">
                <template #title>
                  <el-icon><Connection /></el-icon>
                  <span>上游对接</span>
                </template>
                <el-menu-item index="/admin/upstream">雨云 API</el-menu-item>
              </el-sub-menu>

              <el-sub-menu index="smtp-group">
                <template #title>
                  <el-icon><Message /></el-icon>
                  <span>邮件系统</span>
                </template>
                <el-menu-item index="/admin/smtp">SMTP 配置</el-menu-item>
                <el-menu-item index="/admin/smtp/templates">邮件模板</el-menu-item>
                <el-menu-item index="/admin/smtp/logs">发送日志</el-menu-item>
              </el-sub-menu>

              <el-sub-menu index="sms-group">
                <template #title>
                  <el-icon><ChatLineRound /></el-icon>
                  <span>短信服务</span>
                </template>
                <el-menu-item index="/admin/sms">阿里云 PNVS 配置</el-menu-item>
              </el-sub-menu>

              <el-sub-menu index="market-group">
                <template #title>
                  <el-icon><Discount /></el-icon>
                  <span>营销 &amp; 内容</span>
                </template>
                <el-menu-item index="/admin/coupons">优惠券</el-menu-item>
                <el-menu-item index="/admin/announcements">公告管理</el-menu-item>
              </el-sub-menu>

              <el-sub-menu index="system-group">
            <template #title>
              <el-icon><Setting /></el-icon>
              <span>系统管理</span>
            </template>
            <el-menu-item index="/admin/system">系统配置</el-menu-item>
            <el-menu-item index="/admin/environment">环境依赖</el-menu-item>
            <el-menu-item index="/admin/version-update">版本更新</el-menu-item>
            <el-menu-item index="/admin/admins">管理员</el-menu-item>
            <el-menu-item index="/admin/profile">个人资料</el-menu-item>
            <el-menu-item index="/admin/audit-logs">审计日志</el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-scrollbar>
    </aside>
      </div>
    </transition>

    <!-- 主区 -->
    <div class="admin-main">
      <header class="admin-topbar">
        <div class="topbar-left">
          <el-button link class="menu-toggle" @click="toggleSidebar" aria-label="切换菜单">
            <el-icon size="20">
              <Fold v-if="!isMobile && !menuCollapse" />
              <Expand v-else-if="!isMobile" />
              <Menu v-else />
            </el-icon>
          </el-button>
          <nav class="breadcrumb" aria-label="面包屑">
            <span class="breadcrumb-crumb is-root">管理后台</span>
            <template v-for="(item, idx) in breadcrumbs" :key="idx">
              <span class="breadcrumb-sep">/</span>
              <span
                v-if="item.path && idx < breadcrumbs.length - 1"
                class="breadcrumb-crumb is-link"
                @click="router.push(`/admin/${item.path}`)"
              >{{ item.label }}</span>
              <span v-else class="breadcrumb-crumb is-current">{{ item.label }}</span>
            </template>
          </nav>
        </div>
        <div class="topbar-right">
          <button v-if="theme.allowSwitch" type="button" class="theme-toggle" @click="theme.toggle()" aria-label="切换主题">
            <ThemeToggleIcon :is-dark="theme.isDark" :size="16" />
          </button>
          <button type="button" class="icon-action" @click="goTickets" aria-label="待处理工单">
            <el-icon :size="18"><Bell /></el-icon>
            <span v-if="pendingCount > 0" class="notif-dot"></span>
          </button>
          <el-dropdown>
            <span class="admin-info">
              <el-avatar :size="32" class="admin-avatar" :src="adminStore.avatarSrc || undefined">
                <span v-if="!adminStore.avatarSrc">{{ adminStore.avatarInitial }}</span>
              </el-avatar>
              <span class="admin-meta">
                <span class="admin-name">{{ adminStore.displayName }}</span>
                <span class="admin-role">{{ roleLabel }}</span>
              </span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/admin')">控制台</el-dropdown-item>
                <el-dropdown-item divided @click="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-layout {
  display: flex;
  height: 100vh;
  background: transparent;
  max-width: 100vw;
  overflow: hidden;
}

// ============ 侧边栏（苹果玻璃质感）============
.admin-sidebar {
  width: 240px;
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(200%);
  border-right: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.25s var(--ease-out-expo);
  overflow: hidden;

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
  width: 260px;
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

.sidebar-brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0;

  .brand-text {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    letter-spacing: 0.2px;
  }
}

.menu-scroll {
  flex: 1;
  min-height: 0;
}

// ============ 菜单简约化 ============
.admin-menu {
  border-right: none;
  background: transparent;
  padding: 8px 0;

  // 顶层菜单项（仪表盘）
  :deep(.el-menu-item) {
    height: 38px;
    line-height: 38px;
    padding: 0 16px !important;
    margin: 2px 8px;
    border-radius: 4px;
    font-size: 13px;
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

  // 子菜单分组标题 —— eyebrow 风格（小号 / 字距 / 三级灰）
  :deep(.el-sub-menu__title) {
    height: 32px;
    line-height: 32px;
    margin: 12px 8px 4px;
    padding: 0 16px !important;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    color: var(--text-tertiary);
    text-transform: uppercase;

    .el-icon {
      color: var(--text-tertiary);
      font-size: 13px;
    }

    &:hover {
      background: transparent;
      color: var(--text-secondary);
    }
  }

  // 子菜单展开后的容器
  :deep(.el-sub-menu .el-menu) {
    background: transparent;
  }

  // 子菜单内的菜单项
  :deep(.el-sub-menu .el-menu-item) {
    height: 36px;
    line-height: 36px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    padding-left: 40px !important;

    &.is-active {
      color: var(--text-gold);

      .el-icon {
        color: var(--text-gold);
      }
    }
  }
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
.admin-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
}

.admin-topbar {
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

// 简约化汉堡按钮
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
.notif-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sakura);
  box-shadow: 0 0 0 2px var(--bg-elevated);
}

.admin-info {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 8px;
  transition: background 0.2s var(--ease-out-expo);

  &:hover {
    background: var(--bg-hover);
  }

  @include mobile {
    padding: 4px 6px;
    gap: 6px;
  }
}

.admin-avatar {
  background: var(--gradient-gold);
  color: var(--text-inverse);
  font-weight: 600;
}

.admin-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;

  .admin-name {
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 管理员角色徽章：简约化 —— 纯文字 + 金色描边
  .admin-role {
    display: inline-block;
    margin-top: 2px;
    padding: 0 6px;
    border: 1px solid var(--gold-300);
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--text-gold);
    background: transparent;
    line-height: 1.4;
  }

  @include mobile {
    display: none;
  }
}

.admin-content {
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
