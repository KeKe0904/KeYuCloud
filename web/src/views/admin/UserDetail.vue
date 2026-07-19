<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';

const route = useRoute();
const router = useRouter();

const userId = computed(() => Number(route.params.id));
const loading = ref(false);

const user = ref<any>({});
const balanceLogs = ref<any[]>([]);
const orders = ref<any[]>([]);
const products = ref<any[]>([]);
const tickets = ref<any[]>([]);

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

const orderStatusTag = (s: string) => {
  const map: Record<string, string> = {
    pending: 'warning', paid: 'success', opening: 'primary',
    completed: 'success', refunded: 'info', failed: 'danger', cancelled: 'info',
  };
  return map[s] || 'info';
};

const orderStatusLabel = (s: string) => {
  const map: Record<string, string> = {
    pending: '待支付', paid: '已支付', opening: '开通中',
    completed: '已完成', refunded: '已退款', failed: '失败', cancelled: '已取消',
  };
  return map[s] || s;
};

const productStatusTag = (s: string) => {
  const map: Record<string, string> = {
    running: 'success', stopped: 'warning', expired: 'info',
    error: 'danger', pending: 'info',
  };
  return map[s] || 'info';
};

const productStatusLabel = (s: string) => {
  const map: Record<string, string> = {
    running: '运行中', stopped: '已停机', expired: '已到期',
    error: '异常', pending: '待开通',
  };
  return map[s] || s;
};

const ticketStatusTag = (s: string) => {
  const map: Record<string, string> = {
    pending: 'warning', processing: 'primary', replied: 'success', closed: 'info',
  };
  return map[s] || 'info';
};

const ticketStatusLabel = (s: string) => {
  const map: Record<string, string> = {
    pending: '待处理', processing: '处理中', replied: '已回复', closed: '已关闭',
  };
  return map[s] || s;
};

const ticketPriorityTag = (p: string) => {
  const map: Record<string, string> = {
    low: 'info', medium: 'warning', high: 'danger', urgent: 'danger',
  };
  return map[p] || 'info';
};

const ticketPriorityLabel = (p: string) => {
  const map: Record<string, string> = {
    low: '低', medium: '中', high: '高', urgent: '紧急',
  };
  return map[p] || p;
};

const balanceLogTypeTag = (t: string) => {
  const map: Record<string, string> = {
    recharge: 'success', consume: 'warning', refund: 'primary',
    adjust: 'info', deduct: 'danger',
  };
  return map[t] || 'info';
};

const balanceLogTypeLabel = (t: string) => {
  const map: Record<string, string> = {
    recharge: '充值', consume: '消费', refund: '退款',
    adjust: '调整', deduct: '扣减',
  };
  return map[t] || t;
};

// 加载详情
const loadDetail = async () => {
  if (!userId.value) return;
  loading.value = true;
  try {
    const res: any = await adminApi.userDetail(userId.value);
    if (res?.success) {
      const d = res.data || {};
      user.value = d.user || d;
      balanceLogs.value = d.balanceLogs ?? d.balanceHistory ?? [];
      orders.value = d.orders ?? [];
      products.value = d.products ?? d.userProducts ?? [];
      tickets.value = d.tickets ?? [];
    }
  } catch {
    // 已拦截
  } finally {
    loading.value = false;
  }
};

// 操作：调整余额
const balanceDialog = reactive({
  visible: false, loading: false,
  amount: 0, remark: '',
});
const openBalance = () => {
  balanceDialog.amount = 0;
  balanceDialog.remark = '';
  balanceDialog.visible = true;
};
const submitBalance = async () => {
  if (!balanceDialog.amount) {
    ElMessage.warning('请输入调整金额');
    return;
  }
  if (!balanceDialog.remark.trim()) {
    ElMessage.warning('请输入备注');
    return;
  }
  balanceDialog.loading = true;
  try {
    const res: any = await adminApi.adjustBalance(
      userId.value, balanceDialog.amount, balanceDialog.remark.trim(),
    );
    if (res?.success) {
      ElMessage.success('余额调整成功');
      balanceDialog.visible = false;
      loadDetail();
    }
  } catch {} finally {
    balanceDialog.loading = false;
  }
};

// 操作：重置密码
const pwdDialog = reactive({ visible: false, loading: false, password: '' });
const openPwd = () => { pwdDialog.password = ''; pwdDialog.visible = true; };
const submitPwd = async () => {
  if (!pwdDialog.password || pwdDialog.password.length < 6) {
    ElMessage.warning('新密码至少 6 位');
    return;
  }
  pwdDialog.loading = true;
  try {
    const res: any = await adminApi.resetUserPassword(userId.value, pwdDialog.password);
    if (res?.success) {
      ElMessage.success('密码已重置');
      pwdDialog.visible = false;
    }
  } catch {} finally {
    pwdDialog.loading = false;
  }
};

// 操作：改状态
const onStatusChange = async (val: string) => {
  try {
    const res: any = await adminApi.updateUserStatus(userId.value, val);
    if (res?.success) {
      ElMessage.success('状态已更新');
      loadDetail();
    }
  } catch {
    loadDetail();
  }
};

// 操作：重建面板用户
const onRebuildPanel = () => {
  ElMessageBox.confirm(
    '确认要为该用户重建雨云面板用户吗？此操作仅在上游用户丢失时使用。',
    '重建面板用户',
    { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning' },
  )
    .then(async () => {
      try {
        const res: any = await adminApi.rebuildPanelUser(userId.value);
        if (res?.success) ElMessage.success('已重建面板用户');
      } catch {}
    })
    .catch(() => {});
};

// 跳转
const goOrder = (id: number) => router.push(`/admin/orders/${id}`);
const goTicket = (id: number) => router.push(`/admin/tickets/${id}`);
const goBack = () => router.push('/admin/users');

onMounted(() => loadDetail());
</script>

<template>
  <div v-loading="loading" class="user-detail">
    <!-- 顶部 -->
    <div class="page-header">
      <div class="header-left">
        <el-button :icon="'ArrowLeft'" @click="goBack">返回</el-button>
        <div class="header-title">
          <span class="eyebrow">USER DETAIL</span>
          <h2 class="page-title font-display">
            {{ user.nickname || user.username || '用户详情' }}
            <span class="user-id">#{{ userId }}</span>
          </h2>
        </div>
      </div>
      <div class="header-right">
        <el-button type="warning" :icon="'Wallet'" @click="openBalance">调整余额</el-button>
        <el-button :icon="'Key'" @click="openPwd">重置密码</el-button>
        <el-button type="danger" :icon="'RefreshRight'" @click="onRebuildPanel">重建面板</el-button>
      </div>
    </div>

    <!-- 基本信息卡 -->
    <div class="card info-card">
      <div class="card-head">
        <span class="card-title">基本信息</span>
      </div>
      <div class="info-grid">
        <div class="info-avatar">
          <el-avatar :size="72" class="user-avatar">
            {{ (user.nickname || user.username || '?').charAt(0).toUpperCase() }}
          </el-avatar>
          <div class="info-name">{{ user.nickname || user.username || '-' }}</div>
        </div>
        <div class="info-fields">
          <div class="info-item">
            <span class="info-label eyebrow">用户 ID</span>
            <span class="info-value">{{ user.id }}</span>
          </div>
          <div class="info-item">
            <span class="info-label eyebrow">用户名</span>
            <span class="info-value">{{ user.username || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label eyebrow">手机号</span>
            <span class="info-value">{{ user.phone || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label eyebrow">邮箱</span>
            <span class="info-value">{{ user.email || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label eyebrow">余额</span>
            <span class="info-value money">{{ formatMoney(user.balance) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label eyebrow">累计消费</span>
            <span class="info-value money">{{ formatMoney(user.totalSpent) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label eyebrow">状态</span>
            <el-select
              :model-value="user.status"
              size="small"
              style="width: 100px"
              @change="onStatusChange"
            >
              <el-option label="正常" value="active" />
              <el-option label="禁用" value="disabled" />
              <el-option label="封禁" value="banned" />
            </el-select>
          </div>
          <div class="info-item">
            <span class="info-label eyebrow">注册时间</span>
            <span class="info-value">{{ formatDate(user.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label eyebrow">最后登录</span>
            <span class="info-value">{{ formatDate(user.lastLoginAt) }}</span>
          </div>
          <div class="info-item" v-if="user.panelUserId">
            <span class="info-label eyebrow">面板用户 ID</span>
            <span class="info-value font-mono">{{ user.panelUserId }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 余额调整历史 -->
    <div class="card section-card">
      <div class="card-head">
        <span class="card-title">余额调整历史</span>
      </div>
      <div class="table-wrap">
        <el-table :data="balanceLogs" size="small">
          <el-table-column prop="id" label="ID" width="70" align="center" />
          <el-table-column prop="type" label="类型" width="100">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${balanceLogTypeTag(row.type)}`">
                {{ balanceLogTypeLabel(row.type) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="120" align="right">
            <template #default="{ row }">
              <span :class="['amount', Number(row.amount) >= 0 ? 'plus' : 'minus']">
                {{ Number(row.amount) >= 0 ? '+' : '' }}{{ formatMoney(row.amount) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="balanceBefore" label="变更前" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.balanceBefore) }}</template>
          </el-table-column>
          <el-table-column prop="balanceAfter" label="变更后" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.balanceAfter) }}</template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <template #empty><el-empty description="暂无余额记录" /></template>
        </el-table>
      </div>
    </div>

    <!-- 订单列表 -->
    <div class="card section-card">
      <div class="card-head">
        <span class="card-title">订单列表</span>
      </div>
      <div class="table-wrap">
        <el-table :data="orders" size="small">
          <el-table-column prop="orderNo" label="订单号" min-width="170" show-overflow-tooltip />
          <el-table-column prop="productName" label="商品" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.productName || row.product?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${orderStatusTag(row.status)}`">
                {{ orderStatusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button class="admin-btn admin-btn-sm" @click="goOrder(row.id)">详情</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无订单" /></template>
        </el-table>
      </div>
    </div>

    <!-- 产品列表 -->
    <div class="card section-card">
      <div class="card-head">
        <span class="card-title">产品列表</span>
      </div>
      <div class="table-wrap">
        <el-table :data="products" size="small">
          <el-table-column prop="id" label="ID" width="70" align="center" />
          <el-table-column prop="name" label="产品名" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.name || row.productName || '-' }}</template>
          </el-table-column>
          <el-table-column prop="productName" label="所属商品" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.productName || row.product?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${productStatusTag(row.status)}`">
                {{ productStatusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="expireAt" label="到期时间" width="170">
            <template #default="{ row }">{{ formatDate(row.expireAt) }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <template #empty><el-empty description="暂无产品" /></template>
        </el-table>
      </div>
    </div>

    <!-- 工单列表 -->
    <div class="card section-card">
      <div class="card-head">
        <span class="card-title">工单列表</span>
      </div>
      <div class="table-wrap">
        <el-table :data="tickets" size="small">
          <el-table-column prop="ticketNo" label="工单号" min-width="150" show-overflow-tooltip />
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${ticketStatusTag(row.status)}`">
                {{ ticketStatusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" width="90">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${ticketPriorityTag(row.priority)}`">
                {{ ticketPriorityLabel(row.priority) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button class="admin-btn admin-btn-sm" @click="goTicket(row.id)">详情</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无工单" /></template>
        </el-table>
      </div>
    </div>

    <!-- 调整余额弹窗 -->
    <el-dialog v-model="balanceDialog.visible" title="调整用户余额" width="460px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="当前余额">
          <span class="money">{{ formatMoney(user.balance) }}</span>
        </el-form-item>
        <el-form-item label="调整金额" required>
          <el-input-number
            v-model="balanceDialog.amount"
            :precision="2"
            :step="100"
            :min="-100000"
            :max="100000"
            controls-position="right"
            style="width: 100%"
          />
          <div class="form-tip">正数增加，负数扣减</div>
        </el-form-item>
        <el-form-item label="备注" required>
          <el-input v-model="balanceDialog.remark" type="textarea" :rows="3" placeholder="调整原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="balanceDialog.visible = false">取消</el-button>
        <el-button class="admin-btn admin-btn-primary" :loading="balanceDialog.loading" @click="submitBalance">确认调整</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog v-model="pwdDialog.visible" title="重置密码" width="420px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="新密码" required>
          <el-input v-model="pwdDialog.password" type="password" show-password placeholder="至少 6 位" />
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
.user-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .page-title {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
    line-height: 1.2;

    .user-id {
      font-size: 14px;
      color: var(--text-tertiary);
      font-weight: 400;
      font-family: 'JetBrains Mono', monospace;
    }
  }
}

// ============ 卡片头 ============
.card-head {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-base);
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.info-card {
  .info-grid {
    display: flex;
    gap: 32px;
    padding: 20px;
  }

  .info-avatar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding-right: 32px;
    border-right: 1px dashed var(--border-base);
  }

  .user-avatar {
    background: var(--gradient-gold);
    color: var(--text-inverse);
    font-size: 28px;
    font-weight: 600;
  }

  .info-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .info-fields {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px 24px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .info-value {
      font-size: 14px;
      color: var(--text-primary);
      font-weight: 500;
    }
  }
}

// ============ 状态纯文字 ============
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--text-gold); }
  &.is-danger { color: var(--danger); }
  &.is-primary { color: var(--text-gold); }
  &.is-info { color: var(--text-tertiary); }
}

.money {
  color: var(--text-gold);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.amount.plus { color: var(--success); font-weight: 600; }
.amount.minus { color: var(--danger); font-weight: 600; }

// ============ 表格简约化（虚线分隔）============
.section-card {
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
      padding: 12px 16px;
    }

    .el-table__cell {
      border-bottom: 1px dashed var(--border-base);
      padding: 10px 16px;
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
    min-width: 720px;
  }
}

.form-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

@media (max-width: 992px) {
  .info-card {
    .info-grid { flex-direction: column; }
    .info-avatar {
      border-right: none;
      border-bottom: 1px dashed var(--border-base);
      padding: 0 0 16px;
    }
    .info-fields { grid-template-columns: repeat(2, 1fr); }
  }
}

// ===== 响应式增强（mixin）=====
// 平板：信息字段保持 2 列，操作按钮允许换行
@include tablet {
  .page-header {
    .header-right { gap: 6px; }
  }
}

// 手机：信息字段单列堆叠，按钮组纵向排列，表格横向滚动
@include mobile {
  .user-detail { gap: 12px; }
  .page-header {
    flex-direction: column;
    align-items: stretch;
    .header-left { gap: 8px; }
    .header-right {
      flex-wrap: wrap;
      .el-button { flex: 1; min-width: 0; }
    }
    .page-title { font-size: 18px; }
  }
  .info-card {
    .info-grid { gap: 16px; padding: 16px; }
    .info-avatar { padding: 0 0 12px; }
    .info-fields { grid-template-columns: 1fr; gap: 12px; }
  }
  .card-head { padding: 12px 16px; }
}
</style>
