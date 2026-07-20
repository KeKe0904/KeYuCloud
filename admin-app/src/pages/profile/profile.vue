<template>
  <view class="app">
    <ui-app-bar title="我的" />
    <scroll-view class="app-content" scroll-y>
      <!-- profile card -->
      <view class="card profile-card">
        <view class="avatar" @click="goPath('/pages/admin/system')">
          <image v-if="auth.avatarSrc" :src="auth.avatarSrc" class="avatar-img" mode="aspectFill" />
          <text v-else class="avatar-initial">{{ auth.avatarInitial }}</text>
        </view>
        <view class="profile-info">
          <view class="row gap-8 wrap">
            <text class="profile-name">{{ auth.displayName || '未登录' }}</text>
            <ui-pill variant="brand" :text="auth.roleLabel" />
          </view>
          <view class="profile-sub" v-if="auth.profile">
            最后登录 {{ auth.profile.lastLoginAt || '-' }}
          </view>
          <view class="profile-sub" v-else>
            请先登录
          </view>
        </view>
      </view>

      <!-- 账户管理 -->
      <view class="section-label">账户管理</view>
      <view class="menu-group">
        <view class="menu-item" @click="goPath('/pages/admin/products')">
          <ui-icon name="box" :size="40" />
          <text class="mi-label">商品管理</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/orders')">
          <ui-icon name="file" :size="40" />
          <text class="mi-label">订单管理</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/user-products')">
          <ui-icon name="folder" :size="40" />
          <text class="mi-label">用户产品</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
      </view>

      <!-- 运营管理 -->
      <view class="section-label">运营管理</view>
      <view class="menu-group">
        <view class="menu-item" @click="goTab('/pages/tickets/tickets')">
          <ui-icon name="message-circle-more" :size="40" />
          <text class="mi-label">工单管理</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goTab('/pages/finance/finance')">
          <ui-icon name="box" :size="40" />
          <text class="mi-label">财务管理</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
      </view>

      <!-- 系统配置 -->
      <view class="section-label">系统配置</view>
      <view class="menu-group">
        <view class="menu-item" @click="goPath('/pages/admin/upstream')">
          <ui-icon name="external-link" :size="40" />
          <text class="mi-label">上游配置</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/smtp')">
          <ui-icon name="mail" :size="40" />
          <text class="mi-label">SMTP 配置</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/smtp-templates')">
          <ui-icon name="file" :size="40" />
          <text class="mi-label">SMTP 模板</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/smtp-logs')">
          <ui-icon name="file" :size="40" />
          <text class="mi-label">SMTP 日志</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/sms')">
          <ui-icon name="send-horizontal" :size="40" />
          <text class="mi-label">短信配置</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
      </view>

      <!-- 营销工具 -->
      <view class="section-label">营销工具</view>
      <view class="menu-group">
        <view class="menu-item" @click="goPath('/pages/admin/coupons')">
          <ui-icon name="tag" :size="40" />
          <text class="mi-label">优惠券</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/announcements')">
          <ui-icon name="message-circle-more" :size="40" />
          <text class="mi-label">公告管理</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
      </view>

      <!-- 系统管理 -->
      <view class="section-label">系统管理</view>
      <view class="menu-group">
        <view class="menu-item" @click="goPath('/pages/admin/system')">
          <ui-icon name="settings" :size="40" />
          <text class="mi-label">系统配置</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/admins')">
          <ui-icon name="user" :size="40" />
          <text class="mi-label">管理员列表</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
        <view class="menu-item" @click="goPath('/pages/admin/audit-logs')">
          <ui-icon name="file" :size="40" />
          <text class="mi-label">审计日志</text>
          <ui-icon name="chevron-right" :size="32" />
        </view>
      </view>

      <view class="mt-16">
        <ui-button variant="secondary" block @click="onToggleTheme">
          <ui-icon :name="theme.isDark ? 'sun' : 'moon'" :size="32" />
          {{ theme.isDark ? '切换为亮色' : '切换为暗色' }}
        </ui-button>
      </view>

      <view class="mt-8 mb-12">
        <ui-button variant="danger" block @click="onLogout">
          <ui-icon name="logout" :size="32" />
          退出登录
        </ui-button>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';

export default {
  data() {
    return {
      theme: useThemeStore(),
    };
  },
  computed: {
    auth() { return useAuthStore(); },
  },
  onShow() {
    if (this.auth.isLoggedIn && !this.auth.profile) {
      this.auth.fetchProfile().catch(() => {});
    }
  },
  methods: {
    goPath(path) {
      if (!this.auth.isLoggedIn) {
        uni.reLaunch({ url: '/pages/admin/login' });
        return;
      }
      uni.navigateTo({ url: path });
    },
    goTab(path) {
      uni.switchTab({ url: path });
    },
    onToggleTheme() {
      this.theme.toggle();
      // #ifdef APP-PLUS
      try {
        plus.navigator.setStatusBarStyle(this.theme.isDark ? 'light' : 'dark');
      } catch (e) {}
      // #endif
    },
    onLogout() {
      uni.showModal({
        title: '确认退出',
        content: '确定退出当前账号？',
        success: (res) => {
          if (res.confirm) {
            this.auth.logout();
          }
        },
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 180rpx; }
.profile-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
}
.avatar {
  width: 128rpx; height: 128rpx;
  border-radius: 999rpx;
  background: var(--color-surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: none;
}
.avatar-img { width: 100%; height: 100%; }
.avatar-initial {
  font-size: 56rpx;
  font-weight: 600;
  color: var(--color-text-muted);
}
.profile-info { flex: 1; min-width: 0; }
.profile-name {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--color-text);
}
.profile-sub {
  font-size: 22rpx;
  color: var(--color-text-muted);
  margin-top: 8rpx;
}
</style>
