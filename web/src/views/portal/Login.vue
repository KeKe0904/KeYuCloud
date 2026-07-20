<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const theme = useThemeStore();

// 表单引用与状态
const formRef = ref<FormInstance>();
const loading = ref(false);
const showPassword = ref(false);

// 表单数据
const form = reactive({
  account: '',
  password: '',
  remember: false,
});

// 校验规则
const rules: FormRules = {
  account: [
    { required: true, message: '请输入手机号或用户名', trigger: 'blur' },
    {
      min: 3,
      max: 32,
      message: '账号长度需在 3~32 位之间',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    {
      min: 6,
      max: 32,
      message: '密码长度需在 6~32 位之间',
      trigger: 'blur',
    },
  ],
};

// 跳转注册
function goRegister() {
  router.push('/register');
}

// 返回首页
function goHome() {
  router.push('/');
}

// 提交登录
async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      const res = await authApi.login({
        account: form.account.trim(),
        password: form.password,
      });
      if (res.success) {
        const { token, user } = res.data;
        auth.setToken(token);
        // 直接设置用户信息，避免再发一次 profile 请求
        auth.user = user;
        // 记住我：将账号存入 localStorage
        if (form.remember) {
          localStorage.setItem('rememberAccount', form.account);
        } else {
          localStorage.removeItem('rememberAccount');
        }
        ElMessage.success('登录成功，欢迎回来');
        // 跳转 redirect 或 /dashboard
        const redirect = route.query.redirect;
        router.push(typeof redirect === 'string' ? redirect : '/dashboard');
      }
    } catch (e) {
      // 错误已由拦截器处理
    } finally {
      loading.value = false;
    }
  });
}

onMounted(() => {
  // 自动填充记住的账号
  const rememberedAccount = localStorage.getItem('rememberAccount');
  if (rememberedAccount) {
    form.account = rememberedAccount;
    form.remember = true;
  }
});
</script>

<template>
  <div class="login-page">
    <!-- 右上角主题切换 -->
    <button v-if="theme.allowSwitch" type="button"
      class="theme-toggle"
      @click="theme.toggle()"
      :title="theme.isDark ? '切换日间' : '切换夜晚'"
      aria-label="切换主题"
    >
      <ThemeToggleIcon :is-dark="theme.isDark" :size="16" />
    </button>

    <!-- 右上角樱花装饰 -->
    <div class="sakura-deco sakura-deco-1">
      <SakuraPetal :size="32" :count="2" />
    </div>
    <!-- 左下角樱花装饰 -->
    <div class="sakura-deco sakura-deco-2">
      <SakuraPetal :size="24" :count="2" />
    </div>

    <div class="auth-card-wrap">
      <div class="auth-card card">
        <!-- 顶部品牌区 -->
        <div class="card-header">
          <LogoMark :size="36" />
          <h1 class="form-title font-display">欢迎回来</h1>
          <p class="form-subtitle">登录您的账户</p>
        </div>

        <!-- 表单区 -->
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          class="auth-form"
          @keyup.enter="handleSubmit"
        >
          <el-form-item prop="account">
            <template #label>
              <span class="field-label eyebrow">手机号 / 用户名</span>
            </template>
            <el-input
              v-model="form.account"
              placeholder="请输入手机号或用户名"
              maxlength="32"
              clearable
            />
          </el-form-item>

          <el-form-item prop="password">
            <template #label>
              <span class="field-label eyebrow">密码</span>
            </template>
            <el-input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              clearable
            >
              <template #suffix>
                <el-icon class="cursor-pointer" @click="showPassword = !showPassword">
                  <View v-if="!showPassword" />
                  <Hide v-else />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <div class="form-options">
            <el-checkbox v-model="form.remember">记住我</el-checkbox>
            <el-link type="info" :underline="false" disabled class="forgot-link">
              忘记密码？
            </el-link>
          </div>

          <button
            type="button"
            class="btn-gold submit-btn"
            :disabled="loading"
            @click="handleSubmit"
          >
            {{ loading ? '登录中...' : '立即登录' }}
          </button>

          <div class="form-footer">
            还没有账户？
            <el-link type="primary" :underline="false" @click="goRegister">
              立即注册
            </el-link>
          </div>
        </el-form>

        <!-- 底部返回 -->
        <div class="card-footer">
          <el-link type="info" :underline="false" @click="goHome">
            <el-icon><ArrowLeft /></el-icon>
            返回首页
          </el-link>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.login-page {
  min-height: calc(100vh - 64px);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: var(--bg-base);
  overflow: hidden;

  @include mobile {
    min-height: calc(100vh - 56px);
    padding: 20px 16px;
    align-items: flex-start;
  }
}

// ============ 主题切换按钮 ============
.theme-toggle {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 10;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-base);
  border-radius: 999px;
  color: var(--gold-500);
  cursor: pointer;
  transition: border-color 0.2s var(--ease-out-expo), color 0.2s var(--ease-out-expo);
  font-family: inherit;

  &:hover {
    border-color: var(--gold-400);
    color: var(--text-gold);
  }

  @include mobile {
    top: 16px;
    right: 16px;
  }
}

// ============ 樱花装饰 ============
.sakura-deco {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
  color: var(--sakura-soft);
}

.sakura-deco-1 {
  top: 80px;
  right: 80px;

  @include mobile {
    top: 60px;
    right: 40px;
  }
}

.sakura-deco-2 {
  bottom: 80px;
  left: 80px;

  @include mobile {
    bottom: 40px;
    left: 40px;
  }
}

// ============ 登录卡 ============
.auth-card-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  animation: fadeUp 0.6s var(--ease-out-expo) backwards;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-card-wrap {
    animation: none;
  }
}

.auth-card {
  padding: 40px 32px;

  @include mobile {
    padding: 32px 24px;
  }
}

.card-header {
  text-align: center;
  margin-bottom: 28px;
  color: var(--gold-500);

  .form-title {
    font-size: 24px;
    font-weight: 600;
    margin: 16px 0 6px;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .form-subtitle {
    font-size: 13px;
    color: var(--text-tertiary);
    margin: 0;
  }
}

// ============ 表单 ============
.auth-form {
  width: 100%;

  :deep(.el-form-item__label) {
    padding-bottom: 6px;
    line-height: 1.4;
  }

  :deep(.el-input__wrapper) {
    border-radius: 4px;
  }
}

.field-label {
  color: var(--text-tertiary);
}

.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
  margin-top: -8px;

  .forgot-link {
    font-size: 13px;
  }
}

.submit-btn {
  width: 100%;
  height: 44px;
  font-size: 14px;
  letter-spacing: 0.5px;
  font-family: inherit;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.form-footer {
  text-align: center;
  margin-top: 20px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.card-footer {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border-base);
  text-align: center;

  :deep(.el-link) {
    font-size: 12px;
  }
}
</style>
