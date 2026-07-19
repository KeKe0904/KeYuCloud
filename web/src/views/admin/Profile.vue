<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { adminApi } from '@/api/admin';
import { publicApi } from '@/api/public';
import { useAuthStore } from '@/stores/auth';
import { useAdminStore } from '@/stores/admin';
import dayjs from 'dayjs';

const authStore = useAuthStore();
// 管理员资料 store：保存后同步右上角头像/名字（任务 8/9）
const adminStore = useAdminStore();

const loading = ref(false);
const saving = ref(false);
const changingPwd = ref(false);
const fetchingQq = ref(false);

// SMTP 是否开启：管理员在 SMTP 开启时必须绑定邮箱
const smtpEnabled = ref(false);

const profileFormRef = ref<FormInstance>();
const pwdFormRef = ref<FormInstance>();

// 角色映射
const roleMap: Record<string, { label: string; cls: string; desc: string }> = {
  SUPER_ADMIN: { label: '超级管理员', cls: 'is-danger', desc: '拥有系统全部权限' },
  ADMIN: { label: '管理员', cls: 'is-warning', desc: '大部分管理权限' },
  OPERATOR: { label: '运营', cls: 'is-success', desc: '商品/订单/用户运营' },
  FINANCE: { label: '财务', cls: 'is-info', desc: '财务/退款审批' },
  SUPPORT: { label: '客服', cls: 'is-default', desc: '工单/客户服务' },
  TECH: { label: '技术', cls: 'is-info', desc: '系统技术运维' },
};

const getRoleLabel = (r: string) => roleMap[r]?.label || r;
const getRoleCls = (r: string) => roleMap[r]?.cls || 'is-default';

// 个人资料表单
const profile = reactive({
  id: 0,
  username: '',
  nickname: '',
  email: '',
  qq: '' as string | null,
  avatarUrl: '' as string | null,
  role: '',
  status: '',
  lastLoginAt: '' as string | null,
  lastLoginIp: '' as string | null,
  createdAt: '' as string | null,
});

const profileEdit = reactive({
  nickname: '',
  email: '',
  qq: '',
});

// 头像预览：优先 QQ 头像 → avatarUrl → 默认首字母
const avatarSrc = computed(() => {
  if (profile.qq) {
    return `https://q1.qlogo.cn/g?b=qq&nk=${profile.qq}&s=140`;
  }
  if (profile.avatarUrl) return profile.avatarUrl;
  return '';
});

const avatarInitial = computed(() => {
  return (profile.nickname || profile.username || '?').charAt(0).toUpperCase();
});

const profileRules = computed<FormRules>(() => ({
  nickname: [
    { max: 32, message: '昵称最多 32 个字符', trigger: 'blur' },
  ],
  email: [
    // SMTP 开启时管理员必须绑定邮箱
    {
      required: smtpEnabled.value,
      message: '系统已开启邮件服务，管理员必须绑定邮箱',
      trigger: 'blur',
    },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' },
    { max: 128, message: '邮箱最多 128 个字符', trigger: 'blur' },
  ],
  qq: [
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value && !/^\d{4,12}$/.test(value)) {
          callback(new Error('QQ 号应为 4-12 位数字'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
}));

// 修改密码表单
const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const pwdRules: FormRules = {
  oldPassword: [
    { required: true, message: '请输入原密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6-32 位', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6-32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value !== pwdForm.newPassword) {
          callback(new Error('两次输入的密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

const formatTime = (t: string | null): string => {
  if (!t) return '—';
  return dayjs(t).format('YYYY-MM-DD HH:mm:ss');
};

// 加载当前管理员信息
const loadProfile = async () => {
  loading.value = true;
  try {
    const res: any = await adminApi.profile();
    if (res?.success) {
      const d = res.data;
      profile.id = d.id;
      profile.username = d.username;
      profile.nickname = d.nickname || '';
      profile.email = d.email || '';
      profile.qq = d.qq || '';
      profile.avatarUrl = d.avatarUrl || '';
      profile.role = d.role;
      profile.status = d.status;
      profile.lastLoginAt = d.lastLoginAt;
      profile.lastLoginIp = d.lastLoginIp;
      profile.createdAt = d.createdAt;
      // 同步到编辑表单
      profileEdit.nickname = profile.nickname;
      profileEdit.email = profile.email;
      profileEdit.qq = profile.qq || '';
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载个人资料失败');
  } finally {
    loading.value = false;
  }
};

// 通过 QQ 号一键获取头像和昵称
// 注：QQ 头像 URL 由后端保存 qq 后自动生成（https://q1.qlogo.cn/g?b=qq&nk={qq}&s=140）
//     QQ 昵称通过后端代理拉取（避免前端直调第三方 API 触发 CORS）
const onFetchFromQq = async () => {
  const qq = (profileEdit.qq || '').trim();
  if (!qq) {
    ElMessage.warning('请先输入 QQ 号');
    return;
  }
  if (!/^\d{4,12}$/.test(qq)) {
    ElMessage.error('QQ 号格式不正确（4-12 位数字）');
    return;
  }
  fetchingQq.value = true;
  try {
    // 头像：保存后由后端自动生成 URL，此处仅同步预览
    profile.qq = qq;

    // QQ 昵称：走后端代理（多端点兜底 + 避免 CORS）
    let qqName: string | null = null;
    try {
      const res: any = await adminApi.fetchQqNickname(qq);
      if (res?.success && res.data?.nickname) {
        qqName = res.data.nickname;
      }
    } catch {
      // 代理失败：忽略，下面会提示
    }

    if (qqName) {
      // 拉取成功：自动填充昵称（用户可手动修改）
      profileEdit.nickname = qqName;
      ElMessage.success(`已获取 QQ 昵称「${qqName}」和头像，保存后生效`);
    } else {
      // 拉取失败：仅同步头像，提示用户手动填写昵称
      ElMessage.success(`已根据 QQ 号 ${qq} 更新头像，QQ 昵称获取失败请手动填写`);
    }
  } finally {
    fetchingQq.value = false;
  }
};

// 保存个人资料
const onSaveProfile = async () => {
  if (!profileFormRef.value) return;
  try {
    await profileFormRef.value.validate();
  } catch {
    return;
  }
  saving.value = true;
  try {
    const res: any = await adminApi.updateProfile({
      nickname: profileEdit.nickname,
      email: profileEdit.email,
      qq: profileEdit.qq,
    });
    if (res?.success) {
      ElMessage.success('个人资料已保存');
      // 同步到展示数据
      profile.nickname = res.data.nickname || '';
      profile.email = res.data.email || '';
      profile.qq = res.data.qq || '';
      profile.avatarUrl = res.data.avatarUrl || '';
      // 同步到 admin store：右上角头像/名字立即响应（任务 9 关键）
      adminStore.patch({
        nickname: profile.nickname,
        email: profile.email,
        qq: profile.qq,
        avatarUrl: profile.avatarUrl,
      });
      if (authStore.user) {
        authStore.user.nickname = profile.nickname || '';
        (authStore.user as any).qq = profile.qq || undefined;
        (authStore.user as any).avatarUrl = profile.avatarUrl || undefined;
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const onResetProfile = () => {
  profileEdit.nickname = profile.nickname;
  profileEdit.email = profile.email;
  profileEdit.qq = profile.qq || '';
  profileFormRef.value?.clearValidate();
};

// 修改密码
const onChangePassword = async () => {
  if (!pwdFormRef.value) return;
  try {
    await pwdFormRef.value.validate();
  } catch {
    return;
  }
  // 二次确认
  try {
    await ElMessageBox.confirm(
      '确认要修改登录密码吗？修改成功后需要使用新密码重新登录。',
      '修改密码确认',
      {
        type: 'warning',
        confirmButtonText: '确认修改',
        cancelButtonText: '取消',
        customClass: 'keke-confirm-box',
        confirmButtonClass: 'el-button--primary',
      },
    );
  } catch {
    return;
  }
  changingPwd.value = true;
  try {
    const res: any = await adminApi.changePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    });
    if (res?.success) {
      ElMessage.success('密码修改成功，请使用新密码重新登录');
      pwdForm.oldPassword = '';
      pwdForm.newPassword = '';
      pwdForm.confirmPassword = '';
      pwdFormRef.value?.clearValidate();
      // 3 秒后退出登录
      setTimeout(() => {
        authStore.logout();
        window.location.href = '/admin/login';
      }, 2000);
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '密码修改失败');
  } finally {
    changingPwd.value = false;
  }
};

const onResetPassword = () => {
  pwdForm.oldPassword = '';
  pwdForm.newPassword = '';
  pwdForm.confirmPassword = '';
  pwdFormRef.value?.clearValidate();
};

onMounted(async () => {
  await loadProfile();
  // 拉取 SMTP 状态用于决定管理员邮箱必填性
  try {
    const res: any = await publicApi.siteInfo();
    smtpEnabled.value = !!res?.data?.smtpEnabled;
  } catch {
    // 拉取失败保守处理：不强制
  }
});
</script>

<template>
  <div class="profile-page" v-loading="loading">
    <!-- 页头 -->
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">个人资料</h1>
        <p class="page-subtitle">管理你自己的账户信息与登录凭证</p>
      </div>
    </header>

    <div class="profile-grid">
      <!-- 左：账户信息卡 -->
      <section class="card info-card">
        <div class="card-header">
          <span class="card-title">账户信息</span>
          <span class="status-text" :class="profile.status === 'ACTIVE' ? 'is-success' : 'is-info'">
            {{ profile.status === 'ACTIVE' ? '在职' : '已停用' }}
          </span>
        </div>
        <div class="card-body">
          <!-- 头像区 -->
          <div class="avatar-block">
            <div class="avatar">
              <img v-if="avatarSrc" :src="avatarSrc" :alt="profile.nickname || profile.username" @error="(e: any) => e.target.style.display = 'none'" />
              <span v-else>{{ avatarInitial }}</span>
            </div>
            <div class="avatar-info">
              <div class="avatar-name">{{ profile.nickname || profile.username }}</div>
              <div class="avatar-username mono">@{{ profile.username }}</div>
              <div v-if="profile.qq" class="avatar-qq mono">QQ: {{ profile.qq }}</div>
            </div>
          </div>

          <div class="info-list">
            <div class="info-item">
              <span class="info-label">角色</span>
              <span class="info-value">
                <span class="status-text" :class="getRoleCls(profile.role)">{{ getRoleLabel(profile.role) }}</span>
                <span class="role-desc">{{ roleMap[profile.role]?.desc || '' }}</span>
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">用户 ID</span>
              <span class="info-value mono">#{{ profile.id }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">注册时间</span>
              <span class="info-value">{{ formatTime(profile.createdAt) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">最近登录</span>
              <span class="info-value">
                {{ formatTime(profile.lastLoginAt) }}
                <span v-if="profile.lastLoginIp" class="info-sub mono">（IP: {{ profile.lastLoginIp }}）</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 右：编辑资料 + 修改密码 -->
      <div class="right-column">
        <!-- 编辑资料卡 -->
        <section class="card edit-card">
          <div class="card-header">
            <span class="card-title">编辑资料</span>
            <span class="card-hint">仅可修改昵称与邮箱</span>
          </div>
          <div class="card-body">
            <el-form
              ref="profileFormRef"
              :model="profileEdit"
              :rules="profileRules"
              label-position="top"
              class="profile-form"
            >
              <el-form-item label="登录用户名">
                <el-input :model-value="profile.username" disabled>
                  <template #prefix>
                    <el-icon><User /></el-icon>
                  </template>
                </el-input>
                <div class="field-hint">用户名无法修改，是登录凭证</div>
              </el-form-item>

              <el-form-item label="昵称" prop="nickname">
                <el-input v-model="profileEdit.nickname" placeholder="设置一个昵称" maxlength="32" clearable>
                  <template #prefix>
                    <el-icon><EditPen /></el-icon>
                  </template>
                </el-input>
                <div class="field-hint">显示在工单、订单、审计日志等场景</div>
              </el-form-item>

              <el-form-item prop="email">
                <template #label>
                  <span>邮箱</span>
                  <span v-if="smtpEnabled" class="required-mark">*</span>
                </template>
                <el-input v-model="profileEdit.email" placeholder="admin@example.com" maxlength="128" clearable>
                  <template #prefix>
                    <el-icon><Message /></el-icon>
                  </template>
                </el-input>
                <div class="field-hint">
                  <template v-if="smtpEnabled">
                    系统已开启邮件服务，管理员必须绑定邮箱
                  </template>
                  <template v-else>
                    用于接收系统通知与找回密码
                  </template>
                </div>
              </el-form-item>

              <el-form-item label="QQ 号" prop="qq">
                <el-input v-model="profileEdit.qq" placeholder="填写 QQ 号自动获取头像" maxlength="12" clearable>
                  <template #prefix>
                    <el-icon><ChatDotRound /></el-icon>
                  </template>
                  <template #append>
                    <el-button :loading="fetchingQq" @click="onFetchFromQq">
                      <el-icon style="margin-right: 4px;"><Refresh /></el-icon>
                      获取
                    </el-button>
                  </template>
                </el-input>
                <div class="field-hint">填写 QQ 号后点击「获取」一键拉取头像与昵称，保存后生效</div>
              </el-form-item>

              <div class="form-actions">
                <el-button class="admin-btn admin-btn-md" @click="onResetProfile">重置</el-button>
                <el-button class="admin-btn admin-btn-primary admin-btn-md" :loading="saving" @click="onSaveProfile">
                  <el-icon style="margin-right: 4px;"><Check /></el-icon>
                  保存修改
                </el-button>
              </div>
            </el-form>
          </div>
        </section>

        <!-- 修改密码卡 -->
        <section class="card pwd-card">
          <div class="card-header">
            <span class="card-title">修改密码</span>
            <span class="card-hint">修改成功后会自动退出登录</span>
          </div>
          <div class="card-body">
            <el-form
              ref="pwdFormRef"
              :model="pwdForm"
              :rules="pwdRules"
              label-position="top"
              class="pwd-form"
            >
              <el-form-item label="原密码" prop="oldPassword">
                <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入当前密码">
                  <template #prefix>
                    <el-icon><Lock /></el-icon>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item label="新密码" prop="newPassword">
                <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="6-32 位新密码">
                  <template #prefix>
                    <el-icon><Lock /></el-icon>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item label="确认新密码" prop="confirmPassword">
                <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码">
                  <template #prefix>
                    <el-icon><Lock /></el-icon>
                  </template>
                </el-input>
              </el-form-item>

              <div class="form-actions">
                <el-button class="admin-btn admin-btn-md" @click="onResetPassword">清空</el-button>
                <el-button class="admin-btn admin-btn-warn admin-btn-md" :loading="changingPwd" @click="onChangePassword">
                  <el-icon style="margin-right: 4px;"><Key /></el-icon>
                  确认修改
                </el-button>
              </div>
            </el-form>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/variables.scss' as *;
@use '@/styles/responsive.scss' as *;
@use 'sass:math';

.profile-page {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;

  @include mobile {
    padding: 12px;
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;

  .page-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 4px;
    letter-spacing: -0.3px;
  }

  .page-subtitle {
    font-size: 12px;
    color: var(--text-tertiary);
    margin: 0;
    letter-spacing: 0.2px;
  }
}

// 网格布局：左 1 右 1.5
.profile-grid {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: 16px;
  align-items: start;

  @include tablet-down {
    grid-template-columns: 1fr;
  }
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-base);
  border-radius: 10px;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-subtle);

  .card-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .card-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    font-family: 'JetBrains Mono', monospace;
  }
}

.card-body {
  padding: 20px;

  @include mobile {
    padding: 16px;
  }
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// ============ 账户信息卡 ============
.info-card {
  .card-body {
    padding: 0;
  }
}

.avatar-block {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px 20px;
  border-bottom: 1px solid var(--border-light);
  background: linear-gradient(135deg, rgba(212, 121, 142, 0.05) 0%, transparent 60%);

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--gold-400) 0%, var(--gold-600) 100%);
    color: #fff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 28px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(212, 121, 142, 0.25);
    flex-shrink: 0;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  .avatar-info {
    .avatar-name {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .avatar-username {
      font-size: 12px;
      color: var(--text-tertiary);
      letter-spacing: 0.3px;
    }

    .avatar-qq {
      margin-top: 4px;
      font-size: 11px;
      color: var(--gold-500);
      letter-spacing: 0.3px;
    }
  }
}

.info-list {
  padding: 8px 20px 16px;
}

.info-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px dashed var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  .info-label {
    flex-shrink: 0;
    width: 80px;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-tertiary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding-top: 3px;
  }

  .info-value {
    flex: 1;
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.6;
  }

  .info-sub {
    display: inline-block;
    margin-left: 6px;
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .role-desc {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--text-tertiary);
  }
}

// ============ 编辑/密码卡通用 ============
.profile-form,
.pwd-form {
  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  :deep(.el-form-item__label) {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    padding-bottom: 6px;
  }

  :deep(.el-input__wrapper) {
    border-radius: 6px;
  }
}

.field-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;
}

.required-mark {
  color: var(--danger);
  margin-left: 2px;
  font-weight: 600;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-light);
  margin-top: 8px;
}

// 状态文字
.status-text {
  display: inline-block;
  padding: 2px 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  border-radius: 4px;
  border: 1px solid;

  &.is-success {
    color: var(--success);
    border-color: rgba(76, 175, 80, 0.35);
    background: rgba(76, 175, 80, 0.08);
  }

  &.is-danger {
    color: var(--danger);
    border-color: rgba(244, 67, 54, 0.35);
    background: rgba(244, 67, 54, 0.08);
  }

  &.is-warning {
    color: var(--warning);
    border-color: rgba(255, 193, 7, 0.35);
    background: rgba(255, 193, 7, 0.08);
  }

  &.is-info {
    color: var(--text-secondary);
    border-color: var(--border-base);
    background: var(--bg-subtle);
  }

  &.is-default {
    color: var(--text-secondary);
    border-color: var(--border-base);
    background: var(--bg-subtle);
  }
}

// 字体
.mono {
  font-family: 'JetBrains Mono', monospace;
}
</style>
