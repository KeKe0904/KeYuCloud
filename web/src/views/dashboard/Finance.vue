<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { request } from '@/api/http';

const auth = useAuthStore();

// 余额信息
const balanceInfo = ref({
  balance: 0,
  frozen: 0,
  totalSpent: 0,
});

// 充值表单
const rechargeForm = reactive({
  amount: 100,
  method: 'epay',
  loading: false,
});

// 充值快捷金额
const quickAmounts = [50, 100, 200, 500, 1000];

// 当前 tab
const activeTab = ref<'recharge' | 'consume'>('recharge');

// 充值记录
const rechargeLoading = ref(false);
const rechargeList = ref<any[]>([]);
const rechargeTotal = ref(0);
const rechargeQuery = reactive({ page: 1, pageSize: 10 });

// 消费记录
const consumeLoading = ref(false);
const consumeList = ref<any[]>([]);
const consumeTotal = ref(0);
const consumeQuery = reactive({ page: 1, pageSize: 10 });

// ===== 充值状态检查（用户跳转支付后返回时弹窗反馈） =====
// 通过 localStorage 记录"待核实充值"：包含发起充值前的余额、金额、时间戳
// 用户回到页面（visibilitychange 或重新挂载）时检查余额是否变化
//   - 余额增加 ≥ 充值金额 → 提示充值成功
//   - 余额未变 → 提示未完成充值（可能是用户中途取消/未支付）
interface PendingRecharge {
  amount: number;
  balanceBefore: number;
  timestamp: number;
}
const PENDING_RECHARGE_KEY = 'pending_recharge';
// 30 分钟内的待核实充值视为有效，超过则忽略
const PENDING_RECHARGE_TTL = 30 * 60 * 1000;
// 标记本次会话已弹过提示，避免重复打扰
let hasCheckedPending = false;

function savePendingRecharge(amount: number, balanceBefore: number) {
  const data: PendingRecharge = {
    amount,
    balanceBefore,
    timestamp: Date.now(),
  };
  try {
    localStorage.setItem(PENDING_RECHARGE_KEY, JSON.stringify(data));
  } catch {}
}

function loadPendingRecharge(): PendingRecharge | null {
  try {
    const raw = localStorage.getItem(PENDING_RECHARGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PendingRecharge;
    if (!data || !data.timestamp) return null;
    // 过期则清除
    if (Date.now() - data.timestamp > PENDING_RECHARGE_TTL) {
      localStorage.removeItem(PENDING_RECHARGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearPendingRecharge() {
  try {
    localStorage.removeItem(PENDING_RECHARGE_KEY);
  } catch {}
}

// 检查待核实充值：刷新余额后比较，弹窗反馈结果
async function checkPendingRecharge() {
  if (hasCheckedPending) return;
  const pending = loadPendingRecharge();
  if (!pending) return;
  hasCheckedPending = true;

  // 拉取最新余额
  let latestBalance = balanceInfo.value.balance;
  try {
    await auth.fetchProfile();
    if (auth.user) {
      latestBalance = Number(auth.user.balance || 0);
      balanceInfo.value.balance = latestBalance;
    }
    const res = await request.get('/finance/overview');
    if (res?.data) {
      latestBalance = Number(res.data.balance ?? latestBalance);
      balanceInfo.value.balance = latestBalance;
      balanceInfo.value.frozen = Number(res.data.frozen || 0);
      balanceInfo.value.totalSpent = Number(res.data.totalSpent || 0);
    }
  } catch {}

  const diff = Math.round((latestBalance - pending.balanceBefore) * 100) / 100;
  // 余额增加 ≥ 充值金额 → 成功
  if (diff >= pending.amount - 0.01) {
    clearPendingRecharge();
    await loadRechargeList();
    ElMessageBox.alert(
      `本次充值 <strong>¥${pending.amount.toFixed(2)}</strong> 已到账，当前余额 <strong>¥${latestBalance.toFixed(2)}</strong>`,
      '充值成功',
      { confirmButtonText: '我知道了', type: 'success', dangerouslyUseHTMLString: true },
    );
  } else if (diff > 0.01) {
    // 余额有变化但小于充值金额（可能是部分成功 / 同时有消费）
    clearPendingRecharge();
    await loadRechargeList();
    ElMessageBox.alert(
      `检测到余额变化（+¥${diff.toFixed(2)}），但与充值金额（¥${pending.amount.toFixed(2)}）不符。如遇问题请联系客服。`,
      '充值异常',
      { confirmButtonText: '我知道了', type: 'warning' },
    );
  } else {
    // 余额未变 → 未完成充值
    clearPendingRecharge();
    ElMessageBox.alert(
      `检测到您有一笔 <strong>¥${pending.amount.toFixed(2)}</strong> 的充值尚未到账。\n可能是支付未完成或已被取消。\n如已完成支付但余额未更新，请稍后刷新或联系客服。`,
      '充值未完成',
      {
        confirmButtonText: '重新充值',
        cancelButtonText: '关闭',
        type: 'warning',
        dangerouslyUseHTMLString: true,
        showCancelButton: true,
      },
    ).catch(() => {
      // 用户点关闭，不做操作
    });
  }
}

// 页面可见性变化（用户从支付页切回来时触发）
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    checkPendingRecharge();
  }
}

// 格式化金额
function formatMoney(val: number | string) {
  const num = Number(val || 0);
  return `¥${num.toFixed(2)}`;
}

// 格式化时间
function formatTime(val: string) {
  if (!val) return '-';
  try {
    return new Date(val).toLocaleString('zh-CN');
  } catch {
    return val;
  }
}

// 充值类型映射
const rechargeTypeMap: Record<string, string> = {
  epay: '易支付',
  balance: '余额',
  alipay: '支付宝',
  wechat: '微信',
  manual: '人工充值',
};

// 加载余额概览
async function loadBalance() {
  try {
    // 直接读取当前用户余额
    if (auth.user) {
      balanceInfo.value.balance = Number(auth.user.balance || 0);
    }
    // 尝试拉取更详细数据
    const res = await request.get('/finance/overview');
    if (res.data) {
      balanceInfo.value.balance = Number(res.data.balance ?? balanceInfo.value.balance);
      balanceInfo.value.frozen = Number(res.data.frozen || 0);
      balanceInfo.value.totalSpent = Number(res.data.totalSpent || 0);
    }
  } catch (e) {
    // 概览数据可选，失败时已使用 auth.user.balance 兜底
  }
}

// 选择快捷金额
function selectQuickAmount(amount: number) {
  rechargeForm.amount = amount;
}

// 发起充值
async function onRecharge() {
  if (!rechargeForm.amount || rechargeForm.amount <= 0) {
    ElMessage.warning('请输入有效的充值金额');
    return;
  }
  if (rechargeForm.amount < 1) {
    ElMessage.warning('充值金额不能小于 1 元');
    return;
  }
  rechargeForm.loading = true;
  try {
    const res = await request.post('/finance/recharge', {
      amount: rechargeForm.amount,
      method: rechargeForm.method,
    });
    const url = res.data?.url || res.data?.payUrl || res.data;
    if (url) {
      // 记录待核实充值状态，跳转支付后返回时检查
      savePendingRecharge(rechargeForm.amount, balanceInfo.value.balance);
      // 重置弹窗检查标记，以便返回时能再次弹窗
      hasCheckedPending = false;
      ElMessage.success('正在跳转支付页面...');
      setTimeout(() => {
        window.location.href = typeof url === 'string' ? url : String(url);
      }, 500);
    } else {
      // 没有跳转 URL → 充值未实际发生，弹窗提示
      ElMessageBox.alert(
        '充值请求未返回支付链接，可能未成功发起。请稍后重试或联系客服。',
        '充值未完成',
        { confirmButtonText: '我知道了', type: 'warning' },
      ).catch(() => {});
    }
  } catch (e: any) {
    // 调用失败 → 弹窗显示错误（拦截器已弹消息，这里补充弹窗）
    const msg = (e as any)?.message || '充值请求失败';
    ElMessageBox.alert(
      `充值未完成：${msg}\n请检查网络或稍后重试。`,
      '充值失败',
      { confirmButtonText: '我知道了', type: 'error' },
    ).catch(() => {});
  } finally {
    rechargeForm.loading = false;
  }
}

// 加载充值记录
async function loadRechargeList() {
  rechargeLoading.value = true;
  try {
    const res = await request.get('/finance/recharges', {
      page: rechargeQuery.page,
      pageSize: rechargeQuery.pageSize,
    });
    rechargeList.value = res.data?.list || res.data?.items || [];
    rechargeTotal.value = res.data?.total || 0;
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    rechargeLoading.value = false;
  }
}

// 加载消费记录
async function loadConsumeList() {
  consumeLoading.value = true;
  try {
    const res = await request.get('/finance/consumptions', {
      page: consumeQuery.page,
      pageSize: consumeQuery.pageSize,
    });
    consumeList.value = res.data?.list || res.data?.items || [];
    consumeTotal.value = res.data?.total || 0;
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    consumeLoading.value = false;
  }
}

// 充值分页
function onRechargePageChange(p: number) {
  rechargeQuery.page = p;
  loadRechargeList();
}

function onRechargeSizeChange(s: number) {
  rechargeQuery.pageSize = s;
  rechargeQuery.page = 1;
  loadRechargeList();
}

// 消费分页
function onConsumePageChange(p: number) {
  consumeQuery.page = p;
  loadConsumeList();
}

function onConsumeSizeChange(s: number) {
  consumeQuery.pageSize = s;
  consumeQuery.page = 1;
  loadConsumeList();
}

// tab 切换
function onTabChange(tab: string | number) {
  const t = String(tab);
  if (t === 'recharge' && !rechargeList.value.length) {
    loadRechargeList();
  } else if (t === 'consume' && !consumeList.value.length) {
    loadConsumeList();
  }
}

onMounted(async () => {
  if (!auth.user) {
    await auth.fetchProfile();
  }
  await loadBalance();
  await loadRechargeList();

  // 检查待核实充值（用户从支付页返回时）
  checkPendingRecharge();

  // 监听页面可见性变化（用户从支付页切回时触发检查）
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <div class="finance-page">
    <!-- 页头 -->
    <header class="page-head">
      <span class="eyebrow">FINANCE</span>
      <h1 class="page-title font-display">财务中心</h1>
    </header>

    <!-- 余额卡 -->
    <section class="balance-card card">
      <div class="balance-content">
        <div class="balance-item balance-item--primary">
          <span class="balance-label eyebrow">当前余额</span>
          <span class="balance-value font-display">{{ formatMoney(balanceInfo.balance) }}</span>
        </div>
        <div class="balance-divider"></div>
        <div class="balance-item">
          <span class="balance-label eyebrow">冻结金额</span>
          <span class="balance-value muted font-mono">{{ formatMoney(balanceInfo.frozen) }}</span>
        </div>
        <div class="balance-divider"></div>
        <div class="balance-item">
          <span class="balance-label eyebrow">累计消费</span>
          <span class="balance-value muted font-mono">{{ formatMoney(balanceInfo.totalSpent) }}</span>
        </div>
      </div>
    </section>

    <!-- 充值表单 -->
    <section class="recharge-card card">
      <div class="card-header">
        <h2 class="card-title">账户充值</h2>
      </div>
      <div class="card-body">
        <div class="recharge-form">
          <div class="form-row">
            <label class="form-label eyebrow">充值金额</label>
            <div class="amount-input">
              <el-input-number
                v-model="rechargeForm.amount"
                :min="1"
                :max="50000"
                :step="50"
                :precision="2"
                style="width: 200px"
              />
              <span class="amount-unit">元</span>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label eyebrow">快捷金额</label>
            <div class="quick-amounts">
              <el-button
                v-for="amt in quickAmounts"
                :key="amt"
                :class="rechargeForm.amount === amt ? 'btn-gold' : 'btn-outline'"
                @click="selectQuickAmount(amt)"
              >
                ¥{{ amt }}
              </el-button>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label eyebrow">支付方式</label>
            <div class="method-info">
              <span class="method-tag">
                <el-icon><CreditCard /></el-icon>
                易支付
              </span>
              <span class="method-tip">支持支付宝 / 微信 / 银联</span>
            </div>
          </div>

          <div class="form-row form-submit">
            <el-button class="btn-gold" size="large" :loading="rechargeForm.loading" @click="onRecharge">
              <el-icon><Wallet /></el-icon>
              立即充值 {{ formatMoney(rechargeForm.amount) }}
            </el-button>
          </div>
        </div>
      </div>
    </section>

    <!-- 记录区 -->
    <section class="records-card card">
      <el-tabs v-model="activeTab" @tab-change="onTabChange" class="record-tabs">
        <el-tab-pane label="充值记录" name="recharge">
          <div class="table-wrap">
            <el-table
              v-loading="rechargeLoading"
              :data="rechargeList"
              style="width: 100%"
              empty-text="暂无充值记录"
              class="dashed-table"
            >
              <el-table-column label="类型" width="120" align="center">
                <template #default="{ row }">
                  <span class="type-text">{{ rechargeTypeMap[row.method || row.type] || row.method || row.type || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="金额" width="140" align="right">
                <template #default="{ row }">
                  <span class="amount plus font-mono">+ {{ formatMoney(row.amount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="时间" width="200">
                <template #default="{ row }">
                  <span class="time-value">{{ formatTime(row.createdAt) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
            </el-table>
          </div>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="rechargeQuery.page"
              v-model:page-size="rechargeQuery.pageSize"
              :total="rechargeTotal"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              background
              @current-change="onRechargePageChange"
              @size-change="onRechargeSizeChange"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="消费记录" name="consume">
          <div class="table-wrap">
            <el-table
              v-loading="consumeLoading"
              :data="consumeList"
              style="width: 100%"
              empty-text="暂无消费记录"
              class="dashed-table"
            >
              <el-table-column prop="productName" label="商品 / 用途" min-width="220" show-overflow-tooltip />
              <el-table-column label="金额" width="140" align="right">
                <template #default="{ row }">
                  <span class="amount minus font-mono">- {{ formatMoney(row.amount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="时间" width="200">
                <template #default="{ row }">
                  <span class="time-value">{{ formatTime(row.createdAt) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="类型" width="120" align="center">
                <template #default="{ row }">
                  <span class="type-text">{{ row.type === 'order' ? '下单消费' : row.type === 'renew' ? '续费' : row.type === 'refund' ? '退款' : (row.type || '消费') }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="consumeQuery.page"
              v-model:page-size="consumeQuery.pageSize"
              :total="consumeTotal"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              background
              @current-change="onConsumePageChange"
              @size-change="onConsumeSizeChange"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.finance-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 100%;
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

// ============ 余额卡 ============
.balance-card {
  padding: 24px 28px;
}

.balance-content {
  display: flex;
  align-items: center;
  gap: 36px;
  flex-wrap: wrap;
}

.balance-item {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &--primary {
    .balance-value {
      font-size: 36px;
      color: var(--text-gold);
      font-weight: 600;
      letter-spacing: -0.5px;
    }
  }
}

.balance-label {
  display: block;
}

.balance-value {
  font-size: 22px;
  color: var(--text-primary);
  font-weight: 600;

  &.muted {
    color: var(--text-secondary);
    font-size: 20px;
    font-weight: 500;
  }
}

.balance-divider {
  width: 1px;
  height: 44px;
  background: var(--border-base);
}

// ============ 充值卡 ============
.recharge-card {
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

.recharge-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 720px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 16px;

  &.form-submit {
    padding-top: 8px;
  }
}

.form-label {
  width: 80px;
  flex-shrink: 0;
  display: block;
}

.amount-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.amount-unit {
  font-size: 14px;
  color: var(--text-tertiary);
}

.quick-amounts {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.method-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.method-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--gold-300);
  border-radius: 4px;
  color: var(--text-gold);
  font-size: 13px;
  font-weight: 500;

  .el-icon {
    font-size: 14px;
  }
}

.method-tip {
  font-size: 12px;
  color: var(--text-tertiary);
}

// ============ 记录卡 ============
.records-card {
  padding: 4px 16px 12px;
  min-width: 0;
  overflow: visible;
}

// 表格包裹：移动端水平滚动
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  :deep(.el-table) {
    min-width: 640px;
  }
}

.record-tabs {
  :deep(.el-tabs__header) {
    margin-bottom: 8px;
  }
  :deep(.el-tabs__nav-wrap::after) {
    background-color: var(--border-base);
    height: 1px;
  }
  :deep(.el-tabs__active-bar) {
    background-color: var(--gold-500);
  }
  :deep(.el-tabs__item) {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-tertiary);

    &.is-active {
      color: var(--text-primary);
    }
    &:hover {
      color: var(--text-gold);
    }
  }
}

// 虚线分隔表格
:deep(.dashed-table) {
  --el-table-border-color: transparent;

  .el-table__body tr.el-table__row--striped td {
    background: transparent;
  }

  .el-table__cell {
    border-bottom: 1px dashed var(--border-base) !important;
  }

  th.el-table__cell {
    border-bottom: 1px solid var(--border-base) !important;
    background: transparent;
    .cell {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-tertiary);
    }
  }

  .el-table__body tr:hover > td {
    background: var(--bg-hover) !important;
  }
}

.type-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.time-value {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
}

.amount {
  font-weight: 600;
  font-size: 14px;

  &.plus {
    color: var(--success);
  }

  &.minus {
    color: var(--danger);
  }
}

.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 0 4px;
}

// ============ 响应式 ============
@include tablet-down {
  .finance-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .balance-card {
    padding: 20px 22px;
  }
  .balance-content {
    gap: 24px;
  }
  .balance-item--primary .balance-value {
    font-size: 30px;
  }
  .card-header {
    padding: 14px 16px;
  }
  .card-body {
    padding: 18px 16px;
  }
  .records-card {
    padding: 4px 12px 8px;
  }
}

// 手机端：余额单列 + 充值表单全宽 + 分页居中
@include mobile {
  .finance-page {
    gap: 12px;
  }
  .page-title {
    font-size: 20px;
  }
  .balance-card {
    padding: 16px;
  }
  .balance-content {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .balance-divider {
    width: 100%;
    height: 1px;
  }
  .balance-item--primary .balance-value {
    font-size: 28px;
  }
  .balance-value {
    font-size: 18px;

    &.muted {
      font-size: 16px;
    }
  }

  // 充值表单
  .card-header {
    padding: 12px 14px;
  }
  .card-title {
    font-size: 15px;
  }
  .card-body {
    padding: 14px 12px;
  }
  .recharge-form {
    max-width: 100%;
    gap: 16px;
  }
  .form-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .form-label {
    width: auto;
  }
  .amount-input {
    :deep(.el-input-number) {
      width: 100% !important;
    }
  }
  .quick-amounts {
    :deep(.el-button) {
      flex: 1 1 calc(33.333% - 10px);
      min-width: 0;
      margin-left: 0 !important;
    }
  }
  .form-submit {
    .el-button {
      width: 100%;
    }
  }

  // 记录卡
  .records-card {
    padding: 4px 8px 8px;
  }
  .pagination-wrap {
    padding: 10px 0 2px;
  }
}
</style>
