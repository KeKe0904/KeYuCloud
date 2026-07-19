<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';
import dayjs from 'dayjs';

interface Announcement {
  id: number;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'important';
  pinned: boolean;
  status: 'draft' | 'published';
  startTime: string;
  endTime: string;
  publishedAt?: string;
  createdAt?: string;
}

const loading = ref(false);
const saving = ref(false);
const list = ref<Announcement[]>([]);
const total = ref(0);

const filters = reactive({
  page: 1,
  pageSize: 10,
});

const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref<number | null>(null);

const defaultForm = (): Announcement => ({
  id: 0,
  title: '',
  content: '',
  type: 'info',
  pinned: false,
  status: 'draft',
  startTime: '',
  endTime: '',
});

const form = reactive<Announcement>(defaultForm());

const dateRange = ref<[string, string] | []>([]);

const typeMap: Record<string, { label: string; type: '' | 'success' | 'warning' | 'danger' | 'info' }> = {
  info: { label: '普通', type: 'info' },
  warning: { label: '提醒', type: 'warning' },
  important: { label: '重要', type: 'danger' },
};

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-';
}

async function loadList() {
  loading.value = true;
  try {
    const res: any = await adminApi.announcements({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    if (res?.success) {
      list.value = res.data?.list || res.data?.items || [];
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
  if (!form.title.trim()) {
    ElMessage.warning('请填写公告标题');
    return;
  }
  if (!form.content.trim()) {
    ElMessage.warning('请填写公告内容');
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
    delete (payload as any).publishedAt;
    delete (payload as any).createdAt;
    const res: any =
      dialogMode.value === 'create'
        ? await adminApi.createAnnouncement(payload)
        : await adminApi.updateAnnouncement(editingId.value!, payload);
    if (res?.success) {
      ElMessage.success(dialogMode.value === 'create' ? '公告已创建' : '公告已更新');
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
    await ElMessageBox.confirm(`确认删除公告「${row.title}」？此操作不可恢复。`, '删除公告', { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary', 
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    const res: any = await adminApi.deleteAnnouncement(row.id);
    if (res?.success) {
      ElMessage.success('公告已删除');
      await loadList();
    }
  } catch (e) {
    // 忽略
  }
}

// 发布 / 撤回
async function handleTogglePublish(row: any) {
  const target = row.status === 'draft' ? 'published' : 'draft';
  const actionLabel = target === 'published' ? '发布' : '撤回';
  try {
    const res: any = await adminApi.updateAnnouncement(row.id, { status: target });
    if (res?.success) {
      ElMessage.success(`已${actionLabel}`);
      row.status = target;
    }
  } catch (e) {
    // 忽略
  }
}

async function handleTogglePin(row: any) {
  try {
    const res: any = await adminApi.updateAnnouncement(row.id, { pinned: !row.pinned });
    if (res?.success) {
      row.pinned = !row.pinned;
      ElMessage.success(row.pinned ? '已置顶' : '已取消置顶');
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
  <div class="admin-announcements">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">ANNOUNCEMENT MANAGEMENT</span>
        <h2 class="page-title font-display">公告管理</h2>
      </div>
      <div class="header-actions">
        <el-button class="btn-gold" @click="openCreate">
          <el-icon style="margin-right: 6px;"><Plus /></el-icon>
          新建公告
        </el-button>
      </div>
    </div>

    <!-- 列表卡 -->
    <div class="card table-card">
      <div class="table-wrap">
        <el-table :data="list" v-loading="loading">
          <el-table-column prop="id" label="ID" width="70" align="center">
            <template #default="{ row }">
              <span class="mono">{{ row.id }}</span>
            </template>
          </el-table-column>
          <el-table-column label="标题" min-width="240">
            <template #default="{ row }">
              <div class="title-cell">
                <el-icon v-if="row.pinned" class="pin-icon"><Top /></el-icon>
                <span class="title-text">{{ row.title }}</span>
                <span v-if="row.pinned" class="pin-badge">PIN</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="100" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${typeMap[row.type]?.type || 'info'}`">
                {{ typeMap[row.type]?.label || row.type }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <span class="status-text" :class="row.status === 'published' ? 'is-success' : 'is-info'">
                {{ row.status === 'published' ? '已发布' : '草稿' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="发布时间" width="160">
            <template #default="{ row }">
              <span v-if="row.publishedAt" class="mono">{{ formatTime(row.publishedAt) }}</span>
              <span v-else class="text-tertiary">-</span>
            </template>
          </el-table-column>
          <el-table-column label="有效期" min-width="200">
            <template #default="{ row }">
              <div v-if="row.startTime || row.endTime" class="date-range">
                <div class="mono">{{ formatTime(row.startTime) }}</div>
                <div class="date-sep">至 {{ formatTime(row.endTime) }}</div>
              </div>
              <span v-else class="text-tertiary">长期</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <el-button class="admin-btn admin-btn-sm" @click="openEdit(row)">编辑</el-button>
              <el-button class="admin-btn admin-btn-sm admin-btn-warn" @click="handleTogglePin(row)">
                {{ row.pinned ? '取消置顶' : '置顶' }}
              </el-button>
              <el-button class="admin-btn admin-btn-sm" :class="row.status === 'draft' ? 'admin-btn-success' : 'admin-btn-info'" @click="handleTogglePublish(row)">
                {{ row.status === 'draft' ? '发布' : '撤回' }}
              </el-button>
              <el-button class="admin-btn admin-btn-sm admin-btn-danger" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无公告" /></template>
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
      :title="dialogMode === 'create' ? '新建公告' : '编辑公告'"
      width="720px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="公告标题" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio value="info">普通</el-radio>
            <el-radio value="warning">提醒</el-radio>
            <el-radio value="important">重要</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            placeholder="公告正文内容..."
            maxlength="5000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间（可空）"
            end-placeholder="结束时间（可空）"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
          <div class="form-tip">留空表示长期有效</div>
        </el-form-item>
        <el-form-item label="置顶">
          <el-switch v-model="form.pinned" active-text="置顶显示" inactive-text="普通" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="draft">草稿</el-radio>
            <el-radio value="published">发布</el-radio>
          </el-radio-group>
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

.admin-announcements {
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


.title-cell {
  display: flex;
  align-items: center;
  gap: 8px;

  .pin-icon {
    color: var(--gold-400);
    font-size: 13px;
  }

  .title-text {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .pin-badge {
    display: inline-block;
    padding: 1px 6px;
    border: 1px solid var(--border-gold);
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    color: var(--text-gold);
    letter-spacing: 1px;
    background: var(--bg-subtle);
  }
}

.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.text-tertiary {
  color: var(--text-tertiary);
  font-size: 12px;
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

.form-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;
}

// ===== 响应式 =====
@include mobile {
  .pagination-wrap { padding: 12px; }
}
</style>
