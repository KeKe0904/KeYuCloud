<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api/admin';
import dayjs from 'dayjs';

interface SmsConfig {
  enabled: boolean;
  accessKeyId: string;
  accessKeySecret: string; // 仅写入用，加载时清空
  hasAccessKeySecret: boolean;
  signName: string;
  templateCode: string;
  schemeName: string;
  codeLength: number;
  codeType: number;
  validTime: number;
  interval: number;
  duplicatePolicy: number;
  dailyLimit: number;
  todaySent: number;
  lastTestAt?: string | null;
  lastTestResult?: string | null;
}

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);

const config = reactive<SmsConfig>({
  enabled: false,
  accessKeyId: '',
  accessKeySecret: '',
  hasAccessKeySecret: false,
  signName: '',
  templateCode: '100001',
  schemeName: '',
  codeLength: 4, // 官方默认 4 位
  codeType: 1,
  validTime: 300, // 官方默认 300 秒
  interval: 60, // 官方默认 60 秒
  duplicatePolicy: 1, // 官方默认覆盖
  dailyLimit: 1000,
  todaySent: 0,
  lastTestAt: null,
  lastTestResult: null,
});

// ============ 阿里云 PNVS 官方推荐配置 ============

// 系统赠送签名示例（控制台"赠送签名配置"页可选）
// 文档：https://help.aliyun.com/zh/pnvs/user-guide/sms-authentication-service
const builtinSignSuggestions = [
  '恒创联众',
  '阿里云通信',
];

// 系统赠送模板（必须搭配系统赠送签名使用）
// 5 个官方赠送模板，对应不同业务场景
const builtinTemplates = [
  {
    code: '100001',
    name: '登录/注册模板',
    scene: 'register_login',
    content: '您的验证码是${code}，有效期${min}分钟，请勿告诉他人。',
  },
  {
    code: '100002',
    name: '修改绑定手机号模板',
    scene: 'change_phone',
    content: '您的验证码是${code}，有效期${min}分钟，请勿告诉他人。',
  },
  {
    code: '100003',
    name: '重置密码模板',
    scene: 'reset_password',
    content: '您的验证码是${code}，有效期${min}分钟，请勿告诉他人。',
  },
  {
    code: '100004',
    name: '绑定新手机号模板',
    scene: 'bind_new_phone',
    content: '您的验证码是${code}，有效期${min}分钟，请勿告诉他人。',
  },
  {
    code: '100005',
    name: '验证绑定手机号模板',
    scene: 'verify_phone',
    content: '您的验证码是${code}，有效期${min}分钟，请勿告诉他人。',
  },
];

// 业务场景 → 模板映射（用于场景联动选择）
const sceneOptions = [
  { value: 'register_login', label: '注册 / 登录', templateCode: '100001', desc: '新用户注册、用户登录验证' },
  { value: 'reset_password', label: '重置密码', templateCode: '100003', desc: '忘记密码时通过短信重置' },
  { value: 'change_phone', label: '修改绑定手机号', templateCode: '100002', desc: '更换已绑定的手机号' },
  { value: 'bind_new_phone', label: '绑定新手机号', templateCode: '100004', desc: '首次绑定手机号' },
  { value: 'verify_phone', label: '验证绑定手机号', templateCode: '100005', desc: '验证当前绑定手机号' },
];

// 当前选中场景（用于UI展示，不影响保存）
const currentScene = ref('register_login');

// 监听场景切换，自动联动模板 CODE
watch(currentScene, (scene) => {
  const opt = sceneOptions.find((o) => o.value === scene);
  if (opt) {
    config.templateCode = opt.templateCode;
  }
});

// 当前选中的模板对象
const currentTemplate = computed(() => {
  return builtinTemplates.find((t) => t.code === config.templateCode) || null;
});

// 验证码类型选项（与官方 CodeType 枚举一致）
const codeTypeOptions = [
  { value: 1, label: '纯数字（官方默认）' },
  { value: 2, label: '纯大写字母' },
  { value: 3, label: '纯小写字母' },
  { value: 4, label: '大小字母混合' },
  { value: 5, label: '数字 + 大写字母' },
  { value: 6, label: '数字 + 小写字母' },
  { value: 7, label: '数字 + 大小写字母' },
];

const duplicatePolicyOptions = [
  { value: 1, label: '覆盖（旧验证码失效，官方默认）' },
  { value: 2, label: '保留（多个验证码都有效）' },
];

// ============ 错误码说明（来自官方文档） ============
const errorCodes = [
  { code: 'OK', desc: '请求成功', level: 'success' },
  { code: 'MOBILE_NUMBER_ILLEGAL', desc: '手机号码格式错误', level: 'danger' },
  { code: 'BUSINESS_LIMIT_CONTROL', desc: '触发号码天级流控', level: 'warning' },
  { code: 'FREQUENCY_FAIL', desc: '频控校验未通过（发送过于频繁）', level: 'warning' },
  { code: 'INVALID_PARAMETERS', desc: '非法参数', level: 'danger' },
  { code: 'FUNCTION_NOT_OPENED', desc: '未开通融合认证功能', level: 'danger' },
  { code: 'isv.SMS_TEMPLATE_ILLEGAL', desc: '短信模板不合法', level: 'danger' },
  { code: 'isv.SMS_SIGNATURE_ILLEGAL', desc: '短信签名不合法', level: 'danger' },
];

// ============ 配置向导步骤 ============
const setupSteps = [
  {
    title: '开通号码认证服务',
    desc: '登录阿里云控制台，进入号码认证服务 PNVS',
    link: 'https://dypns.console.aliyun.com/smsServiceOverview',
    linkText: '打开 PNVS 控制台',
  },
  {
    title: '获取赠送签名',
    desc: '在「赠送签名配置」页选择签名（如「恒创联众」），无需审核报备',
    link: 'https://dypns.console.aliyun.com/smsCertParamsConfig/sign',
    linkText: '查看赠送签名',
  },
  {
    title: '选择赠送模板',
    desc: '在「赠送模板配置」页选择模板（100001-100005），系统赠送签名必须搭配赠送模板使用',
    link: 'https://dypns.console.aliyun.com/smsCertParamsConfig/template',
    linkText: '查看赠送模板',
  },
  {
    title: '创建 RAM 用户并授权',
    desc: '在 RAM 控制台创建 RAM 用户，授予 AliyunDypnsFullAccess 权限，再为其创建 AccessKey',
    link: 'https://ram.console.aliyun.com/users',
    linkText: '管理 RAM 用户',
  },
  {
    title: '填入下方配置并启用',
    desc: '将签名、模板 CODE、AccessKey 填入下方表单，开启启用开关后保存',
  },
];

function formatTime(t?: string | null) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '从未测试';
}

// 当前已保存的 accessKeyId 脱敏值（用于 placeholder 显示）
const savedAccessKeyIdMasked = ref('');
const hasAccessKeyId = ref(false);

async function loadConfig() {
  loading.value = true;
  try {
    const res: any = await adminApi.smsConfig();
    if (res?.success && res.data) {
      Object.assign(config, res.data);
      config.accessKeySecret = ''; // 加载后清空，留空表示不修改
      // accessKeyId 也清空：后端返回的是脱敏值，直接回显会导致保存时把脱敏值当真实值
      // 用 savedAccessKeyIdMasked 在 placeholder 里提示已设置的脱敏值
      savedAccessKeyIdMasked.value = res.data.accessKeyId || '';
      hasAccessKeyId.value = !!(res.data.accessKeyId && res.data.accessKeyId !== '');
      config.accessKeyId = '';
      // 反推当前场景
      const match = builtinTemplates.find((t) => t.code === config.templateCode);
      if (match) currentScene.value = match.scene;
    }
  } catch (e) {
    // 忽略
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (config.enabled) {
    // accessKeyId：首次启用必须填写；已存在时留空表示不修改
    if (!config.accessKeyId?.trim() && !hasAccessKeyId.value) {
      ElMessage.warning('请填写 AccessKey ID');
      return;
    }
    if (!config.hasAccessKeySecret && !config.accessKeySecret) {
      ElMessage.warning('首次启用必须填写 AccessKey Secret');
      return;
    }
    if (!config.signName?.trim()) {
      ElMessage.warning('请填写签名名称（推荐使用系统赠送签名）');
      return;
    }
    if (!config.templateCode?.trim()) {
      ElMessage.warning('请选择模板 CODE');
      return;
    }
  }
  saving.value = true;
  try {
    const payload: any = { ...config };
    delete payload.hasAccessKeySecret;
    delete payload.todaySent;
    delete payload.lastTestAt;
    delete payload.lastTestResult;
    if (!payload.accessKeySecret) delete payload.accessKeySecret;
    // accessKeyId 留空时不传，后端保留原值
    if (!payload.accessKeyId) delete payload.accessKeyId;
    const res: any = await adminApi.updateSmsConfig(payload);
    if (res?.success) {
      ElMessage.success('短信配置已保存');
      await loadConfig();
    }
  } catch (e) {
    // 忽略
  } finally {
    saving.value = false;
  }
}

// 一键应用官方推荐配置
function applyOfficialDefaults() {
  config.codeLength = 4;
  config.codeType = 1;
  config.validTime = 300;
  config.interval = 60;
  config.duplicatePolicy = 1;
  ElMessage.success('已应用官方推荐配置（4 位纯数字，5 分钟有效，60 秒间隔）');
}

const testDialogVisible = ref(false);
const testPhone = ref('');
const testResult = ref<{ success: boolean; message: string } | null>(null);

function openTestDialog() {
  testPhone.value = '';
  testResult.value = null;
  testDialogVisible.value = true;
}

async function handleTest() {
  if (!testPhone.value.trim()) {
    ElMessage.warning('请输入测试手机号');
    return;
  }
  if (!/^1[3-9]\d{9}$/.test(testPhone.value)) {
    ElMessage.warning('手机号格式不正确');
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    const res: any = await adminApi.testSms(testPhone.value.trim());
    if (res?.success) {
      const ok = res.data?.success;
      testResult.value = {
        success: ok,
        message: res.data?.message || (ok ? '发送成功，请查收' : '发送失败'),
      };
      if (ok) ElMessage.success('测试短信已发送');
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
  <div class="admin-sms" v-loading="loading">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">SMS CONFIGURATION</span>
        <h2 class="page-title font-display">短信服务</h2>
        <p class="page-subtitle">阿里云号码认证服务（PNVS）— 系统赠送签名 + 模板，全生命周期托管</p>
      </div>
      <div class="header-actions">
        <a
          class="docs-link"
          href="https://help.aliyun.com/zh/pnvs/user-guide/sms-authentication-service"
          target="_blank"
          rel="noopener"
        >
          <el-icon><Link /></el-icon>
          用户指南
        </a>
        <a
          class="docs-link"
          href="https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode"
          target="_blank"
          rel="noopener"
        >
          <el-icon><Document /></el-icon>
          API 文档
        </a>
        <el-button class="btn-outline" :disabled="!config.enabled" @click="openTestDialog">
          <el-icon style="margin-right: 6px;"><Promotion /></el-icon>
          发送测试短信
        </el-button>
      </div>
    </div>

    <!-- 官方提示横幅 -->
    <el-alert
      class="official-banner"
      type="warning"
      :closable="false"
      show-icon
    >
      <template #title>
        <span class="banner-text">
          <strong>官方推荐：</strong>
          使用号码认证服务赠送的短信签名和模板，无需审核报备，提升发送成功率。
          <strong>系统赠送签名必须搭配系统赠送模板使用。</strong>
        </span>
      </template>
    </el-alert>

    <div class="page-grid">
      <!-- 配置表单 -->
      <div class="card form-card">
        <div class="card-head">
          <span class="card-title">阿里云 PNVS 配置</span>
          <el-switch v-model="config.enabled" active-text="启用" inactive-text="停用" />
        </div>
        <div class="card-body">
          <el-form :model="config" label-width="140px" label-position="right">
            <!-- ============ 访问凭证 ============ -->
            <div class="section-label">
              <span class="section-num">01</span>
              访问凭证（RAM 用户 AccessKey）
            </div>
            <el-form-item label="AccessKey ID" :required="!hasAccessKeyId">
              <el-input
                v-model="config.accessKeyId"
                :placeholder="hasAccessKeyId ? `已设置 ${savedAccessKeyIdMasked}，留空表示不修改` : 'LTAIxxxxxxxxxxxx'"
                class="font-mono"
              />
              <div class="form-tip">
                <el-icon><InfoFilled /></el-icon>
                在
                <a href="https://ram.console.aliyun.com/manage/ak" target="_blank" rel="noopener">RAM 控制台</a>
                创建 AccessKey，需授予 <code>dypns:SendSmsVerifyCode</code> 和 <code>dypns:CheckSmsVerifyCode</code> 权限
              </div>
            </el-form-item>
            <el-form-item label="AccessKey Secret" :required="!config.hasAccessKeySecret">
              <el-input
                v-model="config.accessKeySecret"
                type="password"
                show-password
                :placeholder="config.hasAccessKeySecret ? '已设置，留空表示不修改' : '请输入 AccessKey Secret'"
              />
              <div class="form-tip">
                <el-icon><WarningFilled /></el-icon>
                Secret 仅在创建时显示一次，请妥善保管。已设置的 Secret 留空即可保留原值
              </div>
            </el-form-item>

            <!-- ============ 签名与模板（官方赠送） ============ -->
            <div class="section-label">
              <span class="section-num">02</span>
              签名与模板（推荐使用系统赠送）
            </div>

            <!-- 场景联动选择 -->
            <el-form-item label="业务场景">
              <el-radio-group v-model="currentScene">
                <el-radio-button
                  v-for="opt in sceneOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </el-radio-button>
              </el-radio-group>
              <div class="form-tip">
                <el-icon><InfoFilled /></el-icon>
                {{ sceneOptions.find(o => o.value === currentScene)?.desc }}
              </div>
            </el-form-item>

            <el-form-item label="签名名称" required>
              <el-input v-model="config.signName" placeholder="如：恒创联众" />
              <div class="form-tip">
                <el-icon><InfoFilled /></el-icon>
                推荐
                <a href="https://dypns.console.aliyun.com/smsCertParamsConfig/sign" target="_blank" rel="noopener">系统赠送签名</a>
                ，无需审核报备。常见赠送签名：
                <el-tag
                  v-for="s in builtinSignSuggestions"
                  :key="s"
                  size="small"
                  type="info"
                  effect="plain"
                  class="sign-tag"
                  @click="config.signName = s"
                >
                  {{ s }}
                </el-tag>
              </div>
            </el-form-item>

            <el-form-item label="模板 CODE" required>
              <el-select v-model="config.templateCode" style="width: 100%" placeholder="选择系统赠送模板">
                <el-option
                  v-for="t in builtinTemplates"
                  :key="t.code"
                  :label="`${t.code} — ${t.name}`"
                  :value="t.code"
                />
              </el-select>
              <div class="form-tip" v-if="currentTemplate">
                <el-icon><Document /></el-icon>
                模板内容：<span class="tpl-content">{{ currentTemplate.content }}</span>
              </div>
              <div class="form-tip">
                <el-icon><WarningFilled /></el-icon>
                <strong>系统赠送签名必须搭配系统赠送模板使用</strong>，自定义签名可能因运营商管控下发失败
              </div>
            </el-form-item>

            <el-form-item label="方案名称">
              <el-input v-model="config.schemeName" placeholder="留空使用默认方案" maxlength="20" />
              <div class="form-tip">
                <el-icon><InfoFilled /></el-icon>
                可选，最多 20 字符。用于在控制台区分不同业务的发送记录
              </div>
            </el-form-item>

            <!-- ============ 验证码规则 ============ -->
            <div class="section-label">
              <span class="section-num">03</span>
              验证码规则
              <el-button
                link
                type="primary"
                size="small"
                class="reset-defaults-btn"
                @click="applyOfficialDefaults"
              >
                <el-icon><RefreshRight /></el-icon>
                应用官方推荐配置
              </el-button>
            </div>
            <el-form-item label="验证码长度">
              <el-input-number v-model="config.codeLength" :min="4" :max="8" />
              <span class="form-tip-inline">支持 4~8 位，官方默认 4 位</span>
            </el-form-item>
            <el-form-item label="验证码类型">
              <el-select v-model="config.codeType" style="width: 280px">
                <el-option
                  v-for="opt in codeTypeOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="有效时长（秒）">
              <el-input-number v-model="config.validTime" :min="30" :max="3600" />
              <span class="form-tip-inline">官方默认 300 秒（5 分钟）</span>
            </el-form-item>
            <el-form-item label="发送间隔（秒）">
              <el-input-number v-model="config.interval" :min="0" :max="86400" />
              <span class="form-tip-inline">同号码频控，官方默认 60 秒</span>
            </el-form-item>
            <el-form-item label="重发策略">
              <el-select v-model="config.duplicatePolicy" style="width: 320px">
                <el-option
                  v-for="opt in duplicatePolicyOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>

            <!-- ============ 用量与配额 ============ -->
            <div class="section-label">
              <span class="section-num">04</span>
              用量与配额
            </div>
            <el-form-item label="每日上限">
              <el-input-number v-model="config.dailyLimit" :min="0" :max="100000" />
              <span class="form-tip-inline">0 表示不限制</span>
            </el-form-item>

            <el-form-item>
              <el-button class="btn-gold" :loading="saving" @click="handleSave">
                <el-icon style="margin-right: 6px;"><Check /></el-icon>
                保存配置
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>

      <!-- 右侧：向导 + 状态 + 模板说明 -->
      <div class="right-col">
        <!-- 配置向导 -->
        <div class="card guide-card">
          <div class="card-head">
            <span class="card-title">配置向导</span>
            <span class="card-extra">SETUP</span>
          </div>
          <div class="card-body">
            <div class="step-list">
              <div v-for="(step, idx) in setupSteps" :key="idx" class="step-item">
                <div class="step-num">{{ idx + 1 }}</div>
                <div class="step-content">
                  <div class="step-title">{{ step.title }}</div>
                  <div class="step-desc">{{ step.desc }}</div>
                  <a
                    v-if="step.link"
                    :href="step.link"
                    target="_blank"
                    rel="noopener"
                    class="step-link"
                  >
                    {{ step.linkText }}
                    <el-icon><Right /></el-icon>
                  </a>
                </div>
              </div>
            </div>
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
                <div class="status-label">AccessKey Secret</div>
                <div class="status-value">
                  <span class="status-text" :class="config.hasAccessKeySecret ? 'is-success' : 'is-danger'">
                    {{ config.hasAccessKeySecret ? '已设置' : '未设置' }}
                  </span>
                </div>
              </div>
              <div class="status-row">
                <div class="status-label">当前签名</div>
                <div class="status-value mono">{{ config.signName || '-' }}</div>
              </div>
              <div class="status-row">
                <div class="status-label">当前模板</div>
                <div class="status-value mono">{{ config.templateCode }}</div>
              </div>
              <div class="status-row">
                <div class="status-label">上次测试时间</div>
                <div class="status-value mono">{{ formatTime(config.lastTestAt) }}</div>
              </div>
              <div class="status-row">
                <div class="status-label">上次测试结果</div>
                <div class="status-value">
                  <span v-if="config.lastTestResult" class="status-text" :class="config.lastTestResult.startsWith('成功') ? 'is-success' : 'is-danger'">
                    {{ config.lastTestResult }}
                  </span>
                  <span v-else class="text-tertiary">-</span>
                </div>
              </div>
              <div class="status-row">
                <div class="status-label">今日已发送</div>
                <div class="status-value mono">{{ config.todaySent || 0 }} 条</div>
              </div>
              <div class="status-row">
                <div class="status-label">剩余配额</div>
                <div class="status-value mono text-gold">
                  {{ config.dailyLimit === 0 ? '不限' : Math.max(0, config.dailyLimit - (config.todaySent || 0)) + ' 条' }}
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

        <!-- 模板列表 -->
        <div class="card templates-card">
          <div class="card-head">
            <span class="card-title">系统赠送模板</span>
            <span class="card-extra">PNVS</span>
          </div>
          <div class="card-body">
            <div class="template-list">
              <div
                v-for="t in builtinTemplates"
                :key="t.code"
                class="template-row"
                :class="{ 'is-active': config.templateCode === t.code }"
                @click="config.templateCode = t.code"
              >
                <span class="tpl-code mono">{{ t.code }}</span>
                <div class="tpl-info">
                  <div class="tpl-name">{{ t.name }}</div>
                  <div class="tpl-content">{{ t.content }}</div>
                </div>
                <el-icon v-if="config.templateCode === t.code" class="tpl-active">
                  <CircleCheck />
                </el-icon>
              </div>
            </div>
            <div class="template-note">
              <el-icon><InfoFilled /></el-icon>
              <span>系统赠送签名必须搭配系统赠送模板使用</span>
            </div>
          </div>
        </div>

        <!-- 错误码说明 -->
        <div class="card error-codes-card">
          <div class="card-head">
            <span class="card-title">常见错误码</span>
            <span class="card-extra">DOCS</span>
          </div>
          <div class="card-body">
            <div class="error-code-list">
              <div v-for="e in errorCodes" :key="e.code" class="error-code-row">
                <span class="ec-code mono" :class="`is-${e.level}`">{{ e.code }}</span>
                <span class="ec-desc">{{ e.desc }}</span>
              </div>
            </div>
            <a
              href="https://help.aliyun.com/zh/pnvs/developer-reference/api-return-code"
              target="_blank"
              rel="noopener"
              class="error-codes-link"
            >
              查看完整错误码列表
              <el-icon><Right /></el-icon>
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- 测试短信弹窗 -->
    <el-dialog v-model="testDialogVisible" title="发送测试短信" width="480px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #title>
          测试短信使用当前配置（签名「{{ config.signName || '-' }}」+ 模板「{{ config.templateCode }}」），按官方计费标准收费。
        </template>
      </el-alert>
      <el-form label-width="100px">
        <el-form-item label="手机号">
          <el-input v-model="testPhone" placeholder="13800138000" maxlength="11" class="font-mono" />
          <div class="form-tip">
            <el-icon><WarningFilled /></el-icon>
            仅支持已授权（已绑定）的测试号码，请先在
            <a href="https://dypns.console.aliyun.com/smsServiceOverview" target="_blank" rel="noopener">控制台</a>
            绑定测试手机号
          </div>
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

.admin-sms {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 官方提示横幅 ============
.official-banner {
  border-radius: 6px;

  .banner-text {
    font-size: 13px;
    line-height: 1.6;

    strong {
      color: var(--text-primary);
    }
  }
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

  .page-subtitle {
    font-size: 12px;
    color: var(--text-tertiary);
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .docs-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-tertiary);
    text-decoration: none;
    padding: 6px 10px;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover {
      color: var(--text-gold);
      background: var(--bg-hover);
    }
  }

  @include mobile {
    .page-title { font-size: 22px; }
    .header-actions { width: 100%; flex-wrap: wrap; }
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

.right-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  display: flex;
  align-items: center;
  gap: 8px;
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

  .section-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: var(--gradient-gold);
    color: #fff;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .reset-defaults-btn {
    margin-left: auto;
    text-transform: none;
    letter-spacing: 0;
  }
}

.form-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;

  .el-icon {
    margin-top: 2px;
    flex-shrink: 0;
  }

  a {
    color: var(--text-gold);
    text-decoration: none;
    margin: 0 2px;

    &:hover {
      text-decoration: underline;
    }
  }

  code {
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg-subtle);
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11px;
    color: var(--text-primary);
  }

  strong {
    color: var(--text-primary);
  }
}

.form-tip-inline {
  margin-left: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
}

// 签名建议 tag
.sign-tag {
  cursor: pointer;
  margin-left: 6px;
  transition: all 0.2s;

  &:hover {
    color: var(--text-gold);
    border-color: var(--text-gold);
  }
}

// ============ 配置向导 ============
.step-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.step-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--bg-subtle);
  color: var(--text-gold);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  border: 1px solid var(--border-base);
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.step-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
  margin-bottom: 4px;
}

.step-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-gold);
  text-decoration: none;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.8;
  }
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
  padding: 12px 0;
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
    max-width: 60%;
    text-align: right;
    word-break: break-all;
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

// ============ 模板列表 ============
.template-list {
  display: flex;
  flex-direction: column;
}

.template-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px dashed var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--bg-hover);
  }

  &.is-active {
    background: var(--bg-subtle);
  }

  .tpl-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text-gold);
    background: var(--bg-subtle);
    padding: 3px 8px;
    border-radius: 3px;
    min-width: 56px;
    text-align: center;
    flex-shrink: 0;
  }

  .tpl-info {
    flex: 1;
    min-width: 0;
  }

  .tpl-name {
    font-size: 13px;
    color: var(--text-primary);
    font-weight: 500;
    margin-bottom: 4px;
  }

  .tpl-content {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.5;
    font-family: 'JetBrains Mono', monospace;
    word-break: break-all;
  }

  .tpl-active {
    color: var(--success);
    font-size: 16px;
    flex-shrink: 0;
  }
}

.template-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 10px;
  background: var(--bg-subtle);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

// ============ 错误码列表 ============
.error-code-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-code-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;

  .ec-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 3px;
    min-width: 180px;
    text-align: center;
    flex-shrink: 0;

    &.is-success {
      background: rgba(34, 197, 94, 0.1);
      color: var(--success);
    }

    &.is-danger {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
    }

    &.is-warning {
      background: rgba(245, 158, 11, 0.1);
      color: var(--warning);
    }
  }

  .ec-desc {
    font-size: 12px;
    color: var(--text-primary);
    line-height: 1.4;
  }
}

.error-codes-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-gold);
  text-decoration: none;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.8;
  }
}

// ============ 工具类 ============
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
  .form-tip-inline { margin-left: 0; display: block; margin-top: 4px; }
  .status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 0;

    .status-value { text-align: left; max-width: 100%; }
  }
  .error-code-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;

    .ec-code { min-width: 0; text-align: left; }
  }
}
</style>
