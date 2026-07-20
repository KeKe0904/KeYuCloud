<template>
  <view class="app">
    <ui-app-bar title="工单详情" :show-back="true" />
    <scroll-view class="app-content no-nav" scroll-y :scroll-into-view="lastReplyId">
      <!-- ticket info -->
      <view class="card" v-if="ticket">
        <view class="row between wrap gap-8">
          <text class="ticket-title">{{ ticket.title }}</text>
          <ui-pill v-if="ticket.priority === 'URGENT'" variant="warn" text="紧急" />
        </view>
        <view class="row gap-8 mt-8 wrap">
          <text class="mono">{{ ticket.no }}</text>
          <ui-pill
            :variant="ticketStatus(ticket.status).variant"
            :icon="ticketStatus(ticket.status).icon"
            :text="ticketStatus(ticket.status).label"
          />
        </view>
        <view class="ticket-meta mt-8">
          <text>用户 {{ ticket.userName }}</text>
          <text>·</text>
          <text>类别 {{ ticket.category }}</text>
          <text>·</text>
          <text>创建 {{ ticket.createdAt }}</text>
        </view>
      </view>

      <!-- chat thread -->
      <view class="section-label">工单对话</view>
      <view class="chat-thread" v-if="ticket && ticket.replies">
        <view
          v-for="r in ticket.replies"
          :key="r.id"
          :id="'reply_' + r.id"
          class="bubble-wrap"
        >
          <view class="bubble" :class="r.role === 'admin' ? 'bubble-out' : 'bubble-in'">
            {{ r.content }}
          </view>
          <view class="bubble-meta" :class="r.role === 'admin' ? 'bubble-meta-out' : ''">
            {{ r.author }} · {{ r.time }}
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="reply-bar">
      <view class="star-btn" :class="{ 'is-active': isStarred }" @click="toggleStar">
        <ui-icon name="star" :size="40" />
      </view>
      <textarea
        v-model="replyContent"
        placeholder="输入回复内容..."
        :maxlength="500"
        :auto-height="true"
      />
      <view class="send-btn" @click="onSend">
        <ui-icon name="send-horizontal" :size="40" />
      </view>
    </view>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { TICKET_STATUS, pickStatus } from '../../common/format';

export default {
  data() {
    return {
      ticketId: null,
      ticket: null,
      replyContent: '',
      isStarred: false,
      lastReplyId: '',
    };
  },
  onLoad(query) {
    this.ticketId = +query.id;
  },
  onShow() {
    if (this.ticketId) this.loadData();
  },
  methods: {
    ticketStatus(s) { return pickStatus(TICKET_STATUS, s); },
    async loadData() {
      try {
        this.ticket = await adminApi.ticketDetail(this.ticketId);
        // 滚动到最后一条回复
        if (this.ticket && this.ticket.replies && this.ticket.replies.length) {
          this.$nextTick(() => {
            this.lastReplyId = 'reply_' + this.ticket.replies[this.ticket.replies.length - 1].id;
          });
        }
      } catch (e) { console.error(e); }
    },
    toggleStar() {
      this.isStarred = !this.isStarred;
      uni.showToast({ title: this.isStarred ? '已加星' : '已取消加星', icon: 'none' });
    },
    async onSend() {
      if (!this.replyContent.trim()) {
        uni.showToast({ title: '请输入回复内容', icon: 'none' });
        return;
      }
      try {
        const r = await adminApi.replyTicket(this.ticketId, this.replyContent);
        if (this.ticket) {
          this.ticket.replies.push({
            id: r.id || Date.now(),
            author: r.author || '我',
            role: 'admin',
            content: this.replyContent,
            time: r.time || '刚刚',
          });
          this.lastReplyId = 'reply_' + (r.id || Date.now());
        }
        this.replyContent = '';
        uni.showToast({ title: '回复成功', icon: 'success' });
      } catch (e) {}
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx 32rpx 220rpx; }
.ticket-title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--color-text);
}
.ticket-meta {
  font-size: 22rpx;
  color: var(--color-text-muted);
  display: flex;
  gap: 8rpx;
  flex-wrap: wrap;
}
.bubble-wrap {
  display: flex;
  flex-direction: column;
}
.bubble-meta-out { text-align: right; }
</style>
