<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userProductApi } from '@/api/user-product';

const router = useRouter();

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
  productId: 0,
  productName: '',
  duration: 1,
});

// 续费时长选项（雨云官方仅支持 1/3/6/12 月）
const durationOptions = [
  { label: '1 个月', value: 1 },
  { label: '3 个月', value: 3 },
  { label: '6 个月', value: 6 },
  { label: '1 年', value: 12 },
];

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

// 打开续费弹窗
function openRenewDialog(row: any) {
  renewDialog.productId = row.id;
  renewDialog.productName = row.name || row.productName || '产品';
  renewDialog.duration = 1;
  renewDialog.visible = true;
}

// 确认续费
async function confirmRenew() {
  if (!renewDialog.productId) return;
  renewDialog.loading = true;
  try {
    await userProductApi.renew(renewDialog.productId, renewDialog.duration);
    ElMessage.success('续费成功');
    renewDialog.visible = false;
    await loadList();
  } catch (e) {
    // 错误已由拦截器统一提示
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
      width="440px"
      :close-on-click-modal="false"
    >
      <div class="renew-dialog-body">
        <div class="renew-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>续费产品：{{ renewDialog.productName }}</span>
        </div>
        <el-form label-width="90px" label-position="right">
          <el-form-item label="续费时长">
            <el-select v-model="renewDialog.duration" style="width: 100%">
              <el-option
                v-for="opt in durationOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="renewDialog.visible = false">取消</el-button>
        <el-button class="btn-gold" :loading="renewDialog.loading" @click="confirmRenew">
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
