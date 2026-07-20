<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi } from '@/api/admin';
import dayjs from 'dayjs';

const route = useRoute();
const router = useRouter();

const ticketId = computed(() => Number(route.params.id));

interface TicketMessage {
  id: number;
  content: string;
  // 后端实际字段
  fromType: 'user' | 'admin' | 'system' | 'rainyun_support';
  fromId?: number | null;
  fromName?: string | null;
  // 后端附加的展示字段（getTicket 时填充）
  senderRole?: 'user' | 'admin' | 'system' | 'rainyun_support';
  senderName?: string;
  senderAvatar?: string | null;
  senderId?: number | null;
  createdAt: string;
}

interface TicketTimeline {
  id: number;
  action: string;
  operator: string;
  detail?: string;
  createdAt: string;
}

interface TicketDetail {
  id: number;
  title: string;
  type: string;
  status: string;
  priority: string;
  userId: number;
  username: string;
  assigneeId?: number;
  assigneeName?: string;
  productId?: number;
  productName?: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  timelines: TicketTimeline[];
}

interface Admin {
  id: number;
  username: string;
  nickname: string;
  role: string;
}

const loading = ref(false);
const actionLoading = ref(false);
const ticket = ref<TicketDetail | null>(null);
const admins = ref<Admin[]>([]);
const replyContent = ref('');
const assignAdminId = ref<number | undefined>();

// ============ 实时刷新 ============
// 已读消息的最大 id，用于检测新消息
const lastReadMsgId = ref<number>(0);
// 新消息 id 集合（用于高亮标注）
const newMessageIds = ref<Set<number>>(new Set());
// 轮询定时器
let pollTimer: number | null = null;
// 轮询间隔（ms）：8 秒一次，平衡实时性与服务器压力
const POLL_INTERVAL = 8000;
// 自动滚动到底部的开关
const autoScroll = ref(true);
// 聊天列表 DOM 引用
const chatListRef = ref<HTMLElement | null>(null);

function isPolling() {
  return pollTimer !== null;
}

function startPolling() {
  if (pollTimer !== null) return;
  pollTimer = window.setInterval(async () => {
    // 工单已关闭不轮询
    if (isClosed.value) {
      stopPolling();
      return;
    }
    await silentRefresh();
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// 静默刷新：不显示 loading，检测新消息并标注
async function silentRefresh() {
  if (!ticketId.value) return;
  try {
    const res: any = await adminApi.ticketDetail(ticketId.value);
    if (res?.success && res.data) {
      const prevMsgs = ticket.value?.messages || [];
      const prevMaxId = prevMsgs.length ? Math.max(...prevMsgs.map(m => m.id)) : 0;
      const newMsgs = (res.data.messages || []).filter((m: TicketMessage) => m.id > prevMaxId);

      ticket.value = res.data;
      assignAdminId.value = res.data.assigneeId;

      // 如果有新消息
      if (newMsgs.length > 0) {
        // 标注新消息
        for (const m of newMsgs) {
          newMessageIds.value.add(m.id);
        }
        // 更新已读消息的最大 id
        lastReadMsgId.value = Math.max(...(res.data.messages || []).map((m: TicketMessage) => m.id));

        // 自动滚动到底部
        if (autoScroll.value) {
          await nextTick();
          scrollToBottom();
        }
      }
    }
  } catch (e) {
    // 静默失败
  }
}

function scrollToBottom() {
  if (chatListRef.value) {
    chatListRef.value.scrollTop = chatListRef.value.scrollHeight;
  }
}

function isNewMessage(msgId: number): boolean {
  return newMessageIds.value.has(msgId);
}

// 用户主动滚动时，判断是否取消自动滚动
function handleChatScroll() {
  if (!chatListRef.value) return;
  const el = chatListRef.value;
  // 距离底部 50px 以内视为"在底部"
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  autoScroll.value = atBottom;
}

// 状态/类型/优先级映射
const statusMap: Record<string, { label: string; type: string }> = {
  OPEN: { label: '待处理', type: 'warning' },
  IN_PROGRESS: { label: '处理中', type: 'info' },
  WAITING_USER: { label: '等待用户', type: 'info' },
  RESOLVED: { label: '已解决', type: 'success' },
  CLOSED: { label: '已关闭', type: 'info' },
  ESCALATED: { label: '已升级', type: 'danger' },
};

const priorityMap: Record<string, { label: string; type: string }> = {
  LOW: { label: '低', type: 'info' },
  NORMAL: { label: '普通', type: 'info' },
  HIGH: { label: '高', type: 'warning' },
  URGENT: { label: '紧急', type: 'danger' },
};

const typeMap: Record<string, string> = {
  CONSULT: '咨询',
  FAULT: '故障',
  COMPLAINT: '投诉',
  REFUND: '退款',
  ACCOUNT: '账号',
  OTHER: '其他',
};

const isClosed = computed(() => {
  const s = ticket.value?.status;
  return s === 'CLOSED' || s === 'RESOLVED';
});

function formatTime(t?: string) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-';
}

function formatShortTime(t?: string) {
  return t ? dayjs(t).format('MM-DD HH:mm') : '-';
}

// ============ 消息发送者辅助函数 ============
// 后端字段：fromType / senderRole（值均为小写：user/admin/system/rainyun_support）
function isUserMsg(msg: TicketMessage) {
  return msg.fromType === 'user' || msg.senderRole === 'user';
}
function isAdminMsg(msg: TicketMessage) {
  return msg.fromType === 'admin' || msg.senderRole === 'admin';
}
function isSystemMsg(msg: TicketMessage) {
  return msg.fromType === 'system' || msg.senderRole === 'system';
}
function isRainyunSupport(msg: TicketMessage) {
  return msg.fromType === 'rainyun_support' || msg.senderRole === 'rainyun_support';
}

// 获取发送者显示名（后端 senderName 已填充：管理员昵称/用户昵称/雨云客服 xxx/系统）
function getSenderName(msg: TicketMessage): string {
  if (msg.senderName) return msg.senderName;
  if (isUserMsg(msg)) return '用户';
  if (isAdminMsg(msg)) return '客服';
  if (isRainyunSupport(msg)) return '雨云客服';
  if (isSystemMsg(msg)) return '系统';
  return '未知';
}

// 获取头像首字符（无头像时占位）
function getAvatarChar(msg: TicketMessage): string {
  const name = getSenderName(msg);
  return name ? name.charAt(0) : '?';
}

function hasAvatar(msg: TicketMessage): boolean {
  return !!msg.senderAvatar;
}

async function loadDetail() {
  loading.value = true;
  try {
    const res: any = await adminApi.ticketDetail(ticketId.value);
    if (res?.success) {
      ticket.value = res.data;
      assignAdminId.value = res.data.assigneeId;
      // 初始化已读消息的最大 id
      const msgs = res.data?.messages || [];
      if (msgs.length) {
        lastReadMsgId.value = Math.max(...msgs.map((m: TicketMessage) => m.id));
      }
      // 首次加载滚动到底部
      await nextTick();
      scrollToBottom();
    }
  } catch (e) {
    // 错误已由拦截器提示
  } finally {
    loading.value = false;
  }
}

async function loadAdmins() {
  try {
    const res: any = await adminApi.admins();
    if (res?.success) admins.value = res.data || [];
  } catch (e) {
    // 忽略
  }
}

async function handleReply() {
  if (!replyContent.value.trim()) {
    ElMessage.warning('请输入回复内容');
    return;
  }
  actionLoading.value = true;
  try {
    const res: any = await adminApi.replyTicket(ticketId.value, replyContent.value.trim());
    if (res?.success) {
      ElMessage.success('回复成功');
      replyContent.value = '';
      // 立即刷新对话（不用等轮询）
      await silentRefresh();
      // 强制滚动到底部
      await nextTick();
      scrollToBottom();
    }
  } catch (e) {
    // 忽略
  } finally {
    actionLoading.value = false;
  }
}

async function handleAssign() {
  if (!assignAdminId.value) {
    ElMessage.warning('请选择受理人');
    return;
  }
  actionLoading.value = true;
  try {
    const res: any = await adminApi.assignTicket(ticketId.value, assignAdminId.value);
    if (res?.success) {
      ElMessage.success('分配成功');
      await loadDetail();
    }
  } catch (e) {
    // 忽略
  } finally {
    actionLoading.value = false;
  }
}

async function handleClose() {
  try {
    await ElMessageBox.confirm('确认关闭该工单？关闭后用户将无法继续回复。', '关闭工单', { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary', 
      confirmButtonText: '确认关闭',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  actionLoading.value = true;
  try {
    const res: any = await adminApi.closeTicket(ticketId.value);
    if (res?.success) {
      ElMessage.success('工单已关闭');
      await loadDetail();
    }
  } catch (e) {
    // 忽略
  } finally {
    actionLoading.value = false;
  }
}

async function handleEscalate() {
  try {
    await ElMessageBox.confirm(
      '升级到雨云官方工单后，将由雨云官方客服介入处理，本站将无法直接关闭。是否继续？',
      '升级工单',
      { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  confirmButtonText: '确认升级', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  actionLoading.value = true;
  try {
    const res: any = await adminApi.escalateTicket(ticketId.value);
    if (res?.success) {
      ElMessage.success('已升级到雨云官方工单');
      await loadDetail();
    }
  } catch (e) {
    // 忽略
  } finally {
    actionLoading.value = false;
  }
}

onMounted(() => {
  loadDetail();
  loadAdmins();
  // 启动轮询（仅当工单未关闭时）
  startPolling();
});

onBeforeUnmount(() => {
  // 离开页面时停止轮询，避免内存泄漏
  stopPolling();
});
</script>

<template>
  <div class="ticket-detail" v-loading="loading">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <el-button class="back-btn admin-btn" @click="router.push('/admin/tickets')">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回工单列表</span>
        </el-button>
        <span class="eyebrow" style="margin-top: 4px;">TICKET DETAIL</span>
        <h2 class="page-title font-display">{{ ticket?.title || '工单详情' }}</h2>
      </div>
      <div v-if="ticket" class="header-actions">
        <span class="status-text" :class="`is-${statusMap[ticket.status]?.type || 'info'}`">
          {{ statusMap[ticket.status]?.label || ticket.status }}
        </span>
        <span class="status-text" :class="`is-${priorityMap[ticket.priority]?.type || 'info'}`">
          {{ priorityMap[ticket.priority]?.label || ticket.priority }}
        </span>
      </div>
    </div>

    <template v-if="ticket">
      <!-- 基本信息卡 -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">工单信息</span>
          <span class="card-extra">{{ typeMap[ticket.type] || ticket.type }}</span>
        </div>
        <div class="card-body">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="工单编号">#{{ ticket.id }}</el-descriptions-item>
            <el-descriptions-item label="提交用户">{{ ticket.username }}</el-descriptions-item>
            <el-descriptions-item label="受理人">
              {{ ticket.assigneeName || '未分配' }}
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatTime(ticket.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="最后更新">{{ formatTime(ticket.updatedAt) }}</el-descriptions-item>
            <el-descriptions-item label="关联产品">
              <span v-if="ticket.productName" class="text-gold">{{ ticket.productName }}</span>
              <span v-else class="text-tertiary">无</span>
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <div class="content-grid">
        <!-- 对话区 -->
        <div class="card chat-card">
          <div class="card-head">
            <span class="card-title">对话记录</span>
            <span class="card-extra">{{ ticket.messages?.length || 0 }} 条</span>
          </div>
          <div class="card-body chat-body">
            <div class="chat-list" ref="chatListRef" @scroll="handleChatScroll">
              <div
                v-for="msg in ticket.messages"
                :key="msg.id"
                class="chat-item"
                :class="{
                  'is-user': isUserMsg(msg),
                  'is-admin': isAdminMsg(msg),
                  'is-system': isSystemMsg(msg),
                  'is-rainyun': isRainyunSupport(msg),
                  'is-new': isNewMessage(msg.id),
                }"
              >
                <div class="chat-avatar">
                  <img v-if="hasAvatar(msg)" :src="msg.senderAvatar || undefined" :alt="getSenderName(msg)" class="avatar-img" />
                  <span v-else>{{ getAvatarChar(msg) }}</span>
                </div>
                <div class="chat-main">
                  <div class="chat-meta">
                    <span class="chat-sender">
                      <el-icon v-if="isAdminMsg(msg)"><Service /></el-icon>
                      <el-icon v-else-if="isSystemMsg(msg)"><InfoFilled /></el-icon>
                      <el-icon v-else-if="isRainyunSupport(msg)"><ChatLineRound /></el-icon>
                      <el-icon v-else><User /></el-icon>
                      {{ getSenderName(msg) }}
                    </span>
                    <span v-if="isRainyunSupport(msg)" class="sender-tag tag-rainyun">雨云官方</span>
                    <span v-else-if="isAdminMsg(msg)" class="sender-tag tag-admin">客服</span>
                    <span v-else-if="isUserMsg(msg)" class="sender-tag tag-user">用户</span>
                    <span v-if="isNewMessage(msg.id)" class="sender-tag tag-new">新</span>
                    <span class="chat-time">{{ formatShortTime(msg.createdAt) }}</span>
                  </div>
                  <div class="chat-bubble">{{ msg.content }}</div>
                </div>
              </div>
              <el-empty v-if="!ticket.messages?.length" description="暂无对话" />
            </div>

            <!-- 实时状态提示 -->
            <div class="realtime-status">
              <span class="status-dot" :class="{ active: isPolling() }"></span>
              <span class="status-text" v-if="isPolling()">实时监听中（每 {{ POLL_INTERVAL / 1000 }}s 刷新）</span>
              <span class="status-text" v-else>已停止刷新</span>
              <span class="status-text" v-if="!autoScroll" style="margin-left: 12px; color: var(--warning);">
                · 有新消息时需手动下滑
              </span>
            </div>

            <!-- 回复区 -->
            <div class="reply-area" v-if="!isClosed">
              <el-input
                v-model="replyContent"
                type="textarea"
                :rows="3"
                placeholder="请输入回复内容..."
                maxlength="2000"
                show-word-limit
                @keydown.ctrl.enter="handleReply"
              />
              <div class="reply-actions">
                <span class="reply-hint">Ctrl + Enter 快速发送</span>
                <el-button class="btn-gold" :loading="actionLoading" @click="handleReply">
                  发送回复
                </el-button>
              </div>
            </div>
            <el-alert
              v-else
              class="closed-tip"
              title="该工单已关闭，无法继续回复"
              type="info"
              :closable="false"
              show-icon
            />
          </div>
        </div>

        <!-- 侧边操作区 -->
        <div class="side-area">
          <div class="card">
            <div class="card-head">
              <span class="card-title">工单操作</span>
            </div>
            <div class="card-body">
              <div class="action-block">
                <label class="action-label">分配受理人</label>
                <el-select
                  v-model="assignAdminId"
                  placeholder="选择管理员"
                  filterable
                  clearable
                  style="width: 100%"
                >
                  <el-option
                    v-for="a in admins"
                    :key="a.id"
                    :label="`${a.nickname} (${a.username})`"
                    :value="a.id"
                  />
                </el-select>
                <el-button
                  class="btn-gold full"
                  :loading="actionLoading"
                  :disabled="isClosed"
                  @click="handleAssign"
                >
                  分配
                </el-button>
              </div>

              <div class="divider-dashed action-divider"></div>

              <el-button
                class="btn-outline full"
                :loading="actionLoading"
                :disabled="isClosed"
                @click="handleClose"
              >
                <el-icon style="margin-right: 6px;"><CircleClose /></el-icon>
                关闭工单
              </el-button>
              <el-button
                class="btn-outline danger full"
                :loading="actionLoading"
                :disabled="isClosed"
                @click="handleEscalate"
              >
                <el-icon style="margin-right: 6px;"><Top /></el-icon>
                升级到雨云官方
              </el-button>
            </div>
          </div>

          <!-- 时间线 -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">工单时间线</span>
            </div>
            <div class="card-body">
              <el-timeline v-if="ticket.timelines?.length">
                <el-timeline-item
                  v-for="t in ticket.timelines"
                  :key="t.id"
                  :timestamp="formatTime(t.createdAt)"
                  placement="top"
                >
                  <div class="timeline-action">{{ t.action }}</div>
                  <div class="timeline-meta">
                    <span>操作人：{{ t.operator }}</span>
                    <span v-if="t.detail" class="timeline-detail">{{ t.detail }}</span>
                  </div>
                </el-timeline-item>
              </el-timeline>
              <el-empty v-else description="暂无时间线" :image-size="80" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.ticket-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 24px;
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
    gap: 4px;
  }

  .back-btn {
    padding: 0;
    height: auto;
    font-size: 13px;
    color: var(--text-tertiary);
    align-self: flex-start;
  }

  .page-title {
    margin: 4px 0 0;
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    letter-spacing: -0.3px;
  }

  .header-actions {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  @include mobile {
    .page-title { font-size: 22px; }
    .header-actions { width: 100%; gap: 12px; }
  }
}

// ============ 卡片 ============
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-base);

  .card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-extra {
    font-size: 12px;
    color: var(--text-tertiary);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 1px;
  }
}

.card-body {
  padding: 20px;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
  align-items: start;
}

@media (max-width: 1100px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

// ============ 对话区 ============
.chat-card {
  overflow: hidden;
}

.chat-body {
  display: flex;
  flex-direction: column;
}

.chat-list {
  max-height: 520px;
  overflow-y: auto;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-item {
  display: flex;
  gap: 10px;
  max-width: 70%;
  transition: background 0.4s ease;
  position: relative;

  // 管理员端：客服（admin）在右侧，用户（user）在左侧
  &.is-admin {
    flex-direction: row-reverse;
    align-self: flex-end;

    .chat-bubble {
      background: var(--gradient-gold);
      color: var(--text-inverse);
      border-radius: 8px 2px 8px 8px;
    }

    .chat-meta {
      flex-direction: row-reverse;
    }

    .chat-avatar {
      background: var(--gold-500);
      color: #fff;
    }
  }

  &.is-user {
    align-self: flex-start;

    .chat-bubble {
      background: var(--bg-subtle);
      color: var(--text-primary);
      border: 1px solid var(--border-base);
      border-radius: 2px 8px 8px 8px;
    }
  }

  &.is-rainyun {
    align-self: flex-start;

    .chat-avatar {
      background: linear-gradient(135deg, #6a5acd, #483d8b);
      color: #fff;
    }
    .chat-bubble {
      background: rgba(106, 90, 205, 0.06);
      color: var(--text-primary);
      border: 1px solid rgba(106, 90, 205, 0.3);
      border-radius: 2px 8px 8px 8px;
    }
  }

  // 兜底：未识别类型在左侧
  &:not(.is-user):not(.is-admin):not(.is-system):not(.is-rainyun) {
    align-self: flex-start;

    .chat-bubble {
      background: var(--bg-subtle);
      color: var(--text-primary);
      border: 1px solid var(--border-base);
      border-radius: 2px 8px 8px 8px;
    }
  }

  &.is-system {
    align-self: center;
    max-width: 90%;

    .chat-bubble {
      background: var(--info-bg);
      color: var(--info);
      border: 1px dashed var(--info);
      font-size: 12px;
      border-radius: 4px;
    }

    .chat-avatar {
      display: none;
    }
  }

  // 新消息高亮（闪烁动画）
  &.is-new {
    animation: newMsgFlash 1.5s ease-out;

    .chat-bubble {
      box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.5);
    }
  }
}

@keyframes newMsgFlash {
  0% { background: rgba(212, 175, 55, 0.15); }
  100% { background: transparent; }
}

.chat-avatar {
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

.chat-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-tertiary);

  .chat-sender {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-secondary);
    font-weight: 500;
  }
}

.sender-tag {
  display: inline-block;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.3px;
  border: 1px solid;

  &.tag-admin {
    background: rgba(212, 175, 55, 0.12);
    color: var(--text-gold);
    border-color: rgba(212, 175, 55, 0.3);
  }
  &.tag-user {
    background: rgba(100, 116, 139, 0.12);
    color: var(--text-secondary);
    border-color: var(--border-base);
  }
  &.tag-rainyun {
    background: rgba(106, 90, 205, 0.12);
    color: #6a5acd;
    border-color: rgba(106, 90, 205, 0.3);
  }
  &.tag-new {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border-color: rgba(16, 185, 129, 0.4);
    animation: tagPulse 1.5s ease-out;
  }
}

@keyframes tagPulse {
  0% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

// ============ 实时状态提示 ============
.realtime-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  font-size: 11px;
  color: var(--text-tertiary);

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-tertiary);

    &.active {
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
      animation: dotBlink 2s ease-in-out infinite;
    }
  }

  .status-text {
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.3px;
  }
}

@keyframes dotBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.chat-bubble {
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}

.reply-area {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-light);

  .reply-actions {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .reply-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    font-family: 'JetBrains Mono', monospace;
  }
}

.closed-tip {
  margin-top: 16px;
}

// ============ 侧边操作 ============
.side-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-block {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .action-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-tertiary);
  }
}

.action-divider {
  margin: 16px 0;
}

.btn-gold.full,
.btn-outline.full {
  width: 100%;
  margin-bottom: 10px;

  &:last-child { margin-bottom: 0; }
}

.btn-outline.danger {
  color: var(--danger);
  border-color: var(--danger);

  &:hover {
    background: var(--danger-bg);
  }
}

.timeline-action {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.timeline-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);

  .timeline-detail {
    color: var(--text-secondary);
  }
}

// ============ 状态文字 ============
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger  { color: var(--danger); }
  &.is-info    { color: var(--text-tertiary); }
}

.text-gold {
  color: var(--text-gold);
  font-weight: 500;
}

.text-tertiary {
  color: var(--text-tertiary);
}

// ===== 响应式 =====
@include tablet {
  :deep(.el-descriptions) .el-descriptions__body .el-descriptions__table {
    table-layout: fixed;
  }
}

@include mobile {
  .ticket-detail { padding-bottom: 16px; }

  :deep(.el-descriptions--border .el-descriptions__body) {
    .el-descriptions__table {
      table { width: 100%; }
      .el-descriptions__cell { display: block; width: 100%; }
    }
  }

  .chat-list { max-height: 400px; padding: 4px 0; }
  .chat-item { max-width: 85%; }
  .chat-bubble { padding: 8px 12px; font-size: 13px; }
}
</style>
