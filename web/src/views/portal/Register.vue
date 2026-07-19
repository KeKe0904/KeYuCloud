<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { authApi } from '@/api/auth';
import { publicApi } from '@/api/public';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();

// 表单引用与状态
const formRef = ref<FormInstance>();
const loading = ref(false);
const sendingCode = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const agreed = ref(false);

// SMTP 是否开启：决定邮箱是否强制必填
const smtpEnabled = ref(false);
onMounted(async () => {
  try {
    const res: any = await publicApi.siteInfo();
    smtpEnabled.value = !!res?.data?.smtpEnabled;
  } catch {
    // 拉取失败保守处理：不强制
  }
});

// 短信验证码倒计时
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function startCountdown() {
  countdown.value = 60;
  countdownTimer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }
  }, 1000);
}

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

// 表单数据
const form = reactive({
  phone: '',
  smsCode: '',
  email: '',
  password: '',
  confirmPassword: '',
  inviteCode: '',
});

// 密码强度计算
const passwordStrength = computed<{ score: number; label: string; color: string }>(() => {
  const pwd = form.password;
  if (!pwd) return { score: 0, label: '', color: '' };

  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10) score++;
  if (pwd.length >= 14) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;

  if (score <= 2) return { score: 1, label: '弱', color: 'var(--danger)' };
  if (score <= 4) return { score: 2, label: '中', color: 'var(--warning)' };
  return { score: 3, label: '强', color: 'var(--success)' };
});

// 两次密码一致校验
const validateConfirmPassword = (rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error('请再次输入密码'));
    return;
  }
  if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'));
  } else {
    callback();
  }
};

// 校验规则
const rules = computed<FormRules>(() => ({
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    {
      pattern: /^1[3-9]\d{9}$/,
      message: '请输入正确的手机号',
      trigger: 'blur',
    },
  ],
  smsCode: [
    { required: true, message: '请输入短信验证码', trigger: 'blur' },
    { len: 6, message: '验证码为 6 位数字', trigger: 'blur' },
  ],
  email: [
    // SMTP 开启时邮箱必填，未开启时选填
    {
      required: smtpEnabled.value,
      message: '系统已开启邮件服务，请填写邮箱地址',
      trigger: 'blur',
    },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    {
      min: 8,
      max: 32,
      message: '密码长度需在 8~32 位之间',
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: 'blur' },
  ],
}));

// 跳转登录
function goLogin() {
  router.push('/login');
}

// 返回首页
function goHome() {
  router.push('/');
}

// 发送短信验证码
async function handleSendCode() {
  if (!/^1[3-9]\d{9}$/.test(form.phone)) {
    ElMessage.warning('请先输入正确的手机号');
    return;
  }
  if (countdown.value > 0) return;
  sendingCode.value = true;
  try {
    const res: any = await authApi.sendSmsCode(form.phone);
    if (res?.success) {
      ElMessage.success('验证码已发送，请查收短信');
      startCountdown();
    }
  } catch (e) {
    // 错误已由拦截器处理
  } finally {
    sendingCode.value = false;
  }
}

// 提交注册
async function handleSubmit() {
  if (!agreed.value) {
    ElMessage.warning('请先阅读并同意《用户服务协议》与《隐私政策》');
    return;
  }
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      const res = await authApi.register({
        phone: form.phone.trim(),
        password: form.password,
        smsCode: form.smsCode.trim(),
        email: form.email.trim() || undefined,
        inviteCode: form.inviteCode.trim() || undefined,
      });
      if (res.success) {
        const { token, user } = res.data;
        auth.setToken(token);
        auth.user = user;
        ElMessage.success('注册成功，欢迎加入');
        router.push('/dashboard');
      }
    } catch (e) {
      // 错误已由拦截器处理
    } finally {
      loading.value = false;
    }
  });
}

// 监听密码变化清空确认密码（防止不一致）
watch(
  () => form.password,
  (newPwd) => {
    if (form.confirmPassword && form.confirmPassword !== newPwd) {
      formRef.value?.validateField('confirmPassword');
    }
  },
);
</script>

<template>
  <div class="register-page">
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
          <h1 class="form-title font-display">创建账户</h1>
          <p class="form-subtitle">使用手机号注册，开启您的云上之旅</p>
        </div>

        <!-- 表单区 -->
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          class="auth-form"
        >
          <el-form-item prop="phone">
            <template #label>
              <span class="field-label eyebrow">手机号</span>
            </template>
            <el-input
              v-model="form.phone"
              placeholder="请输入手机号"
              maxlength="11"
              clearable
            >
              <template #prefix>
                <el-icon><Iphone /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="smsCode">
            <template #label>
              <span class="field-label eyebrow">短信验证码</span>
            </template>
            <div class="sms-code-row">
              <el-input
                v-model="form.smsCode"
                placeholder="请输入 6 位验证码"
                maxlength="6"
                clearable
              >
                <template #prefix>
                  <el-icon><Key /></el-icon>
                </template>
              </el-input>
              <button
                type="button"
                class="sms-btn"
                :disabled="countdown > 0 || sendingCode"
                @click="handleSendCode"
              >
                {{ countdown > 0 ? `${countdown}s` : (sendingCode ? '发送中...' : '获取验证码') }}
              </button>
            </div>
          </el-form-item>

          <el-form-item prop="email">
            <template #label>
              <span class="field-label eyebrow">
                邮箱{{ smtpEnabled ? '' : '（选填）' }}
              </span>
            </template>
            <el-input
              v-model="form.email"
              :placeholder="smtpEnabled ? '请输入邮箱地址' : '绑定后可接收邮件通知'"
              maxlength="80"
              clearable
            >
              <template #prefix>
                <el-icon><Message /></el-icon>
              </template>
            </el-input>
            <div v-if="smtpEnabled" class="field-tip">
              系统已开启邮件服务，邮箱为必填项
            </div>
          </el-form-item>

          <el-form-item prop="password">
            <template #label>
              <span class="field-label eyebrow">密码</span>
            </template>
            <el-input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="8-32 位密码"
              clearable
            >
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
              <template #suffix>
                <el-icon class="cursor-pointer" @click="showPassword = !showPassword">
                  <View v-if="!showPassword" />
                  <Hide v-else />
                </el-icon>
              </template>
            </el-input>
            <!-- 密码强度提示 -->
            <div v-if="form.password" class="strength-meter">
              <div class="strength-bars">
                <div
                  v-for="i in 3"
                  :key="i"
                  class="strength-bar"
                  :class="{ active: i <= passwordStrength.score }"
                  :style="i <= passwordStrength.score ? { background: passwordStrength.color } : {}"
                ></div>
              </div>
              <span class="strength-label" :style="{ color: passwordStrength.color }">
                {{ passwordStrength.label }}
              </span>
            </div>
          </el-form-item>

          <el-form-item prop="confirmPassword">
            <template #label>
              <span class="field-label eyebrow">确认密码</span>
            </template>
            <el-input
              v-model="form.confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="请再次输入密码"
              clearable
            >
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
              <template #suffix>
                <el-icon class="cursor-pointer" @click="showConfirmPassword = !showConfirmPassword">
                  <View v-if="!showConfirmPassword" />
                  <Hide v-else />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="inviteCode">
            <template #label>
              <span class="field-label eyebrow">邀请码（选填）</span>
            </template>
            <el-input
              v-model="form.inviteCode"
              placeholder="如有邀请人请填写"
              clearable
            >
              <template #prefix>
                <el-icon><Ticket /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <!-- 协议同意 -->
          <el-checkbox v-model="agreed" class="agree-checkbox">
            我已阅读并同意
            <el-link type="primary" :underline="false" href="#" @click.prevent>《用户服务协议》</el-link>
            与
            <el-link type="primary" :underline="false" href="#" @click.prevent>《隐私政策》</el-link>
          </el-checkbox>

          <button
            type="button"
            class="btn-gold submit-btn"
            :disabled="loading || !agreed"
            @click="handleSubmit"
          >
            {{ loading ? '注册中...' : '立即注册' }}
          </button>

          <div class="form-footer">
            已有账户？
            <el-link type="primary" :underline="false" @click="goLogin">
              立即登录
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

.register-page {
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

// ============ 注册卡 ============
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
  margin-bottom: 24px;
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

.field-tip {
  margin-top: 6px;
  font-size: 12px;
  color: var(--gold-500);
  line-height: 1.4;
}

// ============ 短信验证码行 ============
.sms-code-row {
  display: flex;
  gap: 8px;
  width: 100%;

  .el-input {
    flex: 1;
  }
}

.sms-btn {
  flex-shrink: 0;
  min-width: 110px;
  padding: 0 16px;
  height: 40px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  color: var(--text-gold);
  background: var(--bg-card);
  border: 1px solid var(--gold-500);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: var(--gold-500);
    color: #fff;
    border-color: var(--gold-500);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: var(--border-base);
    color: var(--text-tertiary);
  }

  @include mobile {
    min-width: 96px;
    font-size: 12px;
    padding: 0 10px;
  }
}

// ============ 密码强度 ============
.strength-meter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;

  .strength-bars {
    display: flex;
    gap: 4px;
    flex: 1;
    max-width: 120px;
  }

  .strength-bar {
    flex: 1;
    height: 3px;
    background: var(--bg-hover);
    border-radius: 2px;
    transition: background 0.3s;
  }

  .strength-label {
    font-weight: 600;
    min-width: 24px;
    font-family: 'JetBrains Mono', monospace;
  }
}

// ============ 协议与按钮 ============
.agree-checkbox {
  margin: 12px 0 20px;
  font-size: 13px;

  :deep(.el-checkbox__label) {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
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
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-base);
  text-align: center;

  :deep(.el-link) {
    font-size: 12px;
  }
}
</style>
