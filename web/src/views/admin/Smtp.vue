<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api/admin';
import dayjs from 'dayjs';

interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  encryption: 'NONE' | 'SSL' | 'STARTTLS';
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  replyTo: string;
  connectTimeout: number;
  sendTimeout: number;
  retryCount: number;
  dailyLimit: number;
  // 状态
  lastTestAt?: string;
  lastTestResult?: string;
  todaySent?: number;
  remainingQuota?: number;
}

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);

const config = reactive<SmtpConfig>({
  enabled: false,
  host: '',
  port: 465,
  encryption: 'SSL',
  username: '',
  password: '',
  fromAddress: '',
  fromName: '',
  replyTo: '',
  connectTimeout: 10,
  sendTimeout: 30,
  retryCount: 3,
  dailyLimit: 1000,
  lastTestAt: '',
  lastTestResult: '',
  todaySent: 0,
  remainingQuota: 0,
});

const testDialogVisible = ref(false);
const testEmail = ref('');
const testResult = ref<{ success: boolean; message: string } | null>(null);

// 加密方式变更时自动调整端口
watch(
  () => config.encryption,
  (val) => {
    if (val === 'SSL') config.port = 465;
    else if (val === 'STARTTLS') config.port = 587;
    else if (val === 'NONE' && (config.port === 465 || config.port === 587)) config.port = 25;
  },
);

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '从未测试';
}

async function loadConfig() {
  loading.value = true;
  try {
    const res: any = await adminApi.smtpConfig();
    if (res?.success && res.data) {
      Object.assign(config, res.data);
      // 加载后密码清空显示，留空表示不修改
      config.password = '';
    }
  } catch (e) {
    // 忽略
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (config.enabled) {
    if (!config.host?.trim()) {
      ElMessage.warning('请填写服务器地址');
      return;
    }
    if (!config.username?.trim()) {
      ElMessage.warning('请填写用户名');
      return;
    }
    if (!config.fromAddress?.trim()) {
      ElMessage.warning('请填写发件地址');
      return;
    }
  }
  saving.value = true;
  try {
    const payload: any = { ...config };
    // 密码为空不提交
    if (!payload.password) delete payload.password;
    const res: any = await adminApi.updateSmtpConfig(payload);
    if (res?.success) {
      ElMessage.success('SMTP 配置已保存');
      await loadConfig();
    }
  } catch (e) {
    // 忽略
  } finally {
    saving.value = false;
  }
}

function openTestDialog() {
  testEmail.value = '';
  testResult.value = null;
  testDialogVisible.value = true;
}

async function handleTest() {
  if (!testEmail.value.trim()) {
    ElMessage.warning('请输入收件邮箱');
    return;
  }
  // 简单邮箱格式校验
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.value)) {
    ElMessage.warning('邮箱格式不正确');
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    const res: any = await adminApi.testSmtp(testEmail.value.trim());
    if (res?.success) {
      testResult.value = { success: true, message: res.data?.message || '发送成功，请查收' };
      ElMessage.success('测试邮件已发送');
      // 刷新配置以更新状态
      await loadConfig();
    } else {
      testResult.value = { success: false, message: res?.message || '发送失败' };
    }
  } catch (e: any) {
    testResult.value = { success: false, message: e?.message || '发送失败' };
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  loadConfig();
});
</script>

<template>
  <div class="admin-smtp" v-loading="loading">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">SMTP CONFIGURATION</span>
        <h2 class="page-title font-display">邮件服务</h2>
      </div>
      <div class="header-actions">
        <el-button class="btn-outline" :disabled="!config.enabled" @click="openTestDialog">
          <el-icon style="margin-right: 6px;"><Promotion /></el-icon>
          发送测试邮件
        </el-button>
      </div>
    </div>

    <div class="page-grid">
      <!-- 配置表单 -->
      <div class="card form-card">
        <div class="card-head">
          <span class="card-title">SMTP 配置</span>
          <el-switch v-model="config.enabled" active-text="启用" inactive-text="停用" />
        </div>
        <div class="card-body">
          <el-form :model="config" label-width="120px" label-position="right" :disabled="!config.enabled">
            <div class="section-label">连接配置</div>
            <el-form-item label="服务器" required>
              <el-input v-model="config.host" placeholder="smtp.example.com" class="font-mono" />
            </el-form-item>
            <el-form-item label="端口" required>
              <el-input-number v-model="config.port" :min="1" :max="65535" controls-position="right" />
            </el-form-item>
            <el-form-item label="加密方式">
              <el-radio-group v-model="config.encryption">
                <el-radio value="NONE">无加密</el-radio>
                <el-radio value="SSL">SSL</el-radio>
                <el-radio value="STARTTLS">STARTTLS</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="用户名" required>
              <el-input v-model="config.username" placeholder="发件邮箱账号" class="font-mono" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input
                v-model="config.password"
                type="password"
                show-password
                placeholder="留空表示不修改"
              />
            </el-form-item>

            <div class="section-label">发件信息</div>
            <el-form-item label="发件地址" required>
              <el-input v-model="config.fromAddress" placeholder="noreply@example.com" class="font-mono" />
            </el-form-item>
            <el-form-item label="发件人名称">
              <el-input v-model="config.fromName" placeholder="云服务" />
            </el-form-item>
            <el-form-item label="回复地址">
              <el-input v-model="config.replyTo" placeholder="support@example.com" class="font-mono" />
            </el-form-item>

            <div class="section-label">高级设置</div>
            <el-form-item label="连接超时(秒)">
              <el-input-number v-model="config.connectTimeout" :min="1" :max="120" />
            </el-form-item>
            <el-form-item label="发送超时(秒)">
              <el-input-number v-model="config.sendTimeout" :min="1" :max="300" />
            </el-form-item>
            <el-form-item label="重试次数">
              <el-input-number v-model="config.retryCount" :min="0" :max="10" />
            </el-form-item>
            <el-form-item label="每日限额">
              <el-input-number v-model="config.dailyLimit" :min="0" :max="100000" />
              <span class="form-tip">0 表示不限制</span>
            </el-form-item>

            <el-form-item>
              <el-button class="btn-gold" :loading="saving" @click="handleSave">保存配置</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>

      <!-- 配置状态 -->
      <div class="card status-card">
        <div class="card-head">
          <span class="card-title">配置状态</span>
          <span class="card-extra">STATUS</span>
        </div>
        <div class="card-body">
          <div class="status-list">
            <div class="status-row">
              <div class="status-label">启用状态</div>
              <div class="status-value">
                <span class="status-text" :class="config.enabled ? 'is-success' : 'is-info'">
                  {{ config.enabled ? '已启用' : '已停用' }}
                </span>
              </div>
            </div>
            <div class="status-row">
              <div class="status-label">上次测试时间</div>
              <div class="status-value mono">{{ formatTime(config.lastTestAt) }}</div>
            </div>
            <div class="status-row">
              <div class="status-label">上次测试结果</div>
              <div class="status-value">
                <span v-if="config.lastTestResult" class="status-text" :class="config.lastTestResult === 'SUCCESS' ? 'is-success' : 'is-danger'">
                  {{ config.lastTestResult === 'SUCCESS' ? '成功' : '失败' }}
                </span>
                <span v-else class="text-tertiary">-</span>
              </div>
            </div>
            <div class="status-row">
              <div class="status-label">今日已发送</div>
              <div class="status-value mono">{{ config.todaySent || 0 }} 封</div>
            </div>
            <div class="status-row">
              <div class="status-label">剩余配额</div>
              <div class="status-value mono text-gold">
                {{ config.dailyLimit === 0 ? '不限' : (config.remainingQuota || 0) + ' 封' }}
              </div>
            </div>
            <div class="quota-bar" v-if="config.dailyLimit > 0">
              <div class="quota-track">
                <div
                  class="quota-fill"
                  :style="{ width: Math.min(100, Math.round(((config.todaySent || 0) / config.dailyLimit) * 100)) + '%' }"
                ></div>
              </div>
              <div class="quota-text">
                {{ config.todaySent || 0 }} / {{ config.dailyLimit }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 测试邮件弹窗 -->
    <el-dialog v-model="testDialogVisible" title="发送测试邮件" width="480px">
      <el-form label-width="100px">
        <el-form-item label="收件邮箱">
          <el-input v-model="testEmail" placeholder="recipient@example.com" class="font-mono" />
        </el-form-item>
        <el-alert
          v-if="testResult"
          :title="testResult.message"
          :type="testResult.success ? 'success' : 'error'"
          :closable="false"
          show-icon
          style="margin-top: 8px"
        />
      </el-form>
      <template #footer>
        <el-button class="btn-outline" @click="testDialogVisible = false">关闭</el-button>
        <el-button class="btn-gold" :loading="testing" @click="handleTest">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-smtp {
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

  @include mobile {
    .page-title { font-size: 22px; }
    .header-actions { width: 100%; }
    .header-actions .el-button { flex: 1; }
  }
}

// ============ 双栏布局 ============
.page-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  align-items: start;

  @include tablet-down {
    grid-template-columns: 1fr;
  }
}

// ============ 卡片通用 ============
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
  padding: 20px;
}

// ============ 区块标签 ============
.section-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 1.5px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  margin: 4px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--border-base);

  &:first-child {
    margin-top: 0;
  }
}

.form-tip {
  margin-left: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
}

// ============ 状态列表 ============
.status-list {
  display: flex;
  flex-direction: column;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px dashed var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  .status-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1px;
    color: var(--text-tertiary);
    text-transform: uppercase;
  }

  .status-value {
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;
  }
}

// 配额进度条
.quota-bar {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-base);

  .quota-track {
    height: 4px;
    background: var(--bg-subtle);
    border-radius: 2px;
    overflow: hidden;
  }

  .quota-fill {
    height: 100%;
    background: var(--gradient-gold);
    transition: width 0.3s var(--ease-out-expo);
  }

  .quota-text {
    margin-top: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--text-tertiary);
    text-align: right;
  }
}

.mono {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

.text-gold {
  color: var(--text-gold);
  font-weight: 600;
}

.text-tertiary {
  color: var(--text-tertiary);
  font-size: 12px;
}

.font-mono {
  :deep(.el-input__inner) {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
  }
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

// ===== 响应式 =====
@include mobile {
  .card-body { padding: 14px; }
  .form-card :deep(.el-form) {
    .el-form-item__label { width: auto !important; text-align: left; float: none; }
    .el-form-item__content { margin-left: 0 !important; }
  }
  .form-tip { margin-left: 0; display: block; margin-top: 4px; }
  .status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 0;
  }
}
</style>
