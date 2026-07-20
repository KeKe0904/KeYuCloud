import { defineStore } from 'pinia';
import { notificationApi } from '@/api/ticket';

interface NotificationState {
  unreadCount: number;
  loaded: boolean;
}

export const useNotificationStore = defineStore('notification', {
  state: (): NotificationState => ({
    unreadCount: 0,
    loaded: false,
  }),
  actions: {
    async fetchUnreadCount(force = false) {
      if (!localStorage.getItem('token')) return;
      // 首次加载强制拉取；后续也允许强制刷新（标记已读后调用）
      try {
        const res = await notificationApi.unreadCount();
        this.unreadCount = Number(res.data?.count || 0);
        this.loaded = true;
      } catch {
        // 静默失败，不影响主流程
      }
    },
    // 本地递减（标记单条已读后立即生效，无需等网络往返）
    decrement() {
      if (this.unreadCount > 0) this.unreadCount--;
    },
    reset() {
      this.unreadCount = 0;
    },
  },
});
