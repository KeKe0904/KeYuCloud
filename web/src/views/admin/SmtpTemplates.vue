<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

interface SmtpTemplate {
  id: number;
  code: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const loading = ref(false);
const saving = ref(false);
const templates = ref<SmtpTemplate[]>([]);

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);

const defaultForm = (): SmtpTemplate => ({
  id: 0,
  code: '',
  name: '',
  subject: '',
  htmlContent: '',
  textContent: '',
  variables: [],
  enabled: true,
});

const form = reactive<SmtpTemplate>(defaultForm());

// 变量动态输入
const varInputVisible = ref(false);
const varInputValue = ref('');

function showVarInput() {
  varInputVisible.value = true;
  varInputValue.value = '';
}

function confirmVarInput() {
  const v = varInputValue.value.trim();
  if (v && !form.variables.includes(v)) {
    form.variables.push(v);
  }
  varInputVisible.value = false;
  varInputValue.value = '';
}

function removeVar(v: string) {
  form.variables = form.variables.filter((x) => x !== v);
}

async function loadList() {
  loading.value = true;
  try {
    const res: any = await adminApi.smtpTemplates();
    if (res?.success) templates.value = res.data || [];
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
  Object.assign(form, defaultForm(), JSON.parse(JSON.stringify(row)));
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.code.trim()) {
    ElMessage.warning('请填写模板代码');
    return;
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(form.code.trim())) {
    ElMessage.warning('模板代码须为大写字母开头，仅含大写字母、数字、下划线');
    return;
  }
  if (!form.name.trim()) {
    ElMessage.warning('请填写模板名称');
    return;
  }
  if (!form.subject.trim()) {
    ElMessage.warning('请填写邮件主题');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      subject: form.subject.trim(),
      htmlContent: form.htmlContent,
      textContent: form.textContent,
      variables: form.variables,
      enabled: form.enabled,
    };
    const res: any =
      dialogMode.value === 'create'
        ? await adminApi.createSmtpTemplate(payload)
        : await adminApi.updateSmtpTemplate(editingId.value!, payload);
    if (res?.success) {
      ElMessage.success(dialogMode.value === 'create' ? '模板已创建' : '模板已更新');
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
  try {
    await ElMessageBox.confirm(`确认删除模板「${row.name}」？此操作不可恢复。`, '删除模板', { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary', 
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    const res: any = await adminApi.deleteSmtpTemplate(row.id);
    if (res?.success) {
      ElMessage.success('模板已删除');
      await loadList();
    }
  } catch (e) {
    // 忽略
  }
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <div class="admin-smtp-templates">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">EMAIL TEMPLATES</span>
        <h2 class="page-title font-display">邮件模板</h2>
      </div>
      <div class="header-actions">
        <el-tooltip content="在模板内容中使用 {{varName}} 作为变量占位符，发送时会自动替换" placement="left">
          <el-icon class="tip-icon"><InfoFilled /></el-icon>
        </el-tooltip>
        <el-button class="btn-gold" @click="openCreate">
          <el-icon style="margin-right: 6px;"><Plus /></el-icon>
          新建模板
        </el-button>
      </div>
    </div>

    <!-- 列表卡 -->
    <div class="card table-card">
      <div class="table-wrap">
        <el-table :data="templates" v-loading="loading">
          <el-table-column prop="code" label="模板代码" width="180">
            <template #default="{ row }">
              <span class="code-chip">{{ row.code }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="140">
            <template #default="{ row }">
              <span class="template-name">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="subject" label="主题" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="subject-text">{{ row.subject }}</span>
            </template>
          </el-table-column>
          <el-table-column label="变量" min-width="220">
            <template #default="{ row }">
              <div class="var-list">
                <span
                  v-for="v in row.variables"
                  :key="v"
                  class="var-chip"
                  v-text="'{{' + v + '}}'"
                />
                <span v-if="!row.variables?.length" class="text-tertiary">无</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="row.enabled ? 'is-success' : 'is-info'">
                {{ row.enabled ? '启用' : '禁用' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button class="admin-btn admin-btn-sm" @click="openEdit(row)">编辑</el-button>
              <el-button class="admin-btn admin-btn-sm admin-btn-danger" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无模板" /></template>
        </el-table>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建模板' : '编辑模板'"
      width="760px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="模板代码" required>
          <el-input
            v-model="form.code"
            placeholder="如：USER_REGISTER"
            :disabled="dialogMode === 'edit'"
            class="font-mono"
          />
          <div class="form-tip">大写字母开头，仅含大写字母、数字、下划线，创建后不可修改</div>
        </el-form-item>
        <el-form-item label="模板名称" required>
          <el-input v-model="form.name" placeholder="如：用户注册欢迎邮件" />
        </el-form-item>
        <el-form-item label="邮件主题" required>
          <el-input v-model="form.subject" placeholder="如：欢迎注册 {{siteName}}" />
        </el-form-item>
        <el-form-item label="HTML 内容">
          <el-input
            v-model="form.htmlContent"
            type="textarea"
            :rows="8"
            placeholder="<h1>你好 {{nickname}}</h1>..."
            class="font-mono"
          />
        </el-form-item>
        <el-form-item label="纯文本内容">
          <el-input
            v-model="form.textContent"
            type="textarea"
            :rows="4"
            placeholder="你好 {{nickname}}..."
            class="font-mono"
          />
        </el-form-item>
        <el-form-item label="变量列表">
          <div class="var-block">
            <span
              v-for="v in form.variables"
              :key="v"
              class="var-chip editable"
              @click="removeVar(v)"
            >
              {{ v }}
              <span class="remove-mark">×</span>
            </span>
            <el-input
              v-if="varInputVisible"
              v-model="varInputValue"
              size="small"
              class="var-input font-mono"
              @keyup.enter="confirmVarInput"
              @blur="confirmVarInput"
            />
            <el-button v-else size="small" class="var-add btn-outline" @click="showVarInput">
              <el-icon><Plus /></el-icon>
              添加变量
            </el-button>
          </div>
          <div class="form-tip">在内容中使用 <code v-text="'{{varName}}'"></code> 占位，发送时自动替换；点击变量可删除</div>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-outline" @click="dialogVisible = false">取消</el-button>
        <el-button class="btn-gold" :loading="saving" @click="handleSave">
          {{ dialogMode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-smtp-templates {
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

  .tip-icon {
    color: var(--text-tertiary);
    cursor: help;
    font-size: 16px;
  }

  @include mobile {
    .page-title { font-size: 22px; }
    .header-actions { width: 100%; }
    .header-actions .el-button { flex: 1; }
  }
}

// ============ 表格卡 ============
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


.code-chip {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid var(--border-gold);
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-gold);
  letter-spacing: 0.5px;
  background: var(--bg-subtle);
}

.template-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.subject-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.var-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.var-chip {
  display: inline-block;
  padding: 1px 6px;
  border: 1px solid var(--border-base);
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-subtle);
  letter-spacing: 0.3px;

  &.editable {
    cursor: pointer;
    color: var(--text-gold);
    border-color: var(--border-gold);

    .remove-mark {
      margin-left: 4px;
      font-size: 12px;
      font-weight: 600;
    }

    &:hover {
      background: var(--danger-bg);
      border-color: var(--danger);
      color: var(--danger);
    }
  }
}

.text-tertiary {
  color: var(--text-tertiary);
  font-size: 12px;
}

// 状态纯文字
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger  { color: var(--danger); }
  &.is-info    { color: var(--text-tertiary); }
  &.is-primary { color: var(--text-gold); }
}

.var-block {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;

  .var-input {
    width: 140px;
  }

  .var-add {
    border-style: dashed;
  }
}

.form-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;

  code {
    padding: 1px 4px;
    background: var(--bg-subtle);
    border: 1px solid var(--border-base);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--text-gold);
  }
}

.font-mono {
  :deep(.el-input__inner),
  :deep(.el-textarea__inner) {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
  }
}

// ===== 响应式 =====
@include mobile {
  .var-block {
    flex-direction: column;
    align-items: stretch;

    .var-input { width: 100%; }
  }
}
</style>
