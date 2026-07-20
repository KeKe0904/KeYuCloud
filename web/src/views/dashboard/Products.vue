<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userProductApi } from '@/api/user-product';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

// 列表数据
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 筛选条件
const query = reactive({
  state: '' as string,
  page: 1,
  pageSize: 10,
});

// 状态选项
const stateOptions = [
  { label: '全部状态', value: '' },
  { label: '运行中', value: 'running' },
  { label: '已到期', value: 'expired' },
  { label: '已暂停', value: 'paused' },
  { label: '开通中', value: 'pending' },
];

// 状态映射
const stateMap: Record<string, { text: string; type: string }> = {
  running: { text: '运行中', type: 'success' },
  expired: { text: '已到期', type: 'danger' },
  paused: { text: '已暂停', type: 'warning' },
  pending: { text: '开通中', type: 'info' },
};

// 操作中状态记录
const actionLoading = ref<Record<number, boolean>>({});
const syncLoading = ref<Record<number, boolean>>({});

// 续费弹窗
const renewDialog = reactive({
  visible: false,
  loading: false,
  priceLoading: false,
  productId: 0,
  productName: '',
  duration: 1,
  prices: null as Record<string, number> | null,
  balance: 0,
});

// 续费时长选项（雨云官方仅支持 1/3/6/12 月）
const durationOptions = [
  { label: '1 个月', value: 1 },
  { label: '3 个月', value: 3 },
  { label: '6 个月', value: 6 },
  { label: '1 年', value: 12 },
];

// 当前选中时长对应的续费价格
const currentRenewPrice = computed(() => {
  if (!renewDialog.prices) return null;
  const p = renewDialog.prices[String(renewDialog.duration)];
  if (p == null) return null;
  // 后端可能返回字符串（Prisma Decimal）或数字，统一转为 number
  const num = Number(p);
  return isNaN(num) ? null : num;
});

// 余额是否充足
const isBalanceEnough = computed(() => {
  if (currentRenewPrice.value == null) return true; // 价格未加载完成时不阻止
  return renewDialog.balance >= currentRenewPrice.value;
});

// 余额不足金额
const shortageAmount = computed(() => {
  if (currentRenewPrice.value == null) return 0;
  return Math.max(0, currentRenewPrice.value - renewDialog.balance);
});

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

// 加载列表
async function loadList() {
  loading.value = true;
  try {
    const res = await userProductApi.list({
      state: query.state || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    list.value = res.data?.list || res.data?.items || [];
    total.value = res.data?.total || 0;
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false;
  }
}

// 搜索
function onSearch() {
  query.page = 1;
  loadList();
}

// 重置
function onReset() {
  query.state = '';
  query.page = 1;
  loadList();
}

// 分页变化
function onPageChange(p: number) {
  query.page = p;
  loadList();
}

function onSizeChange(s: number) {
  query.pageSize = s;
  query.page = 1;
  loadList();
}

// 查看详情
function goDetail(row: any) {
  router.push(`/dashboard/products/${row.id}`);
}

// 操作产品
async function onOperate(row: any, action: string, actionText: string) {
  try {
    await ElMessageBox.confirm(`确定要${actionText}产品「${row.name || row.productName}」吗？`, `${actionText}确认`, { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary', 
      type: action === 'restart' ? 'warning' : 'info',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  actionLoading.value[row.id] = true;
  try {
    await userProductApi.operate(row.id, action as 'start' | 'stop' | 'restart');
    ElMessage.success(`${actionText}指令已发送`);
    await loadList();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    actionLoading.value[row.id] = false;
  }
}

// 同步状态
async function onSync(row: any) {
  syncLoading.value[row.id] = true;
  try {
    await userProductApi.sync(row.id);
    ElMessage.success('状态已同步');
    await loadList();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    syncLoading.value[row.id] = false;
  }
}

// 打开续费弹窗：同时拉取续费价格 + 用户最新余额
async function openRenewDialog(row: any) {
  renewDialog.productId = row.id;
  renewDialog.productName = row.name || row.productName || '产品';
  renewDialog.duration = 1;
  renewDialog.prices = null;
  renewDialog.balance = Number(authStore.user?.balance || 0);
  renewDialog.visible = true;

  // 并行拉取续费价格 + 用户最新 profile（刷新余额）
  renewDialog.priceLoading = true;
  try {
    const [priceRes, profileRes] = await Promise.all([
      userProductApi.getRenewPrice(row.id).catch((e) => {
        // 价格加载失败时不阻断弹窗，仅记录 null（按钮允许尝试续费）
        console.warn('获取续费价格失败:', e);
        return null;
      }),
      authApi.profile().catch(() => null),
    ]);
    if (priceRes?.data?.prices) {
      renewDialog.prices = priceRes.data.prices;
    } else if (priceRes?.data) {
      // 兼容后端可能直接返回 prices 对象
      renewDialog.prices = (priceRes.data as any).prices || (priceRes.data as any);
    }
    if (profileRes?.data?.balance != null) {
      renewDialog.balance = Number(profileRes.data.balance || 0);
      // 同步更新 authStore 中的余额，避免其他页面显示旧值
      if (authStore.user) {
        authStore.user = { ...authStore.user, balance: Number(profileRes.data.balance) };
      }
    }
  } finally {
    renewDialog.priceLoading = false;
  }
}

// 跳转到充值页面
function goToRecharge() {
  renewDialog.visible = false;
  router.push('/dashboard/finance');
}

// 余额不足弹窗（可点击"立即去充值"）
async function showInsufficientBalanceDialog() {
  try {
    await ElMessageBox.confirm(
      `当前账户余额 ${formatMoney(renewDialog.balance)}，续费需 ${formatMoney(currentRenewPrice.value || 0)}，差额 ${formatMoney(shortageAmount.value)}。请先充值后再续费。`,
      '余额不足',
      {
        confirmButtonText: '立即去充值',
        cancelButtonText: '稍后再说',
        type: 'warning',
        customClass: 'keke-confirm-box',
        confirmButtonClass: 'el-button--warning',
      },
    );
    goToRecharge();
  } catch {
    // 用户取消
  }
}

// 确认续费
async function confirmRenew() {
  if (!renewDialog.productId) return;
  // 余额检查：若价格已加载且余额不足，弹窗提示并阻止续费
  if (currentRenewPrice.value != null && !isBalanceEnough.value) {
    showInsufficientBalanceDialog();
    return;
  }
  renewDialog.loading = true;
  try {
    await userProductApi.renew(renewDialog.productId, renewDialog.duration);
    ElMessage.success('续费成功');
    renewDialog.visible = false;
    // 续费后刷新用户余额（雨云侧扣费后本地不一定同步，但刷新以防下次显示旧值）
    authStore.fetchProfile().catch(() => {});
    await loadList();
  } catch (e: any) {
    // 提取后端返回的错误码和消息（http 拦截器已把 code/message 挂到 error 上）
    const errCode = String(e?.code || e?.response?.data?.code || '');
    const errMsg = String(e?.message || e?.response?.data?.message || '');
    // 余额不足错误：弹出余额不足弹窗（含"立即去充值"按钮）
    if (errCode === 'INSUFFICIENT_BALANCE' ||
        errMsg.includes('余额不足') || errMsg.includes('余额') ||
        errMsg.includes('balance') || errMsg.includes('insufficient')) {
      // 拉取最新余额后弹窗
      try {
        const profileRes = await authApi.profile();
        if (profileRes?.data?.balance != null) {
          renewDialog.balance = Number(profileRes.data.balance || 0);
          if (authStore.user) {
            authStore.user = { ...authStore.user, balance: Number(profileRes.data.balance) };
          }
        }
      } catch {
        // ignore
      }
      showInsufficientBalanceDialog();
    }
    // 其他错误已由 http 拦截器统一弹消息提示，这里无需重复处理
  } finally {
    renewDialog.loading = false;
  }
}

// 打开管理面板
async function openPanel(row: any) {
  try {
    const res = await userProductApi.getPanelUrl(row.id);
    const url = res.data?.url || res.data?.panelUrl || res.data;
    if (url) {
      window.open(typeof url === 'string' ? url : String(url), '_blank');
    } else {
      ElMessage.warning('未获取到管理面板地址');
    }
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <div class="products-page">
    <!-- 页头 -->
    <header class="page-head">
      <span class="eyebrow">MY PRODUCTS</span>
      <h1 class="page-title font-display">我的产品</h1>
    </header>

    <!-- 筛选区 -->
    <section class="filter-bar card">
      <div class="filter-row">
        <div class="filter-item">
          <label class="filter-label eyebrow">产品状态</label>
          <el-select v-model="query.state" placeholder="全部状态" clearable style="width: 160px" @change="onSearch">
            <el-option v-for="opt in stateOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </div>
        <div class="filter-actions">
          <el-button class="btn-outline" @click="onReset">重置</el-button>
          <el-button class="btn-gold" @click="onSearch">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
        </div>
      </div>
    </section>

    <!-- 产品表格 -->
    <section class="table-card card">
      <div class="table-wrap">
        <el-table
          v-loading="loading"
          :data="list"
          style="width: 100%"
          empty-text="暂无产品数据"
          class="dashed-table"
        >
          <el-table-column label="产品名称" min-width="180">
            <template #default="{ row }">
              <span class="product-name" @click="goDetail(row)">{{ row.name || row.productName || '未命名产品' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="productName" label="所属商品" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="110" align="center">
            <template #default="{ row }">
              <span
                class="status-text"
                :class="`is-${stateMap[row.state]?.type || 'info'}`"
              >
                {{ stateMap[row.state]?.text || row.state || '未知' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="到期时间" width="180">
            <template #default="{ row }">
              <span class="time-value" :class="{ 'is-expired': row.state === 'expired' }">{{ formatTime(row.expireAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="360" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button
                  size="small"
                  type="success"
                  :loading="actionLoading[row.id]"
                  :disabled="row.state !== 'paused' && row.state !== 'stopped'"
                  @click="onOperate(row, 'start', '开机')"
                >
                  开机
                </el-button>
                <el-button
                  size="small"
                  type="warning"
                  :loading="actionLoading[row.id]"
                  :disabled="row.state !== 'running'"
                  @click="onOperate(row, 'stop', '关机')"
                >
                  关机
                </el-button>
                <el-button
                  size="small"
                  :loading="actionLoading[row.id]"
                  :disabled="row.state !== 'running'"
                  @click="onOperate(row, 'restart', '重启')"
                >
                  重启
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  plain
                  @click="openRenewDialog(row)"
                >
                  续费
                </el-button>
                <el-button
                  size="small"
                  @click="openPanel(row)"
                >
                  管理面板
                </el-button>
                <el-button
                  size="small"
                  link
                  :loading="syncLoading[row.id]"
                  @click="onSync(row)"
                >
                  同步
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </section>

    <!-- 续费弹窗 -->
    <el-dialog
      v-model="renewDialog.visible"
      title="产品续费"
      width="460px"
      :close-on-click-modal="false"
    >
      <div class="renew-dialog-body">
        <div class="renew-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>续费产品：{{ renewDialog.productName }}</span>
        </div>

        <!-- 续费时长选择 + 价格展示 -->
        <el-form label-width="90px" label-position="right">
          <el-form-item label="续费时长">
            <el-select v-model="renewDialog.duration" style="width: 100%" :loading="renewDialog.priceLoading">
              <el-option
                v-for="opt in durationOptions"
                :key="opt.value"
                :label="opt.label + (renewDialog.prices && renewDialog.prices[String(opt.value)] != null
                  ? ` · ¥${Number(renewDialog.prices[String(opt.value)]).toFixed(2)}`
                  : '')"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>

          <!-- 价格汇总区 -->
          <div class="renew-summary" v-if="renewDialog.priceLoading">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>正在获取续费价格...</span>
          </div>
          <div class="renew-summary" v-else-if="currentRenewPrice != null">
            <div class="summary-row">
              <span class="summary-label">续费价格</span>
              <span class="summary-value price">{{ formatMoney(currentRenewPrice) }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">账户余额</span>
              <span class="summary-value" :class="{ 'is-short': !isBalanceEnough }">{{ formatMoney(renewDialog.balance) }}</span>
            </div>
            <div class="summary-row summary-total" v-if="!isBalanceEnough">
              <span class="summary-label">还需充值</span>
              <span class="summary-value shortage">{{ formatMoney(shortageAmount) }}</span>
            </div>
          </div>
          <div class="renew-summary renew-summary--hint" v-else>
            <el-icon><WarningFilled /></el-icon>
            <span>未能获取续费价格，可在确认后由系统尝试续费</span>
          </div>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="renewDialog.visible = false">取消</el-button>
        <el-button
          v-if="!isBalanceEnough && currentRenewPrice != null"
          class="btn-warning"
          @click="goToRecharge"
        >
          <el-icon><Wallet /></el-icon>
          立即去充值
        </el-button>
        <el-button
          class="btn-gold"
          :loading="renewDialog.loading"
          :disabled="!isBalanceEnough && currentRenewPrice != null"
          @click="confirmRenew"
        >
          确认续费
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.products-page {
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

// ============ 筛选栏 ============
.filter-bar {
  padding: 16px 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
  white-space: nowrap;
}

.filter-actions {
  display: flex;
  gap: 10px;
}

// ============ 表格卡 ============
.table-card {
  padding: 4px 8px 8px;
  overflow: visible;
  min-width: 0;
}

// 表格包裹：移动端水平滚动
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  :deep(.el-table) {
    min-width: 720px;
  }
}

// 虚线分隔表格：覆盖 el-table 内部边框
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

.product-name {
  color: var(--text-gold);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;

  &:hover {
    text-decoration: underline;
  }
}

.time-value {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;

  &.is-expired {
    color: var(--danger);
  }
}

// ============ 状态文字 ============
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger { color: var(--danger); }
  &.is-info { color: var(--text-tertiary); }
}

.row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

// 分页居中
.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 8px 8px;
}

// ============ 续费弹窗 ============
.renew-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.renew-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-subtle);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);

  .el-icon {
    color: var(--gold-400);
    font-size: 16px;
  }
}

// 续费价格汇总区
.renew-summary {
  margin-top: 8px;
  padding: 14px 16px;
  background: var(--bg-subtle);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 56px;

  // 加载中状态
  &:has(.is-loading) {
    flex-direction: row;
    align-items: center;
    color: var(--text-tertiary);
    font-size: 12px;
    .el-icon { font-size: 14px; }
  }

  // 提示状态（价格获取失败）
  &--hint {
    flex-direction: row;
    align-items: center;
    color: var(--text-tertiary);
    font-size: 12px;
    .el-icon {
      color: var(--warning);
      font-size: 14px;
    }
  }
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;

  .summary-label {
    color: var(--text-secondary);
  }

  .summary-value {
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-primary);
    font-weight: 500;

    &.price {
      color: var(--gold-400);
      font-size: 16px;
      font-weight: 600;
    }

    &.is-short {
      color: var(--danger);
    }

    &.shortage {
      color: var(--danger);
      font-weight: 600;
    }
  }

  &.summary-total {
    padding-top: 8px;
    border-top: 1px dashed var(--border-base);
    margin-top: 4px;
  }
}

// 余额不足时的"立即去充值"按钮
.btn-warning {
  background: var(--warning, #f59e0b) !important;
  border-color: var(--warning, #f59e0b) !important;
  color: #fff !important;

  &:hover {
    opacity: 0.9;
  }
}

// ============ 响应式 ============
@include tablet-down {
  .products-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .filter-bar {
    padding: 14px 16px;
  }
  .pagination-wrap {
    padding: 12px 4px 4px;
  }
}

// 手机端：筛选纵向堆叠 + 分页居中
@include mobile {
  .products-page {
    gap: 12px;
  }
  .page-title {
    font-size: 20px;
  }
  .filter-bar {
    padding: 12px;
  }
  .filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .filter-item {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .filter-item :deep(.el-select) {
    width: 100% !important;
  }
  .filter-actions {
    justify-content: stretch;
    .el-button {
      flex: 1;
    }
  }
  .table-card {
    padding: 2px 4px 4px;
  }
  .row-actions {
    gap: 4px;
    .el-button {
      margin-left: 0 !important;
    }
  }
  .pagination-wrap {
    padding: 10px 4px 4px;
  }
  .renew-tip {
    padding: 10px 12px;
    font-size: 12px;
  }
}
</style>
