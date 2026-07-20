/**
 * 管理后台 API - 与 web 端 adminApi 一一对应
 * 当 config.mockMode = true 时使用 mock 数据
 */
import http from './http';
import config from './config';
import mock from './mock';

function call(method, url, ...args) {
  if (config.mockMode) {
    return mock(method, url, ...args);
  }
  return http[method](url, ...args);
}

export const adminApi = {
  // ===== 认证 =====
  login: (data) => call('post', '/admin/auth/login', data),
  profile: () => call('get', '/admin/auth/profile'),
  updateProfile: (data) => call('put', '/admin/auth/profile', data),
  changePassword: (data) => call('post', '/admin/auth/change-password', data),

  // ===== 仪表盘 =====
  dashboard: () => call('get', '/admin/dashboard'),

  // ===== 用户 =====
  users: (params) => call('get', '/admin/users', params),
  userDetail: (id) => call('get', `/admin/users/${id}`),
  updateUserStatus: (id, status) => call('put', `/admin/users/${id}/status`, { status }),
  adjustBalance: (id, amount, remark) => call('post', `/admin/users/${id}/balance`, { amount, remark }),
  resetUserPassword: (id, newPassword) => call('post', `/admin/users/${id}/reset-password`, { newPassword }),

  // ===== 商品 =====
  products: (params) => call('get', '/admin/products', params),
  createProduct: (data) => call('post', '/admin/products', data),
  updateProduct: (id, data) => call('put', `/admin/products/${id}`, data),
  deleteProduct: (id) => call('delete', `/admin/products/${id}`),
  syncProducts: () => call('post', '/admin/products/sync'),

  // ===== 订单 =====
  orders: (params) => call('get', '/admin/orders', params),
  orderDetail: (id) => call('get', `/admin/orders/${id}`),
  refundOrder: (id, reason) => call('post', `/admin/orders/${id}/refund`, { reason }),
  retryOpen: (id) => call('post', `/admin/orders/${id}/retry-open`),

  // ===== 用户产品 =====
  userProducts: (params) => call('get', '/admin/user-products', params),
  userProductDetail: (id) => call('get', `/admin/user-products/${id}`),
  syncUserProduct: (id) => call('post', `/admin/user-products/${id}/sync`),
  operateUserProduct: (id, action) => call('post', `/admin/user-products/${id}/operate`, { action }),

  // ===== 工单 =====
  tickets: (params) => call('get', '/admin/tickets', params),
  ticketDetail: (id) => call('get', `/admin/tickets/${id}`),
  assignTicket: (id, adminId) => call('post', `/admin/tickets/${id}/assign`, { adminId }),
  replyTicket: (id, content) => call('post', `/admin/tickets/${id}/reply`, { content }),
  closeTicket: (id) => call('post', `/admin/tickets/${id}/close`),
  escalateTicket: (id) => call('post', `/admin/tickets/${id}/escalate`),

  // ===== 财务 =====
  financeOverview: () => call('get', '/admin/finance/overview'),
  financeTransactions: (params) => call('get', '/admin/finance/transactions', params),

  // ===== 上游 =====
  upstreamInfo: () => call('get', '/admin/upstream/info'),
  upstreamPanelConfig: () => call('get', '/admin/upstream/panel-config'),
  updatePanelConfig: (data) => call('put', '/admin/upstream/panel-config', data),
  rainyunApiKeyConfig: () => call('get', '/admin/upstream/api-key'),
  updateRainyunApiKey: (data) => call('put', '/admin/upstream/api-key', data),
  testRainyunApiKey: () => call('post', '/admin/upstream/api-key/test'),

  // ===== SMTP =====
  smtpConfig: () => call('get', '/admin/smtp/config'),
  updateSmtpConfig: (data) => call('put', '/admin/smtp/config', data),
  testSmtp: (to) => call('post', '/admin/smtp/test', { to }),
  smtpTemplates: () => call('get', '/admin/smtp/templates'),
  createSmtpTemplate: (data) => call('post', '/admin/smtp/templates', data),
  updateSmtpTemplate: (id, data) => call('put', `/admin/smtp/templates/${id}`, data),
  deleteSmtpTemplate: (id) => call('delete', `/admin/smtp/templates/${id}`),
  smtpLogs: (params) => call('get', '/admin/smtp/logs', params),

  // ===== 短信 =====
  smsConfig: () => call('get', '/admin/sms/config'),
  updateSmsConfig: (data) => call('put', '/admin/sms/config', data),
  testSms: (phone) => call('post', '/admin/sms/test', { phone }),
  smsLogs: (params) => call('get', '/admin/sms/logs', params),

  // ===== 优惠券 =====
  coupons: (params) => call('get', '/admin/coupons', params),
  createCoupon: (data) => call('post', '/admin/coupons', data),
  updateCoupon: (id, data) => call('put', `/admin/coupons/${id}`, data),
  deleteCoupon: (id) => call('delete', `/admin/coupons/${id}`),

  // ===== 公告 =====
  announcements: (params) => call('get', '/admin/announcements', params),
  createAnnouncement: (data) => call('post', '/admin/announcements', data),
  updateAnnouncement: (id, data) => call('put', `/admin/announcements/${id}`, data),
  deleteAnnouncement: (id) => call('delete', `/admin/announcements/${id}`),

  // ===== 系统配置 =====
  systemConfigs: () => call('get', '/admin/system/configs'),
  updateSystemConfigs: (configs) => call('put', '/admin/system/configs', { configs }),
  envInfo: () => call('get', '/admin/system/env-info'),
  versionCheck: () => call('get', '/admin/system/version-check'),

  // ===== 管理员 =====
  admins: () => call('get', '/admin/admins'),
  createAdmin: (data) => call('post', '/admin/admins', data),
  updateAdmin: (id, data) => call('put', `/admin/admins/${id}`, data),
  deleteAdmin: (id) => call('delete', `/admin/admins/${id}`),

  // ===== 审计日志 =====
  auditLogs: (params) => call('get', '/admin/audit-logs', params),
};

export default adminApi;
