<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';
import dayjs from 'dayjs';

interface Coupon {
  id: number;
  code: string;
  name: string;
  type: 'fixed' | 'percent';
  value: number;
  minSpend: number;
  total: number;
  used: number;
  perUserLimit: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

const loading = ref(false);
const saving = ref(false);
const coupons = ref<Coupon[]>([]);
const total = ref(0);

const filters = reactive({
  page: 1,
  pageSize: 10,
});

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);

const defaultForm = (): Coupon => ({
  id: 0,
  code: '',
  name: '',
  type: 'fixed',
  value: 0,
  minSpend: 0,
  total: -1,
  used: 0,
  perUserLimit: 1,
  startTime: '',
  endTime: '',
  enabled: true,
});

const form = reactive<Coupon>(defaultForm());

// 日期范围
const dateRange = ref<[string, string] | []>([]);

function formatMoney(n?: number) {
  if (n === null || n === undefined) return '¥0.00';
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-';
}

function formatDate(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD') : '-';
}

// 生成随机券码
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  form.code = code;
}

async function loadList() {
  loading.value = true;
  try {
    const res: any = await adminApi.coupons({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    if (res?.success) {
      coupons.value = res.data?.list || res.data?.items || [];
      total.value = res.data?.total || 0;
    }
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
  dateRange.value = [];
  dialogVisible.value = true;
}

function openEdit(row: any) {
  dialogMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(form, defaultForm(), JSON.parse(JSON.stringify(row)));
  dateRange.value = row.startTime && row.endTime ? [row.startTime, row.endTime] : [];
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.code.trim()) {
    ElMessage.warning('请填写券码');
    return;
  }
  if (!form.name.trim()) {
    ElMessage.warning('请填写优惠券名称');
    return;
  }
  if (form.value <= 0) {
    ElMessage.warning(form.type === 'fixed' ? '面额必须大于 0' : '折扣比例必须大于 0');
    return;
  }
  if (form.type === 'percent' && form.value > 100) {
    ElMessage.warning('折扣比例不能超过 100');
    return;
  }
  if (dateRange.value && dateRange.value.length === 2) {
    form.startTime = dateRange.value[0];
    form.endTime = dateRange.value[1];
  } else {
    form.startTime = '';
    form.endTime = '';
  }
  saving.value = true;
  try {
    const payload = { ...form };
    delete (payload as any).id;
    delete (payload as any).used;
    const res: any =
      dialogMode.value === 'create'
        ? await adminApi.createCoupon(payload)
        : await adminApi.updateCoupon(editingId.value!, payload);
    if (res?.success) {
      ElMessage.success(dialogMode.value === 'create' ? '优惠券已创建' : '优惠券已更新');
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
    await ElMessageBox.confirm(`确认删除优惠券「${row.name}」？此操作不可恢复。`, '删除优惠券', { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary', 
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    const res: any = await adminApi.deleteCoupon(row.id);
    if (res?.success) {
      ElMessage.success('优惠券已删除');
      await loadList();
    }
  } catch (e) {
    // 忽略
  }
}

async function handleToggleEnabled(row: any) {
  const target = !row.enabled;
  try {
    const res: any = await adminApi.updateCoupon(row.id, { enabled: target });
    if (res?.success) {
      ElMessage.success(target ? '已启用' : '已禁用');
      row.enabled = target;
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
  <div class="admin-coupons">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">COUPON MANAGEMENT</span>
        <h2 class="page-title font-display">优惠券管理</h2>
      </div>
      <div class="header-actions">
        <el-button class="btn-gold" @click="openCreate">
          <el-icon style="margin-right: 6px;"><Plus /></el-icon>
          新建优惠券
        </el-button>
      </div>
    </div>

    <!-- 列表卡 -->
    <div class="card table-card">
      <div class="table-wrap">
        <el-table :data="coupons" v-loading="loading">
          <el-table-column prop="code" label="券码" width="140">
            <template #default="{ row }">
              <span class="code-chip">{{ row.code }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="140">
            <template #default="{ row }">
              <span class="coupon-name">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="100" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="row.type === 'fixed' ? 'is-warning' : 'is-success'">
                {{ row.type === 'fixed' ? '固定金额' : '百分比' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="面额/折扣" width="120" align="right">
            <template #default="{ row }">
              <span class="mono text-gold" v-if="row.type === 'fixed'">{{ formatMoney(row.value) }}</span>
              <span class="mono text-gold" v-else>{{ row.value }}%</span>
            </template>
          </el-table-column>
          <el-table-column label="最低消费" width="110" align="right">
            <template #default="{ row }">
              <span class="mono">{{ row.minSpend > 0 ? formatMoney(row.minSpend) : '无门槛' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="用量" width="120" align="center">
            <template #default="{ row }">
              <span class="mono">
                {{ row.used }} / {{ row.total === -1 ? '∞' : row.total }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="row.enabled ? 'is-success' : 'is-info'">
                {{ row.enabled ? '启用' : '禁用' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="有效期" min-width="180">
            <template #default="{ row }">
              <div class="date-range">
                <div class="mono">{{ formatDate(row.startTime) }}</div>
                <div class="date-sep">至 {{ formatDate(row.endTime) }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button class="admin-btn admin-btn-sm" @click="openEdit(row)">编辑</el-button>
              <el-button class="admin-btn admin-btn-sm" :class="row.enabled ? 'admin-btn-warn' : 'admin-btn-success'" @click="handleToggleEnabled(row)">
                {{ row.enabled ? '禁用' : '启用' }}
              </el-button>
              <el-button class="admin-btn admin-btn-sm admin-btn-danger" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无优惠券" /></template>
        </el-table>
      </div>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadList"
          @size-change="loadList"
        />
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建优惠券' : '编辑优惠券'"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="110px">
        <el-form-item label="券码" required>
          <div class="code-row">
            <el-input v-model="form.code" placeholder="如：NEWUSER2024" class="font-mono" />
            <el-button class="btn-outline" @click="generateCode">生成</el-button>
          </div>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：新人立减券" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio value="fixed">固定金额</el-radio>
            <el-radio value="percent">百分比折扣</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="form.type === 'fixed' ? '面额' : '折扣比例'" required>
          <el-input-number
            v-model="form.value"
            :min="0"
            :max="form.type === 'percent' ? 100 : 999999"
            :precision="2"
            controls-position="right"
          />
          <span class="form-tip" v-if="form.type === 'percent'">（0-100，表示百分比）</span>
          <span class="form-tip" v-else>（单位：元）</span>
        </el-form-item>
        <el-form-item label="最低消费">
          <el-input-number v-model="form.minSpend" :min="0" :precision="2" controls-position="right" />
          <span class="form-tip">0 表示无门槛</span>
        </el-form-item>
        <el-form-item label="总量">
          <el-input-number v-model="form.total" :min="-1" controls-position="right" />
          <span class="form-tip">-1 表示无限</span>
        </el-form-item>
        <el-form-item label="每人限领">
          <el-input-number v-model="form.perUserLimit" :min="1" :max="999" controls-position="right" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="禁用" />
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

.admin-coupons {
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

.coupon-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
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

.date-range {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;

  .date-sep {
    color: var(--text-tertiary);
    font-family: 'JetBrains Mono', monospace;
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

.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.code-row {
  display: flex;
  gap: 8px;
  width: 100%;

  .el-input {
    flex: 1;
  }
}

.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.font-mono {
  :deep(.el-input__inner) {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
  }
}

// ===== 响应式 =====
@include mobile {
  .pagination-wrap { padding: 12px; }
  .code-row { flex-direction: column; }
  .form-tip { margin-left: 0; display: block; margin-top: 4px; }
}
</style>
