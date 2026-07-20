<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ticketApi } from '@/api/ticket';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const ticket = ref<any>(null);
const messages = ref<any[]>([]);

// 回复内容
const replyContent = ref('');
const replyLoading = ref(false);

// 评分
const ratingForm = reactive({
  rating: 5,
  comment: '',
  loading: false,
});

// 工单 ID
const ticketId = computed(() => Number(route.params.id));

// 状态映射
const statusMap: Record<string, { text: string; type: string }> = {
  open: { text: '待处理', type: 'warning' },
  pending: { text: '处理中', type: 'info' },
  replied: { text: '已回复', type: 'success' },
  closed: { text: '已关闭', type: 'info' },
};

// 类型映射（与后端 DTO 对齐）
const typeMap: Record<string, string> = {
  sale: '售前咨询',
  expense: '财务问题',
  tech: '技术支持',
  reward: '奖励返佣',
  feedback: '意见反馈',
};

// 优先级映射
const priorityMap: Record<string, { text: string; type: string }> = {
  low: { text: '低', type: 'info' },
  normal: { text: '中', type: 'info' },
  high: { text: '高', type: 'warning' },
  urgent: { text: '紧急', type: 'danger' },
};

// 是否已关闭
const isClosed = computed(() => ticket.value?.status === 'closed');

// 是否已升级（source=official 或 rainyunWorkorderId 非空都视为官方工单）
const isEscalated = computed(
  () => !!ticket.value?.rainyunWorkorderId || ticket.value?.source === 'official',
);

// 是否为本站工单（可升级）
const canEscalate = computed(
  () =>
    !isClosed.value &&
    !isEscalated.value &&
    (ticket.value?.source === 'local' || !ticket.value?.source) &&
    !!ticket.value?.userProductId,
);

// 对话区引用
const conversationRef = ref<HTMLElement | null>(null);

// 格式化时间
function formatTime(val: string) {
  if (!val) return '-';
  try {
    return new Date(val).toLocaleString('zh-CN');
  } catch {
    return val;
  }
}

// 加载工单详情
async function loadDetail() {
  if (!ticketId.value) return;
  loading.value = true;
  try {
    const res = await ticketApi.detail(ticketId.value);
    ticket.value = res.data;
    messages.value = res.data?.messages || res.data?.replies || [];
    await nextTick();
    scrollToBottom();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false;
  }
}

// 滚动到底部
function scrollToBottom() {
  if (conversationRef.value) {
    conversationRef.value.scrollTop = conversationRef.value.scrollHeight;
  }
}

// 判断消息是否为当前用户
// 后端字段：senderRole = 'user' | 'admin' | 'system' | 'rainyun_support'
function isUserMessage(msg: any) {
  return msg.senderRole === 'user' || msg.fromType === 'user';
}

// 是否为系统消息（雨云升级提示等）
function isSystemMessage(msg: any) {
  return msg.senderRole === 'system' || msg.fromType === 'system';
}

// 是否为雨云官方客服消息
function isRainyunSupport(msg: any) {
  return msg.senderRole === 'rainyun_support' || msg.fromType === 'rainyun_support';
}

// 获取发送人名称
function getSenderName(msg: any) {
  // 后端已通过 senderName 字段返回展示名（管理员昵称 / 用户昵称 / 雨云客服 xxx / 系统）
  if (msg.senderName) return msg.senderName;
  // 兜底：根据角色生成默认名
  if (isUserMessage(msg)) return '我';
  if (isSystemMessage(msg)) return '系统';
  if (isRainyunSupport(msg)) return '雨云客服';
  if (msg.senderRole === 'admin' || msg.fromType === 'admin') return '客服';
  return '客服';
}

// 获取头像首字符（用于无头像时的占位）
function getAvatarChar(msg: any) {
  const name = getSenderName(msg);
  return name ? name.charAt(0) : '?';
}

// 判断是否有自定义头像
function hasAvatar(msg: any) {
  return !!msg.senderAvatar;
}

// 回复
async function onReply() {
  if (!replyContent.value.trim()) {
    ElMessage.warning('请输入回复内容');
    return;
  }
  replyLoading.value = true;
  try {
    await ticketApi.reply(ticketId.value, replyContent.value);
    ElMessage.success('回复成功');
    replyContent.value = '';
    await loadDetail();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    replyLoading.value = false;
  }
}

// 关闭工单
async function onClose() {
  try {
    await ElMessageBox.confirm('确定要关闭此工单吗？关闭后仍可重新发起咨询。', '关闭工单确认', { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary', 
      type: 'warning',
      confirmButtonText: '确定关闭',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await ticketApi.close(ticketId.value);
    ElMessage.success('工单已关闭');
    await loadDetail();
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

// 升级到雨云官方工单（本站 → 官方，单向不可降级）
async function onEscalate() {
  if (!canEscalate.value) {
    ElMessage.warning('当前工单不满足升级条件（需为本站工单且已关联产品）');
    return;
  }
  try {
    await ElMessageBox.confirm(
      '升级后工单将转交雨云官方处理，本站工单 → 官方工单为单向操作，不可降级。是否继续？',
      '升级到雨云官方工单',
      { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning', confirmButtonText: '确定升级', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await ticketApi.escalate(ticketId.value);
    ElMessage.success('工单已升级到雨云官方');
    await loadDetail();
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

// 提交评分
async function onRate() {
  ratingForm.loading = true;
  try {
    await ticketApi.rate(ticketId.value, ratingForm.rating, ratingForm.comment);
    ElMessage.success('感谢您的评价');
    await loadDetail();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    ratingForm.loading = false;
  }
}

// 返回列表
function goBack() {
  router.push('/dashboard/tickets');
}

onMounted(() => {
  loadDetail();
});
</script>

<template>
  <div class="ticket-detail-page" v-loading="loading">
    <!-- 页头 -->
    <header class="page-head">
      <el-button link class="back-btn" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <div class="head-meta">
        <span class="eyebrow">TICKET DETAIL</span>
        <h1 class="page-title font-display">{{ ticket?.title || '工单详情' }}</h1>
        <div class="head-tags" v-if="ticket">
          <span
            class="status-text"
            :class="`is-${statusMap[ticket.status]?.type || 'info'}`"
          >
            {{ statusMap[ticket.status]?.text || ticket.status || '未知' }}
          </span>
          <span class="divider-dot">·</span>
          <span class="meta-text">{{ typeMap[ticket.type] || ticket.type || '-' }}</span>
          <span class="divider-dot">·</span>
          <span
            class="status-text"
            :class="`is-${priorityMap[ticket.priority]?.type || 'info'}`"
          >
            {{ priorityMap[ticket.priority]?.text || ticket.priority || '中' }}优先级
          </span>
        </div>
      </div>
    </header>

    <template v-if="ticket">
      <!-- 工单信息 -->
      <section class="detail-card card">
        <div class="card-header">
          <h2 class="card-title">工单信息</h2>
        </div>
        <div class="card-body">
          <el-descriptions :column="3" class="dashed-desc">
            <el-descriptions-item label="工单号">
              <span class="ticket-no font-mono">{{ ticket.ticketNo || `#${ticket.id}` }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatTime(ticket.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="最后更新">
              {{ formatTime(ticket.updatedAt) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </section>

      <!-- 对话区 -->
      <section class="conversation-card card">
        <div class="card-header">
          <h2 class="card-title">对话记录</h2>
        </div>
        <div class="conversation-body" ref="conversationRef">
          <el-empty v-if="!messages.length" description="暂无对话消息" :image-size="80" />
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="msg-row"
            :class="{
              'is-user': isUserMessage(msg),
              'is-system': isSystemMessage(msg),
              'is-rainyun': isRainyunSupport(msg),
            }"
          >
            <div class="msg-avatar">
              <img v-if="hasAvatar(msg)" :src="msg.senderAvatar || undefined" :alt="getSenderName(msg)" class="avatar-img" />
              <span v-else>{{ getAvatarChar(msg) }}</span>
            </div>
            <div class="msg-content">
              <div class="msg-meta">
                <span class="msg-sender">{{ getSenderName(msg) }}</span>
                <span v-if="isRainyunSupport(msg)" class="sender-tag">雨云官方</span>
                <span v-else-if="msg.senderRole === 'admin' || msg.fromType === 'admin'" class="sender-tag">客服</span>
                <span class="msg-time font-mono">{{ formatTime(msg.createdAt || msg.time) }}</span>
              </div>
              <div class="msg-bubble">{{ msg.content || msg.message || msg.text }}</div>
            </div>
          </div>
        </div>

        <!-- 回复区 -->
        <div class="reply-area" v-if="!isClosed">
          <el-input
            v-model="replyContent"
            type="textarea"
            :rows="3"
            placeholder="请输入回复内容..."
            resize="none"
            maxlength="2000"
            show-word-limit
          />
          <div class="reply-actions">
            <el-button
              v-if="canEscalate"
              class="btn-outline"
              @click="onEscalate"
            >
              升级到雨云官方工单
            </el-button>
            <el-button
              v-if="isEscalated"
              class="btn-outline"
              disabled
              title="官方工单不可降级为本站工单"
            >
              已是官方工单
            </el-button>
            <el-button @click="onClose">
              关闭工单
            </el-button>
            <el-button class="btn-gold" :loading="replyLoading" @click="onReply">
              <el-icon><Promotion /></el-icon>
              回复
            </el-button>
          </div>
        </div>
      </section>

      <!-- 评分区 -->
      <section v-if="isClosed" class="rate-card card">
        <div class="card-header">
          <h2 class="card-title">工单评价</h2>
        </div>
        <div class="card-body">
          <div v-if="ticket.rating" class="rated-show">
            <div class="rated-label eyebrow">您的评分</div>
            <el-rate :model-value="Number(ticket.rating)" disabled show-score />
            <div v-if="ticket.ratingComment" class="rated-comment">"{{ ticket.ratingComment }}"</div>
          </div>
          <div v-else class="rate-form">
            <div class="rate-row">
              <span class="rate-label eyebrow">满意度评分</span>
              <el-rate v-model="ratingForm.rating" show-score />
            </div>
            <div class="rate-row">
              <span class="rate-label eyebrow">评价内容</span>
              <el-input
                v-model="ratingForm.comment"
                type="textarea"
                :rows="3"
                placeholder="请填写对本次服务的评价（可选）"
                maxlength="500"
                show-word-limit
                style="max-width: 480px"
              />
            </div>
            <div class="rate-submit">
              <el-button class="btn-gold" :loading="ratingForm.loading" @click="onRate">
                提交评价
              </el-button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.ticket-detail-page {
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
  gap: 6px;
}

.back-btn {
  color: var(--text-tertiary);
  padding: 0;
  font-size: 13px;
  align-self: flex-start;

  &:hover {
    color: var(--text-gold);
  }
}

.head-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  .eyebrow {
    display: block;
  }
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
  letter-spacing: -0.3px;
}

.head-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.divider-dot {
  color: var(--text-tertiary);
  font-size: 12px;
}

.meta-text {
  font-size: 12px;
  color: var(--text-secondary);
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

// ============ 详情卡 ============
.detail-card {
  overflow: hidden;
  min-width: 0;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-base);
  gap: 12px;
  flex-wrap: wrap;
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-body {
  padding: 20px;
}

.ticket-no {
  color: var(--text-gold);
  font-size: 13px;
}

// 虚线分隔的 descriptions
:deep(.dashed-desc) {
  .el-descriptions__body {
    background: transparent;
  }
  .el-descriptions__table {
    table-layout: fixed;
  }
  .el-descriptions__label {
    background: transparent !important;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text-tertiary) !important;
  }
  .el-descriptions__content {
    font-size: 14px;
    color: var(--text-primary);
  }
  .el-descriptions__table td,
  .el-descriptions__table th {
    border: none !important;
    border-bottom: 1px dashed var(--border-base) !important;
  }
  .el-descriptions__table tr td:first-child,
  .el-descriptions__table tr th:first-child {
    border-right: 1px dashed var(--border-base) !important;
  }
}

// ============ 对话区 ============
.conversation-card {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.conversation-body {
  padding: 20px;
  max-height: 480px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.msg-row {
  display: flex;
  gap: 10px;
  max-width: 80%;

  &.is-user {
    flex-direction: row-reverse;
    align-self: flex-end;

    .msg-bubble {
      background: var(--gold-500);
      color: #fff;
      border-color: transparent;
    }

    .msg-meta {
      flex-direction: row-reverse;
    }

    .msg-avatar {
      background: var(--gold-500);
      color: #fff;
    }
  }

  &.is-system {
    align-self: center;
    max-width: 90%;

    .msg-bubble {
      background: var(--bg-subtle);
      color: var(--text-tertiary);
      font-size: 12px;
      font-style: italic;
      border-color: var(--border-base);
    }

    .msg-avatar {
      display: none;
    }
  }

  &.is-rainyun {
    .msg-avatar {
      background: linear-gradient(135deg, #6a5acd, #483d8b);
      color: #fff;
    }
    .sender-tag {
      background: rgba(106, 90, 205, 0.12);
      color: #6a5acd;
    }
  }
}

.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
  overflow: hidden;

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
  }
}

.sender-tag {
  display: inline-block;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.3px;
  background: rgba(212, 175, 55, 0.12);
  color: var(--text-gold);
  border: 1px solid rgba(212, 175, 55, 0.3);
}

.msg-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.msg-sender {
  font-weight: 600;
  color: var(--text-secondary);
}

.msg-time {
  font-size: 11px;
}

.msg-bubble {
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}

// ============ 回复区 ============
.reply-area {
  border-top: 1px solid var(--border-base);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

// ============ 评分卡 ============
.rated-show {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rated-label {
  display: block;
}

.rated-comment {
  font-size: 13px;
  color: var(--text-tertiary);
  font-style: italic;
  margin-top: 8px;
}

.rate-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.rate-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.rate-label {
  width: 100px;
  flex-shrink: 0;
  padding-top: 4px;
  display: block;
}

.rate-submit {
  display: flex;
  justify-content: flex-end;
}

// ============ 响应式 ============
@include tablet-down {
  .ticket-detail-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .card-header {
    padding: 14px 16px;
  }
  .card-body {
    padding: 16px;
  }
  .conversation-body {
    max-height: 420px;
    padding: 16px;
  }
  :deep(.dashed-desc) .el-descriptions__table {
    table-layout: fixed;
  }
}

// 手机端：对话气泡全宽 + 回复与评分堆叠
@include mobile {
  .ticket-detail-page {
    gap: 12px;
  }
  .page-title {
    font-size: 19px;
  }
  .card-header {
    padding: 12px 14px;
  }
  .card-title {
    font-size: 15px;
  }
  .card-body {
    padding: 12px;
  }

  // 描述列表单列堆叠
  :deep(.dashed-desc) {
    .el-descriptions__table {
      display: block;
      tbody {
        display: block;
      }
      tr {
        display: flex;
        flex-direction: column;
        width: 100% !important;
        padding-bottom: 8px;
      }
      td {
        display: block;
        width: 100% !important;
        border-right: none !important;
      }
      .el-descriptions__label {
        width: 100% !important;
        min-width: 0 !important;
        padding: 8px 12px 2px !important;
      }
      .el-descriptions__content {
        padding: 0 12px 8px !important;
      }
    }
  }

  // 对话区高度自适应
  .conversation-body {
    max-height: 60vh;
    padding: 12px;
    gap: 12px;
  }
  // 气泡占满更多宽度
  .msg-row {
    max-width: 92%;
  }
  .msg-avatar {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }
  .msg-bubble {
    padding: 8px 12px;
    font-size: 13px;
  }

  // 回复区
  .reply-area {
    padding: 12px;
  }
  .reply-actions {
    justify-content: stretch;
    .el-button {
      flex: 1;
      min-width: 0;
      margin-left: 0 !important;
    }
  }

  // 评分表单堆叠
  .rate-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .rate-label {
    width: auto;
    padding-top: 0;
  }
  .rate-submit {
    justify-content: stretch;
    .el-button {
      width: 100%;
    }
  }
}
</style>
