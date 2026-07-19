<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/api/auth';
import { publicApi } from '@/api/public';

const auth = useAuthStore();

// SMTP 是否开启：决定邮箱是否强制必填
const smtpEnabled = ref(false);

// 基本信息表单
const profileFormRef = ref<FormInstance>();
const profileForm = reactive({
  nickname: '',
  email: '',
  avatar: '',
});
const profileLoading = ref(false);

// 密码表单
const passwordFormRef = ref<FormInstance>();
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const passwordLoading = ref(false);

// 密码校验：确认密码一致
const validateConfirm = (_rule: any, value: string, callback: any) => {
  if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入的密码不一致'));
  } else {
    callback();
  }
};

const profileRules = computed<FormRules>(() => ({
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { min: 2, max: 20, message: '昵称长度为 2-20 个字符', trigger: 'blur' },
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
}));

const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度为 6-32 个字符', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
};

// 当前用户
const user = computed(() => auth.user);

// 邀请链接
const inviteLink = computed(() => {
  if (!user.value?.inviteCode) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/register?inviteCode=${user.value.inviteCode}`;
});

// 面板账号状态映射
const panelStatusMap: Record<string, { text: string; type: string }> = {
  active: { text: '已激活', type: 'success' },
  pending: { text: '创建中', type: 'warning' },
  failed: { text: '创建失败', type: 'danger' },
  disabled: { text: '已禁用', type: 'info' },
};

// 保存基本信息
async function onSaveProfile() {
  if (!profileFormRef.value) return;
  try {
    await profileFormRef.value.validate();
  } catch {
    return;
  }
  profileLoading.value = true;
  try {
    await authApi.updateProfile({
      nickname: profileForm.nickname,
      email: profileForm.email,
      avatar: profileForm.avatar,
    });
    ElMessage.success('资料保存成功');
    await auth.fetchProfile();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    profileLoading.value = false;
  }
}

// 修改密码
async function onChangePassword() {
  if (!passwordFormRef.value) return;
  try {
    await passwordFormRef.value.validate();
  } catch {
    return;
  }
  passwordLoading.value = true;
  try {
    await authApi.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });
    ElMessage.success('密码修改成功');
    passwordForm.oldPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    passwordLoading.value = false;
  }
}

// 复制文本
async function copyText(text: string, label: string) {
  if (!text) {
    ElMessage.warning('暂无可复制内容');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(`${label}已复制`);
  } catch (e) {
    // 兼容旧浏览器
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      ElMessage.success(`${label}已复制`);
    } catch {
      ElMessage.error('复制失败，请手动复制');
    }
    document.body.removeChild(textarea);
  }
}

// 头像上传（占位）
function onAvatarChange(_file: any) {
  ElMessage.info('头像上传功能即将开放');
}

// 去实名（暂时禁用）
function goRealname() {
  ElMessage.info('实名认证功能即将开放，敬请期待');
}

// 初始化表单数据
function initForm() {
  if (user.value) {
    profileForm.nickname = user.value.nickname || '';
    profileForm.email = user.value.email || '';
    profileForm.avatar = user.value.avatar || '';
  }
}

onMounted(async () => {
  if (!auth.user) {
    await auth.fetchProfile();
  }
  initForm();
  // 拉取 SMTP 状态用于决定邮箱必填性
  try {
    const res: any = await publicApi.siteInfo();
    smtpEnabled.value = !!res?.data?.smtpEnabled;
  } catch {
    // 拉取失败保守处理：不强制
  }
});
</script>

<template>
  <div class="profile-page">
    <!-- 页头 -->
    <header class="page-head">
      <span class="eyebrow">PROFILE</span>
      <h1 class="page-title font-display">账号设置</h1>
      <p class="page-desc">管理个人信息、安全凭证与邀请关系</p>
    </header>

    <!-- 基本信息 -->
    <section class="detail-card card">
      <div class="card-header">
        <h2 class="card-title">基本信息</h2>
      </div>
      <div class="card-body">
        <div class="avatar-area">
          <el-upload
            :show-file-list="false"
            :auto-upload="false"
            :on-change="onAvatarChange"
            accept="image/*"
          >
            <div class="avatar-wrap">
              <el-avatar :size="72" class="user-avatar">
                {{ profileForm.nickname?.charAt(0) || 'U' }}
              </el-avatar>
              <div class="avatar-overlay">
                <el-icon><Camera /></el-icon>
              </div>
            </div>
          </el-upload>
          <div class="avatar-meta">
            <span class="avatar-name font-display">{{ profileForm.nickname || '未设置昵称' }}</span>
            <span class="avatar-tip">点击头像更换（JPG / PNG，建议 200×200）</span>
          </div>
        </div>

        <el-form
          ref="profileFormRef"
          :model="profileForm"
          :rules="profileRules"
          label-width="96px"
          label-position="right"
          class="profile-form"
        >
          <el-form-item label="昵称" prop="nickname">
            <el-input v-model="profileForm.nickname" placeholder="请输入昵称" maxlength="20" show-word-limit style="max-width: 320px" />
          </el-form-item>

          <el-form-item prop="email">
            <template #label>
              <span>邮箱</span>
              <span v-if="smtpEnabled" class="required-mark">*</span>
            </template>
            <el-input v-model="profileForm.email" placeholder="请输入邮箱地址" maxlength="80" style="max-width: 320px" />
            <span v-if="smtpEnabled" class="form-tip">系统已开启邮件服务，邮箱为必填项</span>
          </el-form-item>

          <el-form-item label="手机号">
            <el-input :model-value="user?.phone || ''" disabled style="max-width: 320px">
              <template #prepend>
                <el-icon><Iphone /></el-icon>
              </template>
            </el-input>
            <span class="form-tip">手机号不可修改，如需变更请联系客服</span>
          </el-form-item>

          <el-form-item>
            <el-button class="btn-gold" :loading="profileLoading" @click="onSaveProfile">
              <el-icon><Check /></el-icon>
              保存修改
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </section>

    <!-- 修改密码 -->
    <section class="detail-card card">
      <div class="card-header">
        <h2 class="card-title">修改密码</h2>
      </div>
      <div class="card-body">
        <el-form
          ref="passwordFormRef"
          :model="passwordForm"
          :rules="passwordRules"
          label-width="96px"
          label-position="right"
          class="profile-form"
        >
          <el-form-item label="旧密码" prop="oldPassword">
            <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入旧密码" style="max-width: 320px" />
          </el-form-item>
          <el-form-item label="新密码" prop="newPassword">
            <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="请输入新密码" style="max-width: 320px" />
          </el-form-item>
          <el-form-item label="确认新密码" prop="confirmPassword">
            <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" style="max-width: 320px" />
          </el-form-item>
          <el-form-item>
            <el-button class="btn-gold" :loading="passwordLoading" @click="onChangePassword">
              <el-icon><Key /></el-icon>
              确认修改
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </section>

    <!-- 实名认证 -->
    <section class="detail-card card">
      <div class="card-header">
        <h2 class="card-title">实名认证</h2>
      </div>
      <div class="card-body">
        <div class="realname-grid">
          <div class="info-block">
            <span class="info-label eyebrow">实名状态</span>
            <span
              class="status-text"
              :class="user?.isRealname ? 'is-success' : 'is-warning'"
            >
              {{ user?.isRealname ? '已实名' : '未实名' }}
            </span>
          </div>
          <template v-if="user?.isRealname">
            <div class="info-block">
              <span class="info-label eyebrow">证件号</span>
              <span class="info-value font-mono">{{ (user as any)?.idCardMasked || (user as any)?.realnameIdCard || '****' }}</span>
            </div>
            <div class="info-block">
              <span class="info-label eyebrow">实名姓名</span>
              <span class="info-value">{{ (user as any)?.realnameName || '****' }}</span>
            </div>
          </template>
          <div class="realname-actions" v-if="!user?.isRealname">
            <el-button class="btn-outline" disabled @click="goRealname">
              去实名
            </el-button>
            <span class="form-tip">实名认证功能即将开放</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 邀请信息 -->
    <section class="detail-card card">
      <div class="card-header">
        <h2 class="card-title">邀请信息</h2>
      </div>
      <div class="card-body">
        <div class="invite-block">
          <span class="info-label eyebrow">我的邀请码</span>
          <div class="invite-value-row">
            <span class="invite-code font-mono">{{ user?.inviteCode || '-' }}</span>
            <el-button link class="copy-btn" @click="copyText(user?.inviteCode || '', '邀请码')">
              <el-icon><CopyDocument /></el-icon>
              复制
            </el-button>
          </div>
        </div>

        <div class="invite-block">
          <span class="info-label eyebrow">邀请链接</span>
          <div class="invite-value-row">
            <el-input :model-value="inviteLink" readonly class="invite-input" style="max-width: 480px">
              <template #append>
                <el-button @click="copyText(inviteLink, '邀请链接')">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </template>
            </el-input>
          </div>
        </div>

        <div class="invite-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>邀请好友注册并消费，您将获得返佣奖励</span>
        </div>
      </div>
    </section>

    <!-- 面板账号 -->
    <section class="detail-card card">
      <div class="card-header">
        <h2 class="card-title">面板账号信息</h2>
      </div>
      <div class="card-body">
        <el-descriptions :column="2" class="dashed-desc">
          <el-descriptions-item label="面板用户名">
            <span class="panel-username font-mono">{{ user?.panelUserName || '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="面板状态">
            <span
              class="status-text"
              :class="`is-${panelStatusMap[user?.panelUserStatus || '']?.type || 'info'}`"
            >
              {{ panelStatusMap[user?.panelUserStatus || '']?.text || user?.panelUserStatus || '未知' }}
            </span>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.profile-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 960px;
  overflow-x: hidden;
}

// ============ 页头 ============
.page-head {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .eyebrow {
    display: block;
  }
}

.page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.15;
  letter-spacing: -0.3px;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

// ============ 详情卡 ============
.detail-card {
  overflow: hidden;
  min-width: 0;
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-base);
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-body {
  padding: 24px 20px;
}

// ============ 头像区 ============
.avatar-area {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px dashed var(--border-base);
}

.avatar-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;

  :deep(.el-avatar) {
    width: 100%;
    height: 100%;
    background: var(--gold-500);
    color: #fff;
    font-weight: 600;
    font-size: 28px;
    font-family: 'Fraunces', serif;
  }
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 18px;
  opacity: 0;
  transition: opacity 0.2s var(--ease-out-expo);
}

.avatar-wrap:hover .avatar-overlay {
  opacity: 1;
}

.avatar-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.avatar-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.avatar-tip {
  font-size: 12px;
  color: var(--text-tertiary);
}

// ============ 表单 ============
.profile-form {
  :deep(.el-form-item__label) {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }
}

.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.required-mark {
  color: var(--danger);
  margin-left: 2px;
  font-weight: 600;
}

// ============ 状态文字 ============
.status-text {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger { color: var(--danger); }
  &.is-info { color: var(--text-tertiary); }
}

// ============ 实名信息 ============
.realname-grid {
  display: flex;
  align-items: center;
  gap: 48px;
  flex-wrap: wrap;
}

.info-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-label {
  display: block;
}

.info-value {
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
}

.realname-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

// ============ 邀请信息 ============
.invite-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px dashed var(--border-base);

  &:last-of-type {
    border-bottom: none;
  }
}

.info-label {
  display: block;
}

.invite-value-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.invite-code {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-gold);
  letter-spacing: 1.5px;
  padding: 6px 14px;
  border: 1px dashed var(--border-gold);
  border-radius: 4px;
  background: var(--bg-subtle);
}

.copy-btn {
  color: var(--text-tertiary);
  font-size: 12px;
  padding: 0;

  &:hover {
    color: var(--text-gold);
  }
}

.invite-input {
  flex: 1;
}

.invite-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);

  .el-icon {
    color: var(--gold-400);
  }
}

// ============ 面板账号 ============
.panel-username {
  color: var(--text-gold);
  font-size: 13px;
  font-weight: 500;
}

// 虚线分隔的 descriptions
:deep(.dashed-desc) {
  .el-descriptions__body {
    background: transparent;
  }
  .el-descriptions__table {
    table-layout: fixed;
  }
  .el-descriptions__label {
    background: transparent !important;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text-tertiary) !important;
  }
  .el-descriptions__content {
    font-size: 14px;
    color: var(--text-primary);
  }
  .el-descriptions__table td,
  .el-descriptions__table th {
    border: none !important;
    border-bottom: 1px dashed var(--border-base) !important;
  }
  .el-descriptions__table tr td:first-child,
  .el-descriptions__table tr th:first-child {
    border-right: 1px dashed var(--border-base) !important;
  }
}

// ============ 响应式 ============
@include tablet-down {
  .profile-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .card-header {
    padding: 14px 16px;
  }
  .card-body {
    padding: 20px 16px;
  }
}

@include mobile {
  .profile-page {
    gap: 12px;
    max-width: 100%;
  }
  .page-title {
    font-size: 20px;
  }
  .page-desc {
    font-size: 12px;
  }
  .card-header {
    padding: 12px 14px;
  }
  .card-title {
    font-size: 15px;
  }
  .card-body {
    padding: 14px 12px;
  }

  // 头像区
  .avatar-area {
    gap: 14px;
    padding-bottom: 14px;
    margin-bottom: 14px;
  }
  .avatar-name {
    font-size: 16px;
  }

  // 表单 label 顶部对齐
  :deep(.el-form) {
    .el-form-item__label {
      float: none;
      display: block;
      text-align: left;
      padding: 0 0 6px;
      width: auto !important;
    }
    .el-form-item__content {
      margin-left: 0 !important;
    }
  }
  :deep(.el-input) {
    max-width: 100% !important;
  }
  :deep(.el-form-item) {
    .el-input {
      max-width: 100% !important;
    }
  }
  .form-tip {
    margin-left: 0;
    display: block;
    margin-top: 4px;
  }

  // 实名 / 邀请信息纵向堆叠
  .realname-grid {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  .invite-value-wrap {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .invite-code {
    align-self: flex-start;
  }
  :deep(.el-input-group) {
    display: flex;
    width: 100% !important;
  }

  // 面板账号描述单列堆叠
  :deep(.dashed-desc) {
    .el-descriptions__table {
      display: block;
      tbody {
        display: block;
      }
      tr {
        display: flex;
        flex-direction: column;
        width: 100% !important;
        padding-bottom: 8px;
      }
      td {
        display: block;
        width: 100% !important;
        border-right: none !important;
      }
      .el-descriptions__label {
        width: 100% !important;
        min-width: 0 !important;
        padding: 8px 12px 2px !important;
      }
      .el-descriptions__content {
        padding: 0 12px 8px !important;
      }
    }
  }
}
</style>
