<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { adminApi } from '@/api/admin';
import { useThemeStore } from '@/stores/theme';

const router = useRouter();
const route = useRoute();
const theme = useThemeStore();

// 登录表单
const loginForm = reactive({
  username: '',
  password: '',
  remember: true,
});

const loading = ref(false);
const formRef = ref<FormInstance>();

// 表单校验规则
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 位', trigger: 'blur' },
  ],
};

// 提交登录
const onSubmit = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      const res: any = await adminApi.login({
        username: loginForm.username.trim(),
        password: loginForm.password,
      });
      if (res?.success && res.data?.token) {
        localStorage.setItem('adminToken', res.data.token);
        if (loginForm.remember) {
          localStorage.setItem('adminRememberUser', loginForm.username);
        } else {
          localStorage.removeItem('adminRememberUser');
        }
        ElMessage.success('登录成功');
        const redirect = (route.query.redirect as string) || '/admin';
        router.replace(redirect);
      } else {
        ElMessage.error(res?.message || '登录失败');
      }
    } catch (e: any) {
      // 错误已由拦截器提示
    } finally {
      loading.value = false;
    }
  });
};

onMounted(() => {
  // 强制黑金主题以符合管理端风格
  theme.setMode('dark');
  const rememberUser = localStorage.getItem('adminRememberUser');
  if (rememberUser) loginForm.username = rememberUser;
});

const goPortal = () => router.push('/');
</script>

<template>
  <div class="admin-login">
    <!-- 右上角樱花装饰（极淡，克制点缀） -->
    <div class="sakura-decor">
      <SakuraPetal :size="32" :count="2" />
    </div>

    <div class="login-card card">
      <!-- 顶部品牌 -->
      <div class="brand">
        <LogoMark :size="36" />
        <h1 class="brand-title font-display">管理后台</h1>
        <p class="brand-sub">管理员登录</p>
      </div>

      <el-form
        ref="formRef"
        :model="loginForm"
        :rules="rules"
        size="large"
        class="login-form"
        @keyup.enter="onSubmit"
      >
        <el-form-item prop="username">
          <label class="eyebrow form-label">用户名</label>
          <el-input
            v-model="loginForm.username"
            placeholder="请输入用户名"
            clearable
          />
        </el-form-item>
        <el-form-item prop="password">
          <label class="eyebrow form-label">密码</label>
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入密码"
            show-password
            clearable
          />
        </el-form-item>

        <div class="form-row">
          <el-checkbox v-model="loginForm.remember">记住我</el-checkbox>
          <el-button link @click="goPortal">返回前台</el-button>
        </div>

        <el-button
          class="btn-gold submit-btn"
          :loading="loading"
          @click="onSubmit"
        >
          {{ loading ? '登录中…' : '登 录' }}
        </el-button>
      </el-form>
    </div>

    <footer class="login-footer">
      © {{ new Date().getFullYear() }} Rainyun Reseller · Admin Console
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

// 入场动画
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
  .login-card {
    animation: none !important;
    opacity: 1 !important;
  }
}

.admin-login {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-base);
  overflow: hidden;
}

// 右上角樱花装饰：极淡，opacity 0.4
.sakura-decor {
  position: absolute;
  top: 32px;
  right: 32px;
  opacity: 0.4;
  pointer-events: none;
  z-index: 0;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  padding: 40px 32px;
  animation: fadeUp 0.6s var(--ease-out-expo);
}

.brand {
  text-align: center;
  margin-bottom: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  .brand-title {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.2px;
  }

  .brand-sub {
    margin: 0;
    font-size: 13px;
    color: var(--text-tertiary);
    letter-spacing: 0.3px;
  }
}

.login-form {
  // 表单标签：eyebrow 风格
  .form-label {
    display: block;
    margin-bottom: 6px;
  }

  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  :deep(.el-input__wrapper) {
    background: var(--bg-base);
    border: 1px solid var(--border-base);
    box-shadow: none;
    border-radius: 4px;
    transition: border-color 0.2s var(--ease-out-expo);

    &:hover {
      border-color: var(--gold-300);
    }

    &.is-focus {
      border-color: var(--gold-400);
      box-shadow: var(--focus-ring);
    }
  }
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;

  :deep(.el-checkbox__label) {
    font-size: 13px;
    color: var(--text-secondary);
  }
}

.submit-btn {
  width: 100%;
  height: 44px;
  font-size: 14px;
  letter-spacing: 4px;
}

.login-footer {
  position: relative;
  z-index: 1;
  margin-top: 32px;
  font-size: 12px;
  color: var(--text-tertiary);
  letter-spacing: 0.5px;
  font-family: 'JetBrains Mono', monospace;
}

// ===== 响应式适配 =====
@include mobile {
  .admin-login { padding: 16px; }
  .login-card {
    max-width: 100%;
    padding: 32px 20px;
  }
  .brand {
    margin-bottom: 24px;
    .brand-title { font-size: 22px; }
  }
  .submit-btn { height: 42px; }
  .sakura-decor {
    top: 20px;
    right: 20px;
  }
}
</style>
