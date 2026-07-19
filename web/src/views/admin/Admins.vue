<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';
import { publicApi } from '@/api/public';
import { useAuthStore } from '@/stores/auth';
import dayjs from 'dayjs';

interface Admin {
  id: number;
  username: string;
  nickname: string;
  email?: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'FINANCE' | 'SUPPORT';
  enabled: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const admins = ref<Admin[]>([]);

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);

// SMTP 是否开启：决定邮箱是否强制必填
const smtpEnabled = ref(false);

const defaultForm = () => ({
  username: '',
  nickname: '',
  email: '',
  password: '',
  qq: '',
  avatarUrl: '',
  role: 'OPERATOR' as Admin['role'],
  enabled: true,
});

const form = reactive(defaultForm());

const roleMap: Record<string, { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info'; desc: string }> = {
  SUPER_ADMIN: { label: '超级管理员', type: 'danger', desc: '拥有系统全部权限，可管理其他管理员、系统配置等敏感操作。每个系统至少需保留一个超级管理员。' },
  ADMIN: { label: '管理员', type: 'warning', desc: '拥有大部分管理权限，但不可管理其他管理员与系统核心配置。' },
  OPERATOR: { label: '运营', type: 'success', desc: '负责商品、订单、用户、优惠券、公告等运营类管理工作。' },
  FINANCE: { label: '财务', type: 'info', desc: '负责财务总览、交易流水、退款审批等财务类工作。' },
  SUPPORT: { label: '客服', type: '', desc: '负责工单处理、用户咨询等客户服务工作。' },
  TECH: { label: '技术', type: 'info', desc: '负责系统技术运维、配置维护等技术类工作。' },
};

// 角色对应的 status-text 类名映射（替代 el-tag）
const roleStatusClass: Record<string, string> = {
  SUPER_ADMIN: 'is-danger',
  ADMIN: 'is-warning',
  OPERATOR: 'is-success',
  FINANCE: 'is-info',
  SUPPORT: 'is-info',
  TECH: 'is-info',
};

// 当前登录管理员 ID（用于禁止删除自己）
// 由于 admin store 未单独维护，从 localStorage 中读取
const currentAdminId = computed(() => {
  const raw = localStorage.getItem('adminProfile');
  if (raw) {
    try {
      const p = JSON.parse(raw);
      return p?.id ?? null;
    } catch {
      return null;
    }
  }
  return null;
});

const superAdminCount = computed(() => admins.value.filter((a) => a.role === 'SUPER_ADMIN').length);

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '从未登录';
}

async function loadList() {
  loading.value = true;
  try {
    const res: any = await adminApi.admins();
    if (res?.success) admins.value = res.data || [];
  } catch (e) {
    // 忽略
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  dialogMode.value = 'create';
  editingId.value = null;
  Object.assign(form, defaultForm());
  dialogVisible.value = true;
}

function openEdit(row: any) {
  dialogMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(form, defaultForm(), {
    username: row.username,
    nickname: row.nickname,
    email: (row as any).email || '',
    qq: (row as any).qq || '',
    avatarUrl: (row as any).avatarUrl || '',
    role: row.role,
    enabled: row.enabled,
    password: '',
  });
  dialogVisible.value = true;
}

// 通过 QQ 号一键拉取头像预览
function fetchQqAvatar() {
  const qq = (form.qq || '').trim();
  if (!qq) {
    ElMessage.warning('请先输入 QQ 号');
    return;
  }
  if (!/^\d{4,12}$/.test(qq)) {
    ElMessage.error('QQ 号格式不正确（4-12 位数字）');
    return;
  }
  form.avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=140`;
  ElMessage.success('头像已生成预览，保存后生效');
}

async function handleSave() {
  if (!form.username.trim()) {
    ElMessage.warning('请填写用户名');
    return;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(form.username.trim())) {
    ElMessage.warning('用户名须以字母开头，3-20 位字母数字下划线');
    return;
  }
  if (!form.nickname.trim()) {
    ElMessage.warning('请填写昵称');
    return;
  }
  // SMTP 开启时邮箱必填且格式校验
  const email = form.email.trim();
  if (smtpEnabled.value && !email) {
    ElMessage.warning('系统已开启邮件服务，请填写邮箱');
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ElMessage.warning('请输入有效的邮箱地址');
    return;
  }
  if (dialogMode.value === 'create' && !form.password) {
    ElMessage.warning('请填写密码');
    return;
  }
  if (form.password && form.password.length < 6) {
    ElMessage.warning('密码至少 6 位');
    return;
  }
  saving.value = true;
  try {
    const payload: any = {
      username: form.username.trim(),
      nickname: form.nickname.trim(),
      role: form.role,
      status: form.enabled ? 'ACTIVE' : 'DISABLED',
      qq: form.qq.trim(),
      email,
    };
    if (form.avatarUrl) payload.avatarUrl = form.avatarUrl;
    if (form.password) payload.password = form.password;
    const res: any =
      dialogMode.value === 'create'
        ? await adminApi.createAdmin(payload)
        : await adminApi.updateAdmin(editingId.value!, payload);
    if (res?.success) {
      ElMessage.success(dialogMode.value === 'create' ? '管理员已创建' : '管理员已更新');
      dialogVisible.value = false;
      await loadList();
    }
  } catch (e) {
    // 忽略
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row: any) {
  // 不可删除自己
  if (currentAdminId.value && row.id === currentAdminId.value) {
    ElMessage.warning('不可删除当前登录的管理员账号');
    return;
  }
  // 不可删除最后一个超级管理员
  if (row.role === 'SUPER_ADMIN' && superAdminCount.value <= 1) {
    ElMessage.warning('系统至少需保留一个超级管理员，不可删除');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确认删除管理员「${row.nickname} (${row.username})」？此操作不可恢复。`,
      '删除管理员',
      { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    const res: any = await adminApi.deleteAdmin(row.id);
    if (res?.success) {
      ElMessage.success('管理员已删除');
      await loadList();
    }
  } catch (e) {
    // 忽略
  }
}

onMounted(() => {
  loadList();
  // 拉取 SMTP 状态用于决定管理员邮箱必填性
  publicApi.siteInfo()
    .then((res: any) => {
      smtpEnabled.value = !!res?.data?.smtpEnabled;
    })
    .catch(() => {/* 拉取失败保守处理：不强制 */});
});
</script>

<template>
  <div class="admin-admins">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">ADMIN MANAGEMENT</span>
        <h2 class="page-title font-display">管理员</h2>
      </div>
      <div class="header-actions">
        <el-button class="btn-gold" @click="openCreate">
          <el-icon style="margin-right: 6px;"><Plus /></el-icon>
          新建管理员
        </el-button>
      </div>
    </div>

    <!-- 列表卡 -->
    <div class="card table-card">
      <div class="card-head">
        <span class="card-title">账号列表</span>
        <span class="card-extra">{{ admins.length }} ADMINS</span>
      </div>
      <div class="card-body table-body">
      <div class="table-wrap">
        <el-table :data="admins" v-loading="loading">
            <el-table-column prop="id" label="ID" width="70">
              <template #default="{ row }">
                <span class="mono">#{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="username" label="用户名" min-width="140">
              <template #default="{ row }">
                <span class="mono username-text">{{ row.username }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="nickname" label="昵称" min-width="140">
              <template #default="{ row }">
                <span class="nickname-text">{{ row.nickname }}</span>
              </template>
            </el-table-column>
            <el-table-column label="角色" width="160">
              <template #default="{ row }">
                <el-tooltip :content="roleMap[row.role]?.desc" placement="top">
                  <span class="status-text" :class="roleStatusClass[row.role] || 'is-info'">
                    {{ roleMap[row.role]?.label || row.role }}
                  </span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <span class="status-text" :class="row.enabled ? 'is-success' : 'is-info'">
                  {{ row.enabled ? '启用' : '禁用' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="最后登录" width="180">
              <template #default="{ row }">
                <span class="mono">{{ formatTime(row.lastLoginAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="180">
              <template #default="{ row }">
                <span class="mono">{{ formatTime(row.createdAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button class="admin-btn admin-btn-sm" @click="openEdit(row)">编辑</el-button>
                <el-button
                  class="admin-btn admin-btn-sm admin-btn-danger"
                  :disabled="row.id === currentAdminId || (row.role === 'SUPER_ADMIN' && superAdminCount <= 1)"
                  @click="handleDelete(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty description="暂无管理员" /></template>
          </el-table>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建管理员' : '编辑管理员'"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户名" required>
          <el-input
            v-model="form.username"
            placeholder="字母开头，3-20 位字母数字下划线"
            :disabled="dialogMode === 'edit'"
            class="font-mono"
          />
        </el-form-item>
        <el-form-item label="昵称" required>
          <el-input v-model="form.nickname" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="邮箱" :required="smtpEnabled">
          <el-input
            v-model="form.email"
            placeholder="admin@example.com"
            maxlength="128"
            clearable
          />
          <div class="form-tip">
            <template v-if="smtpEnabled">系统已开启邮件服务，管理员必须绑定邮箱</template>
            <template v-else>用于接收系统通知（选填）</template>
          </div>
        </el-form-item>
        <el-form-item label="QQ 号">
          <el-input
            v-model="form.qq"
            placeholder="填写 QQ 号自动获取头像"
            maxlength="12"
            clearable
            class="font-mono"
          >
            <template #append>
              <el-button @click="fetchQqAvatar">
                <el-icon style="margin-right: 4px;"><Refresh /></el-icon>
                获取头像
              </el-button>
            </template>
          </el-input>
          <div class="form-tip">填写后自动拉取 QQ 头像作为本站头像</div>
          <div v-if="form.avatarUrl" class="avatar-preview">
            <img :src="form.avatarUrl" alt="头像预览" @error="(e: any) => e.target.style.display = 'none'" />
            <span class="avatar-preview-tip">头像预览</span>
          </div>
        </el-form-item>
        <el-form-item label="密码" :required="dialogMode === 'create'">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="dialogMode === 'create' ? '请输入密码' : '留空表示不修改'"
            class="font-mono"
          />
          <div class="form-tip">至少 6 位</div>
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="form.role" style="width: 100%">
            <el-option
              v-for="(v, k) in roleMap"
              :key="k"
              :label="v.label"
              :value="k"
            />
          </el-select>
          <div class="form-tip role-desc">{{ roleMap[form.role]?.desc }}</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-outline" @click="dialogVisible = false">取消</el-button>
        <el-button class="btn-gold" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-admins {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页面头 ============
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 4px;

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .page-title {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    letter-spacing: -0.3px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  @include mobile {
    .page-title { font-size: 22px; }
    .header-actions { width: 100%; }
    .header-actions .el-button { flex: 1; }
  }
}

// ============ 卡片通用 ============
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  border-radius: 4px;
  overflow: hidden;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-base);

  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.2px;
  }

  .card-extra {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 1px;
    color: var(--text-tertiary);
    text-transform: uppercase;
  }
}

.card-body {
  padding: 0;
}

.table-body {
  padding: 0 20px;
}

// ============ 表格简约化 ============
.table-card {
  overflow: visible;
  min-width: 0;
  :deep(.el-table) {
    --el-table-border-color: var(--border-base);
    --el-table-header-bg-color: transparent;
    --el-table-tr-bg-color: transparent;
    --el-table-bg-color: transparent;

    &::before,
    .el-table__inner-wrapper::before {
      display: none;
    }

    th.el-table__cell {
      background: transparent;
      border-bottom: 1px solid var(--border-base);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--text-tertiary);
      padding: 12px 0;
    }

    .el-table__cell {
      border-bottom: 1px dashed var(--border-light);
      padding: 12px 0;
    }

    .el-table__fixed-right::before,
    .el-table__fixed::before {
      display: none;
    }
  }
}

// 表格包裹：移动端水平滚动
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  :deep(.el-table) {
    min-width: 960px;
  }
}


// ============ 元素样式 ============
.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.username-text {
  color: var(--text-primary);
  font-weight: 500;
}

.nickname-text {
  font-size: 13px;
  color: var(--text-primary);
}

// 状态纯文字
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;
  cursor: default;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger  { color: var(--danger); }
  &.is-info    { color: var(--text-tertiary); }
  &.is-primary { color: var(--text-gold); }
}

.form-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;

  &.role-desc {
    line-height: 1.5;
    color: var(--text-secondary);
  }
}

.avatar-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--bg-subtle);
  border: 1px dashed var(--border-base);
  border-radius: 6px;

  img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
    background: var(--bg-elevated);
  }

  .avatar-preview-tip {
    font-size: 12px;
    color: var(--text-tertiary);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.3px;
  }
}

.font-mono {
  :deep(.el-input__inner) {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
  }
}

// ===== 响应式适配 =====
@include mobile {
  .admin-admins { gap: 12px; }

  .table-body {
    padding: 0 12px;
  }

  .form-tip.role-desc { margin-top: 4px; }
}
</style>
