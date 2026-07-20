/**
 * 通用格式化工具
 */
export function formatMoney(n) {
  if (n === undefined || n === null || n === '') return '¥0.00';
  const num = Number(n) || 0;
  return '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNum(n) {
  if (n === undefined || n === null || n === '') return '0';
  return Number(n).toLocaleString('zh-CN');
}

export function formatDate(d, withTime = false) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  let str = `${y}-${m}-${day}`;
  if (withTime) {
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    str += ` ${h}:${mi}`;
  }
  return str;
}

export function maskPhone(phone) {
  if (!phone) return '';
  if (phone.length === 11) {
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }
  return phone;
}

export const USER_STATUS = {
  ACTIVE: { label: '正常', variant: 'success', icon: 'check' },
  BANNED: { label: '封禁', variant: 'danger', icon: 'circle-minus' },
  PENDING: { label: '待审核', variant: 'warn', icon: 'circle-alert' },
};

export const ORDER_STATUS = {
  PENDING: { label: '待支付', variant: 'brand' },
  PAID: { label: '已支付', variant: 'muted' },
  OPENED: { label: '已开通', variant: 'success', icon: 'check' },
  REFUNDED: { label: '已退款', variant: 'danger', icon: 'circle-minus' },
  CLOSED: { label: '已关闭', variant: 'muted' },
};

export const TICKET_STATUS = {
  PENDING: { label: '待处理', variant: 'muted' },
  PROCESSING: { label: '处理中', variant: 'brand' },
  RESOLVED: { label: '已解决', variant: 'success', icon: 'check' },
  CLOSED: { label: '已关闭', variant: 'muted' },
};

export const TICKET_PRIORITY = {
  URGENT: { label: '紧急', variant: 'warn' },
  HIGH: { label: '高', variant: 'brand' },
  NORMAL: { label: '中', variant: 'muted' },
  LOW: { label: '低', variant: 'muted' },
};

export const PRODUCT_STATUS = {
  ON_SALE: { label: '上架', variant: 'success', icon: 'check' },
  OFF_SHELF: { label: '下架', variant: 'muted', icon: 'circle-pause' },
};

export const ADMIN_ROLE = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  OPERATOR: '运营',
  FINANCE: '财务',
  SUPPORT: '客服',
  TECH: '技术',
};

export const ADMIN_ROLE_VARIANT = {
  SUPER_ADMIN: 'brand',
  ADMIN: 'success',
  OPERATOR: 'warn',
  FINANCE: 'muted',
  SUPPORT: 'muted',
  TECH: 'muted',
};

export const COUPON_STATUS = {
  ACTIVE: { label: '生效中', variant: 'success', icon: 'check' },
  EXPIRED: { label: '已过期', variant: 'muted' },
  DISABLED: { label: '已停用', variant: 'muted' },
};

export const ANNOUNCEMENT_STATUS = {
  PUBLISHED: { label: '已发布', variant: 'success', icon: 'check' },
  DRAFT: { label: '草稿', variant: 'muted' },
};

export const USER_PRODUCT_STATUS = {
  RUNNING: { label: '运行中', variant: 'success', icon: 'check' },
  STOPPED: { label: '已关机', variant: 'muted', icon: 'circle-pause' },
  EXPIRED: { label: '已过期', variant: 'danger', icon: 'circle-minus' },
};

export const SMTP_LOG_STATUS = {
  SUCCESS: { label: '成功', variant: 'success', icon: 'check' },
  FAILED: { label: '失败', variant: 'danger', icon: 'circle-minus' },
};

export const TEMPLATE_STATUS = {
  ACTIVE: { label: '启用', variant: 'success', icon: 'check' },
  INACTIVE: { label: '停用', variant: 'muted' },
};

export const ADMIN_STATUS = {
  ACTIVE: { label: '启用', variant: 'success', icon: 'check' },
  DISABLED: { label: '禁用', variant: 'danger', icon: 'circle-minus' },
};

export const FINANCE_TX_TYPE = {
  INCOME: { label: '收入', variant: 'success', icon: 'arrow-up' },
  REFUND: { label: '退款', variant: 'danger', icon: 'arrow-down' },
  ADJUST: { label: '调整', variant: 'muted', icon: 'arrow-right' },
  EXPENSE: { label: '支出', variant: 'danger', icon: 'arrow-down' },
};

export function pickStatus(map, key) {
  return map[key] || { label: key || '-', variant: 'muted' };
}
