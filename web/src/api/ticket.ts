import { request } from './http';

export const ticketApi = {
  list(params?: { status?: string; type?: string; userProductId?: number; page?: number; pageSize?: number }) {
    return request.get('/tickets', params);
  },
  detail(id: number) {
    return request.get(`/tickets/${id}`);
  },
  create(data: {
    type: string;
    title: string;
    content: string;
    userProductId?: number;
    source?: 'local' | 'official';
  }) {
    return request.post('/tickets', data);
  },
  reply(id: number, content: string) {
    return request.post(`/tickets/${id}/reply`, { content });
  },
  close(id: number) {
    return request.post(`/tickets/${id}/close`);
  },
  rate(id: number, rating: number, comment?: string) {
    return request.post(`/tickets/${id}/rate`, { rating, comment });
  },
  // 用户升级工单到雨云官方（本站 → 官方，单向不可降级）
  escalate(id: number) {
    return request.post(`/tickets/${id}/escalate`);
  },
};

export const notificationApi = {
  list(params?: { type?: string; page?: number; pageSize?: number }) {
    return request.get('/notifications', params);
  },
  unreadCount() {
    return request.get('/notifications/unread-count');
  },
  markRead(id: number) {
    return request.put(`/notifications/${id}/read`);
  },
  markAllRead() {
    return request.put('/notifications/read-all');
  },
};
