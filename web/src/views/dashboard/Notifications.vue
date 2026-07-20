<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { notificationApi } from '@/api/ticket';
import { useNotificationStore } from '@/stores/notification';

const notifStore = useNotificationStore();

// 列表数据
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 当前 tab
const activeTab = ref<'all' | 'unread' | 'order' | 'ticket' | 'system'>('all');

// 分页
const query = reactive({
  page: 1,
  pageSize: 10,
});

// 未读计数（当前页）
const unreadCount = computed(() => list.value.filter((n) => !n.isRead).length);

// 类型映射
const typeMap: Record<string, { text: string; type: string }> = {
  order: { text: '订单', type: 'info' },
  ticket: { text: '工单', type: 'info' },
  system: { text: '系统', type: 'info' },
  payment: { text: '财务', type: 'info' },
  product: { text: '产品', type: 'info' },
};

// tab 选项
const tabOptions = [
  { label: '全部', value: 'all' },
  { label: '未读', value: 'unread' },
  { label: '订单', value: 'order' },
  { label: '工单', value: 'ticket' },
  { label: '系统', value: 'system' },
];

// 格式化时间
function formatTime(val: string) {
  if (!val) return '-';
  try {
    return new Date(val).toLocaleString('zh-CN');
  } catch {
    return val;
  }
}

// 当前 tab 对应的筛选参数
function getQueryParams() {
  const params: any = {
    page: query.page,
    pageSize: query.pageSize,
  };
  if (activeTab.value === 'unread') {
    params.isRead = false;
  } else if (activeTab.value !== 'all') {
    params.type = activeTab.value;
  }
  return params;
}

// 加载列表
async function loadList() {
  loading.value = true;
  try {
    const res = await notificationApi.list(getQueryParams());
    list.value = res.data?.list || res.data?.items || [];
    total.value = res.data?.total || 0;
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false;
  }
}

// tab 切换
function onTabChange(tab: string) {
  activeTab.value = tab as typeof activeTab.value;
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

// 点击单条标记已读
async function onMarkRead(row: any) {
  if (row.isRead) return;
  try {
    await notificationApi.markRead(row.id);
    row.isRead = true;
    // 同步刷新 store 中的未读数（红点立即消失）
    notifStore.fetchUnreadCount();
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

// 全部标记已读
async function onMarkAllRead() {
  try {
    await notificationApi.markAllRead();
    ElMessage.success('已全部标记为已读');
    await loadList();
    // 同步刷新 store 中的未读数（红点立即消失）
    notifStore.fetchUnreadCount();
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

// 获取类型信息
function getTypeInfo(type: string) {
  return typeMap[type] || { text: type || '通知', type: 'info' };
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <div class="notifications-page">
    <!-- 页头 -->
    <header class="page-head">
      <div class="head-meta">
        <span class="eyebrow">NOTIFICATIONS</span>
        <h1 class="page-title font-display">消息通知</h1>
      </div>
      <el-button class="btn-outline" @click="onMarkAllRead">
        <el-icon><Check /></el-icon>
        全部标记已读
      </el-button>
    </header>

    <!-- 筛选 tab -->
    <section class="filter-card card">
      <div class="tab-row">
        <button type="button"
          v-for="opt in tabOptions"
          :key="opt.value"
          class="tab-item"
          :class="{ 'is-active': activeTab === opt.value }"
          @click="onTabChange(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </section>

    <!-- 消息列表 -->
    <section class="list-card card" v-loading="loading">
      <el-empty v-if="!list.length && !loading" description="暂无消息通知" :image-size="80" />
      <div v-else class="notification-list">
        <div
          v-for="item in list"
          :key="item.id"
          class="notification-item"
          :class="{ unread: !item.isRead }"
        >
          <div class="noti-rail"></div>
          <div class="noti-body">
            <div class="noti-head">
              <span class="noti-title">{{ item.title || '系统通知' }}</span>
              <span class="noti-type eyebrow">{{ getTypeInfo(item.type).text }}</span>
              <span v-if="!item.isRead" class="unread-dot"></span>
            </div>
            <div class="noti-content">{{ item.content || item.message || '' }}</div>
            <div class="noti-foot">
              <span class="noti-time font-mono">{{ formatTime(item.createdAt) }}</span>
              <el-button
                v-if="!item.isRead"
                link
                class="mark-btn"
                @click="onMarkRead(item)"
              >
                标记已读
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div class="pagination-wrap" v-if="list.length">
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
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.notifications-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页头 ============
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.head-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;

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

// ============ 筛选 tab ============
.filter-card {
  padding: 4px 16px;
  overflow: hidden;
}

.tab-row {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.tab-item {
  position: relative;
  background: transparent;
  border: none;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s var(--ease-out-expo);
  font-family: inherit;

  &:hover {
    color: var(--text-primary);
  }

  &.is-active {
    color: var(--text-primary);

    &::after {
      content: '';
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 0;
      height: 2px;
      background: var(--gold-500);
    }
  }
}

// ============ 列表卡 ============
.list-card {
  min-height: 240px;
  overflow: hidden;
}

.notification-list {
  display: flex;
  flex-direction: column;
}

.notification-item {
  display: flex;
  align-items: stretch;
  transition: background 0.2s var(--ease-out-expo);

  &:not(:last-child) {
    border-bottom: 1px dashed var(--border-base);
  }

  &:hover {
    background: var(--bg-hover);
  }
}

// 左侧 2px 竖线
.noti-rail {
  width: 2px;
  flex-shrink: 0;
  background: var(--border-base);
}

.notification-item.unread .noti-rail {
  background: var(--sakura);
}

.noti-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 20px;
}

.noti-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.noti-title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
}

.notification-item:not(.unread) .noti-title {
  font-weight: 500;
  color: var(--text-secondary);
}

.noti-type {
  display: inline-block;
}

.unread-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sakura);
  flex-shrink: 0;
}

.noti-content {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.65;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.noti-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
}

.noti-time {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.3px;
}

.mark-btn {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 0;

  &:hover {
    color: var(--sakura);
  }
}

.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 20px;
  border-top: 1px dashed var(--border-base);
}

// ============ 响应式 ============
@include tablet-down {
  .notifications-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .noti-body {
    padding: 14px 16px;
  }
}

@include mobile {
  .notifications-page {
    gap: 12px;
  }
  .page-head {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .page-title {
    font-size: 20px;
  }

  // 全部已读按钮全宽
  .page-head .el-button {
    width: 100%;
    justify-content: center;
  }

  // 筛选 tab 紧凑
  .filter-card {
    padding: 4px 8px;
  }
  .tab-item {
    padding: 12px 12px;
    font-size: 12px;

    &.is-active::after {
      left: 12px;
      right: 12px;
    }
  }

  // 通知项紧凑
  .noti-body {
    padding: 12px 14px;
    gap: 6px;
  }
  .noti-title {
    font-size: 13px;
  }
  .noti-content {
    font-size: 12px;
    -webkit-line-clamp: 3;
  }
  .noti-time {
    font-size: 10px;
  }

  .pagination-wrap {
    padding: 12px 8px;
  }
}
</style>
