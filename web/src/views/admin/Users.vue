<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import { adminApi } from '@/api/admin';

const router = useRouter();

// 筛选
const filters = reactive({
  keyword: '',
  status: '',
  page: 1,
  pageSize: 20,
});

// 列表
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 格式化
const formatMoney = (v: any): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '¥0.00';
  return '¥' + Number(v).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (v: any): string => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
};

// 状态映射
const statusTag = (status: string) => {
  const map: Record<string, string> = {
    active: 'success',
    disabled: 'danger',
    banned: 'danger',
  };
  return map[status] || 'info';
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    active: '正常',
    disabled: '禁用',
    banned: '封禁',
  };
  return map[status] || status;
};

// 加载列表
const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await adminApi.users({
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
      page: filters.page,
      pageSize: filters.pageSize,
    });
    if (res?.success) {
      const d = res.data;
      list.value = d?.list ?? d?.items ?? d?.records ?? [];
      total.value = d?.total ?? list.value.length;
    }
  } catch {
    // 错误已由拦截器处理
  } finally {
    loading.value = false;
  }
};

const onSearch = () => {
  filters.page = 1;
  loadList();
};

const onReset = () => {
  filters.keyword = '';
  filters.status = '';
  filters.page = 1;
  loadList();
};

const onPageChange = (p: number) => {
  filters.page = p;
  loadList();
};

const onSizeChange = (s: number) => {
  filters.pageSize = s;
  filters.page = 1;
  loadList();
};

// 调整余额弹窗
const balanceDialog = reactive({
  visible: false,
  loading: false,
  userId: 0,
  userName: '',
  currentBalance: 0,
  form: { amount: 0, remark: '' },
});
const balanceFormRef = ref<FormInstance>();

const openBalanceDialog = (row: any) => {
  balanceDialog.userId = row.id;
  balanceDialog.userName = row.nickname || row.username || row.phone || `#${row.id}`;
  balanceDialog.currentBalance = row.balance || 0;
  balanceDialog.form = { amount: 0, remark: '' };
  balanceDialog.visible = true;
};

const submitBalance = async () => {
  if (!balanceDialog.form.amount) {
    ElMessage.warning('请输入调整金额（正数为增加，负数为扣减）');
    return;
  }
  if (!balanceDialog.form.remark.trim()) {
    ElMessage.warning('请输入备注');
    return;
  }
  balanceDialog.loading = true;
  try {
    const res: any = await adminApi.adjustBalance(
      balanceDialog.userId,
      balanceDialog.form.amount,
      balanceDialog.form.remark.trim(),
    );
    if (res?.success) {
      ElMessage.success('余额调整成功');
      balanceDialog.visible = false;
      loadList();
    }
  } catch {
    // 已拦截
  } finally {
    balanceDialog.loading = false;
  }
};

// 状态切换
const onStatusChange = async (row: any) => {
  try {
    const res: any = await adminApi.updateUserStatus(row.id, row.status);
    if (res?.success) {
      ElMessage.success('状态已更新');
    } else {
      loadList();
    }
  } catch {
    loadList();
  }
};

// 重置密码弹窗
const pwdDialog = reactive({
  visible: false,
  loading: false,
  userId: 0,
  userName: '',
  newPassword: '',
});
const pwdFormRef = ref<FormInstance>();

const openPwdDialog = (row: any) => {
  pwdDialog.userId = row.id;
  pwdDialog.userName = row.nickname || row.username || row.phone || `#${row.id}`;
  pwdDialog.newPassword = '';
  pwdDialog.visible = true;
};

const submitPwd = async () => {
  if (!pwdDialog.newPassword || pwdDialog.newPassword.length < 6) {
    ElMessage.warning('新密码至少 6 位');
    return;
  }
  pwdDialog.loading = true;
  try {
    const res: any = await adminApi.resetUserPassword(pwdDialog.userId, pwdDialog.newPassword);
    if (res?.success) {
      ElMessage.success('密码已重置');
      pwdDialog.visible = false;
    }
  } catch {
    // 已拦截
  } finally {
    pwdDialog.loading = false;
  }
};

// 重建面板用户
const onRebuildPanel = (row: any) => {
  ElMessageBox.confirm(
    `确认要为用户「${row.nickname || row.username || row.id}」重建雨云面板用户吗？此操作仅在上游用户丢失时使用。`,
    '重建面板用户',
    { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning' },
  )
    .then(async () => {
      try {
        const res: any = await adminApi.rebuildPanelUser(row.id);
        if (res?.success) ElMessage.success('已重建面板用户');
      } catch {}
    })
    .catch(() => {});
};

const goDetail = (id: number) => router.push(`/admin/users/${id}`);

onMounted(() => loadList());
</script>

<template>
  <div class="admin-users">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="page-header-left">
        <span class="eyebrow">USER MANAGEMENT</span>
        <h2 class="page-title font-display">用户管理</h2>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="card filter-card">
      <el-form :inline="true" :model="filters" @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="手机号 / 昵称"
            clearable
            style="width: 200px"
            @keyup.enter="onSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable style="width: 130px">
            <el-option label="正常" value="active" />
            <el-option label="禁用" value="disabled" />
            <el-option label="封禁" value="banned" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button class="admin-btn admin-btn-primary" :icon="'Search'" @click="onSearch">搜索</el-button>
          <el-button :icon="'Refresh'" @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 列表 -->
    <div class="card table-card">
      <div class="table-wrap">
        <el-table v-loading="loading" :data="list">
          <el-table-column prop="id" label="ID" width="70" align="center" />
          <el-table-column label="用户" min-width="180">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar :size="34" class="user-avatar">
                  {{ (row.nickname || row.username || '?').charAt(0).toUpperCase() }}
                </el-avatar>
                <div class="user-meta">
                  <div class="user-name">{{ row.nickname || row.username || '-' }}</div>
                  <div class="user-sub">{{ row.username || row.email || '' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.phone || '-' }}</template>
          </el-table-column>
          <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.email || '-' }}</template>
          </el-table-column>
          <el-table-column prop="balance" label="余额" width="120" align="right">
            <template #default="{ row }">
              <span class="money">{{ formatMoney(row.balance) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="120" align="center">
            <template #default="{ row }">
              <el-select
                v-model="row.status"
                size="small"
                style="width: 90px"
                @change="onStatusChange(row)"
              >
                <el-option label="正常" value="active" />
                <el-option label="禁用" value="disabled" />
                <el-option label="封禁" value="banned" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="注册时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="290" fixed="right">
            <template #default="{ row }">
              <el-button class="admin-btn admin-btn-sm" @click="goDetail(row.id)">详情</el-button>
              <el-button class="admin-btn admin-btn-sm admin-btn-warn" @click="openBalanceDialog(row)">调整余额</el-button>
              <el-button class="admin-btn admin-btn-sm admin-btn-info" @click="openPwdDialog(row)">重置密码</el-button>
              <el-button class="admin-btn admin-btn-sm admin-btn-danger" @click="onRebuildPanel(row)">重建面板</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无用户数据" />
          </template>
        </el-table>
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </div>

    <!-- 调整余额弹窗 -->
    <el-dialog
      v-model="balanceDialog.visible"
      title="调整用户余额"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-form ref="balanceFormRef" :model="balanceDialog.form" label-width="80px">
        <el-form-item label="用户">
          <span class="dialog-user">{{ balanceDialog.userName }}</span>
        </el-form-item>
        <el-form-item label="当前余额">
          <span class="money">{{ formatMoney(balanceDialog.currentBalance) }}</span>
        </el-form-item>
        <el-form-item label="调整金额" required>
          <el-input-number
            v-model="balanceDialog.form.amount"
            :precision="2"
            :step="100"
            :min="-100000"
            :max="100000"
            controls-position="right"
            style="width: 100%"
          />
          <div class="form-tip">正数增加余额，负数扣减余额</div>
        </el-form-item>
        <el-form-item label="备注" required>
          <el-input
            v-model="balanceDialog.form.remark"
            type="textarea"
            :rows="3"
            placeholder="请填写调整原因，便于审计"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="balanceDialog.visible = false">取消</el-button>
        <el-button class="admin-btn admin-btn-primary" :loading="balanceDialog.loading" @click="submitBalance">确认调整</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog
      v-model="pwdDialog.visible"
      title="重置用户密码"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form ref="pwdFormRef" label-width="80px">
        <el-form-item label="用户">
          <span class="dialog-user">{{ pwdDialog.userName }}</span>
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input
            v-model="pwdDialog.newPassword"
            type="password"
            show-password
            placeholder="至少 6 位"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialog.visible = false">取消</el-button>
        <el-button class="admin-btn admin-btn-primary" :loading="pwdDialog.loading" @click="submitPwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;
.admin-users {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页面头 ============
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;

  .page-header-left {
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
    letter-spacing: -0.2px;
  }

  @include mobile {
    .page-title { font-size: 22px; }
  }
}

// ============ 筛选卡 ============
.filter-card {
  padding: 16px 20px;

  :deep(.el-form-item) {
    margin-bottom: 16px;
    margin-right: 12px;
  }
}

// ============ 表格卡 ============
.table-card {
  overflow: visible;
  min-width: 0;

  :deep(.el-table) {
    --el-table-border-color: var(--border-light);
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
      font-size: 11px;
      letter-spacing: 2px;
      color: var(--text-tertiary);
      font-weight: 500;
      text-transform: uppercase;
      font-family: 'JetBrains Mono', monospace;
      padding: 12px 0;
    }

    .el-table__cell {
      border-bottom: 1px dashed var(--border-base);
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

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  background: var(--gradient-gold);
  color: var(--text-inverse);
  font-weight: 600;
  flex-shrink: 0;
}

.user-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;

  .user-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
  }

  .user-sub {
    font-size: 12px;
    color: var(--text-tertiary);
    line-height: 1.3;
  }
}

.money {
  color: var(--text-gold);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

// 状态纯文字
.status-text {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--text-gold); }
  &.is-danger { color: var(--danger); }
  &.is-info { color: var(--text-tertiary); }
}

.pager {
  padding: 16px;
  display: flex;
  justify-content: center;
}

.dialog-user {
  font-weight: 600;
  color: var(--text-gold);
}

.form-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.4;
  margin-top: 4px;
}

// ===== 响应式适配 =====
// 平板及以下：筛选表单允许换行
@include tablet-down {
  .filter-card :deep(.el-form--inline .el-form-item) {
    margin-right: 0;
  }
}

// 手机：筛选表单改为纵向堆叠
@include mobile {
  .filter-card {
    padding: 12px 12px 0;
    :deep(.el-form--inline) {
      display: flex;
      flex-direction: column;
      .el-form-item {
        margin-right: 0;
        width: 100%;
        :deep(.el-input),
        :deep(.el-select),
        .el-input,
        .el-select { width: 100% !important; }
      }
    }
  }
  .pager {
    padding: 12px;
    justify-content: center;
  }
}
</style>
