import http from './http';

// 管理后台 API - 统一入口
export const adminApi = {
  // 认证
  login: (data: { username: string; password: string }) =>
    http.post('/admin/auth/login', data),
  profile: () => http.get('/admin/auth/profile'),
  updateProfile: (data: { nickname?: string; email?: string; qq?: string; avatarUrl?: string }) =>
    http.put('/admin/auth/profile', data),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    http.post('/admin/auth/change-password', data),
  // QQ 昵称代理（后端代理，避免前端 CORS 问题）
  fetchQqNickname: (qq: string) =>
    http.get('/admin/auth/qq-nickname', { params: { qq } }),

  // 仪表盘
  dashboard: () => http.get('/admin/dashboard'),

  // 用户
  users: (params?: any) => http.get('/admin/users', { params }),
  userDetail: (id: number) => http.get(`/admin/users/${id}`),
  updateUserStatus: (id: number, status: string) => http.put(`/admin/users/${id}/status`, { status }),
  adjustBalance: (id: number, amount: number, remark: string) =>
    http.post(`/admin/users/${id}/balance`, { amount, remark }),
  resetUserPassword: (id: number, newPassword: string) =>
    http.post(`/admin/users/${id}/reset-password`, { newPassword }),
  rebuildPanelUser: (id: number) => http.post(`/admin/users/${id}/rebuild-panel-user`),

  // 商品
  products: (params?: any) => http.get('/admin/products', { params }),
  createProduct: (data: any) => http.post('/admin/products', data),
  updateProduct: (id: number, data: any) => http.put(`/admin/products/${id}`, data),
  deleteProduct: (id: number) => http.delete(`/admin/products/${id}`),
  // 删除所有商品：mode='soft'=全部下架 / mode='hard'=物理删除（需超级管理员）
  deleteAllProducts: (mode: 'soft' | 'hard' = 'soft') =>
    http.delete('/admin/products/all', { params: { mode } }),
  syncProducts: () => http.post('/admin/products/sync'),

  // 订单
  orders: (params?: any) => http.get('/admin/orders', { params }),
  orderDetail: (id: number) => http.get(`/admin/orders/${id}`),
  refundOrder: (id: number, reason: string) => http.post(`/admin/orders/${id}/refund`, { reason }),
  retryOpen: (id: number) => http.post(`/admin/orders/${id}/retry-open`),

  // 用户产品
  userProducts: (params?: any) => http.get('/admin/user-products', { params }),
  userProductDetail: (id: number) => http.get(`/admin/user-products/${id}`),
  syncUserProduct: (id: number) => http.post(`/admin/user-products/${id}/sync`),
  operateUserProduct: (id: number, action: string) =>
    http.post(`/admin/user-products/${id}/operate`, { action }),

  // 工单
  tickets: (params?: any) => http.get('/admin/tickets', { params }),
  ticketDetail: (id: number) => http.get(`/admin/tickets/${id}`),
  assignTicket: (id: number, adminId: number) => http.post(`/admin/tickets/${id}/assign`, { adminId }),
  replyTicket: (id: number, content: string) => http.post(`/admin/tickets/${id}/reply`, { content }),
  closeTicket: (id: number) => http.post(`/admin/tickets/${id}/close`),
  escalateTicket: (id: number) => http.post(`/admin/tickets/${id}/escalate`),

  // 财务
  financeOverview: () => http.get('/admin/finance/overview'),
  financeTransactions: (params?: any) => http.get('/admin/finance/transactions', { params }),
  financeExport: (params?: any) => http.get('/admin/finance/export', { params }),

  // 上游
  upstreamInfo: () => http.get('/admin/upstream/info'),
  upstreamPanelConfig: () => http.get('/admin/upstream/panel-config'),
  updatePanelConfig: (data: any) => http.put('/admin/upstream/panel-config', data),
  upstreamLogs: (params?: any) => http.get('/admin/upstream/logs', { params }),
  upstreamPanelUsers: () => http.get('/admin/upstream/panel-users'),
  // 雨云 API Key 配置（AES 加密存储 + 运行时热更新）
  rainyunApiKeyConfig: () => http.get('/admin/upstream/api-key'),
  updateRainyunApiKey: (data: {
    apiKey?: string;
    apiBase?: string;
    mockMode?: boolean;
  }) => http.put('/admin/upstream/api-key', data),
  testRainyunApiKey: () => http.post('/admin/upstream/api-key/test'),

  // SMTP
  smtpConfig: () => http.get('/admin/smtp/config'),
  updateSmtpConfig: (data: any) => http.put('/admin/smtp/config', data),
  testSmtp: (to: string) => http.post('/admin/smtp/test', { to }),
  smtpTemplates: () => http.get('/admin/smtp/templates'),
  createSmtpTemplate: (data: any) => http.post('/admin/smtp/templates', data),
  updateSmtpTemplate: (id: number, data: any) => http.put(`/admin/smtp/templates/${id}`, data),
  deleteSmtpTemplate: (id: number) => http.delete(`/admin/smtp/templates/${id}`),
  smtpLogs: (params?: any) => http.get('/admin/smtp/logs', { params }),

  // 短信服务（阿里云号码认证 PNVS）
  smsConfig: () => http.get('/admin/sms/config'),
  updateSmsConfig: (data: any) => http.put('/admin/sms/config', data),
  testSms: (phone: string) => http.post('/admin/sms/test', { phone }),
  smsLogs: (params?: any) => http.get('/admin/sms/logs', { params }),

  // 优惠券
  coupons: (params?: any) => http.get('/admin/coupons', { params }),
  createCoupon: (data: any) => http.post('/admin/coupons', data),
  updateCoupon: (id: number, data: any) => http.put(`/admin/coupons/${id}`, data),
  deleteCoupon: (id: number) => http.delete(`/admin/coupons/${id}`),

  // 公告
  announcements: (params?: any) => http.get('/admin/announcements', { params }),
  createAnnouncement: (data: any) => http.post('/admin/announcements', data),
  updateAnnouncement: (id: number, data: any) => http.put(`/admin/announcements/${id}`, data),
  deleteAnnouncement: (id: number) => http.delete(`/admin/announcements/${id}`),

  // 系统配置
  systemConfigs: () => http.get('/admin/system/configs'),
  updateSystemConfigs: (configs: Array<{ key: string; value: string }>) =>
    http.put('/admin/system/configs', { configs }),

  // 系统管理（v1.1.0+）：环境信息 / 版本检查 / 强制更新 / 更新状态
  envInfo: () => http.get('/admin/system/env-info'),
  versionCheck: () => http.get('/admin/system/version-check'),
  forceUpdate: () => http.post('/admin/system/force-update'),
  updateStatus: () => http.get('/admin/system/update-status'),

  // 管理员管理
  admins: () => http.get('/admin/admins'),
  createAdmin: (data: any) => http.post('/admin/admins', data),
  updateAdmin: (id: number, data: any) => http.put(`/admin/admins/${id}`, data),
  deleteAdmin: (id: number) => http.delete(`/admin/admins/${id}`),

  // 审计日志
  auditLogs: (params?: any) => http.get('/admin/audit-logs', { params }),
};
