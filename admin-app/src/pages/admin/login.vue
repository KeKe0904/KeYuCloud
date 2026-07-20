<template>
  <view class="app login-bg">
    <view class="login-wrap">
      <view class="login-card">
        <view class="brand-block">
          <view class="brand-logo">
            <ui-icon name="cloud" :size="56" />
          </view>
          <view class="brand-name serif">柯羽云</view>
          <view class="brand-sub">管理后台</view>
        </view>

        <view class="field">
          <ui-field
            v-model="form.username"
            placeholder="请输入用户名或手机号"
            label="账号"
            :required="true"
          />
        </view>

        <view class="field">
          <ui-field
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            label="密码"
            :required="true"
            suffix="eye"
            :input-class="showPassword ? 'transparent' : ''"
            @suffix-click="togglePassword"
          />
        </view>

        <ui-button class="mt-8" block :disabled="loading" @click="onLogin">
          {{ loading ? '登录中...' : '登录' }}
        </ui-button>

        <view class="text-center text-xs text-muted mt-16">
          忘记密码？联系超级管理员
        </view>

        <view class="demo-tip">
          <ui-icon name="circle-question-mark" :size="24" />
          <text>Mock 模式已开启，任意账号密码均可登录</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { useAuthStore } from '../../store/auth';

export default {
  data() {
    return {
      form: { username: 'admin', password: 'admin123' },
      showPassword: false,
      loading: false,
    };
  },
  onShow() {
    // #ifdef APP-PLUS
    const sysInfo = uni.getSystemInfoSync();
    plus.navigator.setStatusBarStyle('dark');
    plus.navigator.setStatusBarBackground('#ffffff');
    // #endif
  },
  methods: {
    togglePassword() {
      this.showPassword = !this.showPassword;
    },
    async onLogin() {
      if (!this.form.username || !this.form.password) {
        uni.showToast({ title: '请输入账号和密码', icon: 'none' });
        return;
      }
      this.loading = true;
      try {
        const auth = useAuthStore();
        await auth.login(this.form);
        await auth.fetchProfile();
        uni.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          uni.switchTab({ url: '/pages/dashboard/dashboard' });
        }, 400);
      } catch (e) {
        if (!e.handled) {
          uni.showToast({ title: e.message || '登录失败', icon: 'none' });
        }
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.login-bg {
  background: var(--color-surface-muted);
  padding-top: var(--status-bar-height);
  min-height: 100vh;
}
.login-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 48rpx 32rpx;
}
.login-card {
  width: 100%;
  max-width: 720rpx;
  background: var(--color-surface);
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 64rpx 40rpx 40rpx;
  box-shadow: var(--shadow-sm);
}
.brand-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 56rpx;
}
.brand-logo {
  width: 112rpx;
  height: 112rpx;
  border-radius: 28rpx;
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.brand-name {
  font-size: 56rpx;
  letter-spacing: .02em;
  color: var(--color-text);
}
.brand-sub {
  font-size: 24rpx;
  color: var(--color-text-muted);
  margin-top: 4rpx;
}
.demo-tip {
  margin-top: 32rpx;
  padding: 20rpx 24rpx;
  background: var(--color-brand-subtle);
  border: 2rpx solid var(--color-brand-border);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 22rpx;
  color: var(--color-text-muted);
}
</style>
