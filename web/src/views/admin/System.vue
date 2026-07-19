<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

// 配置区块定义
type ConfigValue = string | number | boolean;
interface ConfigItem {
  key: string;
  value: ConfigValue;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'password' | 'textarea';
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  tip?: string;
  mask?: boolean;
}

interface ConfigSection {
  key: string;
  title: string;
  icon: string;
  items: ConfigItem[];
}

const loading = ref(false);
const saving = ref<string | null>(null);

// 各区块配置（值会从后端填充）
const sections = ref<ConfigSection[]>([
  {
    key: 'basic',
    title: '基本设置',
    icon: 'InfoFilled',
    items: [
      { key: 'site_name', value: '', label: '站点名称', type: 'text', placeholder: '我的云服务' },
      { key: 'site_description', value: '', label: '站点描述', type: 'textarea', placeholder: '一句话介绍你的站点' },
      { key: 'icp_record', value: '', label: 'ICP 备案号', type: 'text', placeholder: '如：京ICP备XXXXXXXX号' },
      { key: 'support_qq', value: '', label: '客服 QQ', type: 'text', placeholder: 'QQ 号码' },
      { key: 'support_wechat', value: '', label: '客服微信', type: 'text', placeholder: '微信号' },
    ],
  },
  {
    key: 'register',
    title: '注册设置',
    icon: 'User',
    items: [
      { key: 'register_enabled', value: true, label: '开放注册', type: 'boolean' },
      {
        key: 'register_bonus',
        value: 0,
        label: '注册赠送金额',
        type: 'number',
        tip: '单位：元，0 表示不赠送',
      },
    ],
  },
  {
    key: 'payment',
    title: '支付设置',
    icon: 'Wallet',
    items: [
      { key: 'epay_merchant_id', value: '', label: '易支付商户 ID', type: 'text' },
      { key: 'epay_key', value: '', label: '易支付密钥', type: 'password', mask: true, placeholder: '留空表示不修改' },
      { key: 'epay_gateway', value: '', label: '易支付网关', type: 'text', placeholder: 'https://pay.example.com' },
      { key: 'balance_payment_enabled', value: true, label: '启用余额支付', type: 'boolean' },
    ],
  },
  {
    key: 'product',
    title: '商品设置',
    icon: 'Goods',
    items: [
      {
        key: 'default_markup_rate',
        value: -10,
        label: '默认优惠率',
        type: 'number',
        tip: '百分比，负数表示优惠（如 -10 表示 9 折），同步上游商品时的默认优惠比例',
      },
      { key: 'auto_sync_upstream', value: false, label: '自动同步上游', type: 'boolean', tip: '每天定时同步上游商品库存与价格' },
      {
        key: 'auto_sync_hour',
        value: 3,
        label: '自动同步时间',
        type: 'select',
        tip: '每天定时同步的具体时间点（24 小时制，仅当「自动同步上游」开启时生效）',
        options: Array.from({ length: 24 }, (_, h) => ({
          label: `${String(h).padStart(2, '0')}:00`,
          value: String(h),
        })),
      },
    ],
  },
  {
    key: 'theme',
    title: '主题设置',
    icon: 'Brush',
    items: [
      {
        key: 'default_theme',
        value: 'auto',
        label: '默认主题',
        type: 'select',
        options: [
          { label: '日间（白金）', value: 'light' },
          { label: '夜间（黑金）', value: 'dark' },
          { label: '跟随系统', value: 'auto' },
        ],
      },
      { key: 'allow_theme_switch', value: true, label: '允许用户切换主题', type: 'boolean' },
    ],
  },
  {
    key: 'security',
    title: '安全设置',
    icon: 'Lock',
    items: [
      { key: 'jwt_expiry_minutes', value: 1440, label: 'JWT 过期时间', type: 'number', tip: '单位：分钟' },
      { key: 'login_fail_lock_count', value: 5, label: '登录失败锁定次数', type: 'number', tip: '连续失败次数达到后锁定账号' },
      {
        key: 'password_strength',
        value: 'medium',
        label: '密码强度要求',
        type: 'select',
        options: [
          { label: '低（6位以上）', value: 'low' },
          { label: '中（8位以上含字母数字）', value: 'medium' },
          { label: '高（12位以上含大小写数字符号）', value: 'high' },
        ],
      },
    ],
  },
]);

// 默认值备份（用于重置）
const defaultValues: Record<string, ConfigValue> = {
  site_name: '',
  site_description: '',
  icp_record: '',
  support_qq: '',
  support_wechat: '',
  register_enabled: true,
  register_bonus: 0,
  epay_merchant_id: '',
  epay_key: '',
  epay_gateway: '',
  balance_payment_enabled: true,
  default_markup_rate: -10,
  auto_sync_upstream: false,
  auto_sync_hour: '3',
  default_theme: 'auto',
  allow_theme_switch: true,
  jwt_expiry_minutes: 1440,
  login_fail_lock_count: 5,
  password_strength: 'medium',
};

function findItem(key: string): ConfigItem | undefined {
  for (const sec of sections.value) {
    const it = sec.items.find((i) => i.key === key);
    if (it) return it;
  }
  return undefined;
}

// 将后端返回的字符串值转换为对应类型
function castValue(raw: string, type: ConfigItem['type']): ConfigValue {
  if (type === 'boolean') return raw === 'true' || raw === '1';
  if (type === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  return raw;
}

async function loadConfigs() {
  loading.value = true;
  try {
    const res: any = await adminApi.systemConfigs();
    if (res?.success && Array.isArray(res.data)) {
      res.data.forEach((c: { key: string; value: string }) => {
        const item = findItem(c.key);
        if (item) {
          item.value = castValue(c.value, item.type);
        }
      });
    }
  } catch (e) {
    // 忽略
  } finally {
    loading.value = false;
  }
}

async function handleSaveSection(section: ConfigSection) {
  saving.value = section.key;
  try {
    const configs = section.items.map((it) => ({
      key: it.key,
      value: String(it.value),
    }));
    const res: any = await adminApi.updateSystemConfigs(configs);
    if (res?.success) {
      ElMessage.success(`「${section.title}」已保存`);
      // 重新加载以同步状态（如密码掩码）
      await loadConfigs();
    }
  } catch (e) {
    // 忽略
  } finally {
    saving.value = null;
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm(
      '确认将所有配置重置为默认值？此操作不可恢复，且不会立即保存，需手动点击各区块的「保存」按钮。',
      '重置为默认',
      { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  sections.value.forEach((sec) => {
    sec.items.forEach((it) => {
      if (defaultValues[it.key] !== undefined) {
        it.value = defaultValues[it.key];
      }
    });
  });
  ElMessage.success('已重置为默认值，请点击「保存」以生效');
}

onMounted(() => {
  loadConfigs();
});
</script>

<template>
  <div class="admin-system" v-loading="loading">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">SYSTEM CONFIG</span>
        <h2 class="page-title font-display">系统配置</h2>
      </div>
      <div class="header-actions">
        <el-button class="btn-outline" @click="handleReset">
          <el-icon style="margin-right: 6px;"><RefreshLeft /></el-icon>
          重置为默认
        </el-button>
      </div>
    </div>

    <!-- 配置区块网格 -->
    <div class="sections-grid">
      <div
        v-for="section in sections"
        :key="section.key"
        class="card section-card"
      >
        <div class="card-head">
          <span class="card-title">
            <el-icon class="section-icon"><component :is="section.icon" /></el-icon>
            {{ section.title }}
          </span>
          <span class="card-extra">{{ section.key.toUpperCase() }}</span>
        </div>
        <div class="card-body">
          <el-form label-width="140px" label-position="right">
            <el-form-item
              v-for="item in section.items"
              :key="item.key"
              :label="item.label"
            >
              <el-switch v-if="item.type === 'boolean'" v-model="item.value as boolean" />
              <el-input-number
                v-else-if="item.type === 'number' && item.key === 'default_markup_rate'"
                v-model="item.value as number"
                controls-position="right"
                :min="-100"
                :max="100"
              />
              <el-input-number
                v-else-if="item.type === 'number'"
                v-model="item.value as number"
                controls-position="right"
                :min="0"
              />
              <el-select
                v-else-if="item.type === 'select'"
                v-model="item.value as string"
                style="width: 100%"
              >
                <el-option
                  v-for="opt in item.options"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <el-input
                v-else-if="item.type === 'textarea'"
                v-model="item.value as string"
                type="textarea"
                :rows="2"
                :placeholder="item.placeholder"
              />
              <el-input
                v-else-if="item.type === 'password'"
                v-model="item.value as string"
                type="password"
                show-password
                :placeholder="item.placeholder"
              />
              <el-input
                v-else
                v-model="item.value as string"
                :placeholder="item.placeholder"
              />
              <div v-if="item.tip" class="form-tip">{{ item.tip }}</div>
            </el-form-item>

            <el-form-item>
              <el-button
                class="btn-gold"
                :loading="saving === section.key"
                @click="handleSaveSection(section)"
              >
                保存
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-system {
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

// ============ 区块网格 ============
.sections-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  align-items: start;

  @include tablet-down {
    grid-template-columns: 1fr;
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
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.2px;
  }

  .section-icon {
    color: var(--gold-400);
    font-size: 16px;
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

// ============ 表单 ============
.form-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;
}

// ===== 响应式适配 =====
@include mobile {
  .admin-system { gap: 12px; }

  .section-card {
    :deep(.el-form) {
      .el-form-item__label {
        width: auto !important;
        text-align: left;
        float: none;
      }
      .el-form-item__content {
        margin-left: 0 !important;
      }
    }
  }

  .card-body {
    padding: 16px;
  }
}
</style>
