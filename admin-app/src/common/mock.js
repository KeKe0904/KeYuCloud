/**
 * Mock 数据层 - 设计稿预览用
 * 所有 API 调用返回与后端 schema 一致的数据
 */

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PROFILE = {
  id: 1,
  username: 'admin',
  nickname: '柯羽',
  role: 'SUPER_ADMIN',
  email: 'admin@keyu.cloud',
  qq: '10001',
  avatarUrl: null,
  lastLoginAt: '2025-07-20 10:23:18',
  lastLoginIp: '223.104.10.21',
};

const USERS = [
  { id: 1, name: '张明', phone: '138****6621', email: 'zhangming@example.com', balance: 1280.0, status: 'ACTIVE', createdAt: '2025-03-12 14:32', lastLoginAt: '2025-07-20 09:12', totalSpend: 4521.5, orderCount: 12, productCount: 4, ticketCount: 2 },
  { id: 2, name: '李伟', phone: '159****0082', email: 'liwei@example.com', balance: 0.0, status: 'BANNED', createdAt: '2025-04-01 09:18', lastLoginAt: '2025-07-01 22:04', totalSpend: 88.0, orderCount: 1, productCount: 0, ticketCount: 5 },
  { id: 3, name: '王芳', phone: '136****4407', email: 'wangfang@example.com', balance: 3560.5, status: 'ACTIVE', createdAt: '2025-02-18 16:55', lastLoginAt: '2025-07-19 14:33', totalSpend: 12088.0, orderCount: 23, productCount: 6, ticketCount: 0 },
  { id: 4, name: '陈杰', phone: '187****2293', email: 'chenjie@example.com', balance: 0.0, status: 'BANNED', createdAt: '2025-05-20 11:02', lastLoginAt: '2025-06-10 08:12', totalSpend: 0, orderCount: 0, productCount: 0, ticketCount: 1 },
  { id: 5, name: '刘洋', phone: '152****8810', email: 'liuyang@example.com', balance: 8920.0, status: 'ACTIVE', createdAt: '2025-01-09 19:33', lastLoginAt: '2025-07-20 11:45', totalSpend: 24108.5, orderCount: 36, productCount: 8, ticketCount: 3 },
  { id: 6, name: '赵敏', phone: '133****6655', email: 'zhaomin@example.com', balance: 240.0, status: 'ACTIVE', createdAt: '2025-06-15 13:21', lastLoginAt: '2025-07-18 17:55', totalSpend: 240.0, orderCount: 2, productCount: 1, ticketCount: 0 },
];

const PRODUCTS = [
  { id: 1, name: '云服务器 2核4G', spec: '2核4G', upstream: 'RainYun', price: 69.0, period: '月', status: 'ON_SALE', stock: 999 },
  { id: 2, name: '轻量云 1核2G', spec: '1核2G', upstream: 'RainYun', price: 29.0, period: '月', status: 'ON_SALE', stock: 999 },
  { id: 3, name: '独服 E5-2680v4', spec: '16核32G', upstream: 'RainYun', price: 899.0, period: '月', status: 'ON_SALE', stock: 5 },
  { id: 4, name: '云服务器 4核8G', spec: '4核8G', upstream: 'RainYun', price: 159.0, period: '月', status: 'OFF_SHELF', stock: 999 },
  { id: 5, name: '轻量云 2核4G', spec: '2核4G', upstream: 'RainYun', price: 59.0, period: '月', status: 'ON_SALE', stock: 999 },
  { id: 6, name: 'CDN流量包 100GB', spec: '100GB', upstream: '阿里云', price: 10.0, period: '月', status: 'ON_SALE', stock: 9999 },
];

const ORDERS = [
  { id: 1, orderNo: 'ORD20250720001', userId: 1, userName: '张明', productId: 1, productName: '云服务器2核4G', spec: '2核4G', period: '1个月', amount: 128.0, payMethod: '支付宝', status: 'PENDING', createdAt: '2025-07-20 10:23', paidAt: null },
  { id: 2, orderNo: 'ORD20250719008', userId: 2, userName: '李伟', productId: 4, productName: '云服务器4核8G', spec: '4核8G', period: '3个月', amount: 588.0, payMethod: '微信支付', status: 'OPENED', createdAt: '2025-07-19 14:55', paidAt: '2025-07-19 14:57' },
  { id: 3, orderNo: 'ORD20250719002', userId: 3, userName: '王芳', productId: 5, productName: '轻量应用服务器', spec: '2核4G', period: '6个月', amount: 328.0, payMethod: '支付宝', status: 'PAID', createdAt: '2025-07-19 09:31', paidAt: '2025-07-19 09:32' },
  { id: 4, orderNo: 'ORD20250718015', userId: 5, userName: '赵磊', productId: 6, productName: '域名注册 .com', spec: '.com', period: '1年', amount: 68.0, payMethod: '微信支付', status: 'OPENED', createdAt: '2025-07-18 16:42', paidAt: '2025-07-18 16:43' },
  { id: 5, orderNo: 'ORD20250717009', userId: 4, userName: '陈静', productId: 6, productName: '对象存储100GB', spec: '100GB', period: '1年', amount: 98.0, payMethod: '支付宝', status: 'REFUNDED', createdAt: '2025-07-17 11:18', paidAt: '2025-07-17 11:20' },
  { id: 6, orderNo: 'ORD20250717001', userId: 6, userName: '周强', productId: 1, productName: 'MySQL数据库', spec: '2核4G', period: '2个月', amount: 168.0, payMethod: '余额支付', status: 'PENDING', createdAt: '2025-07-17 09:05', paidAt: null },
];

const TICKETS = [
  { id: 1, no: 'TK20250720001', userId: 1, userName: '张明', title: '云服务器无法连接', priority: 'URGENT', status: 'PROCESSING', category: '故障', lastReply: '2025-07-20 11:15', createdAt: '2025-07-20 10:30', assigneeId: 1, assigneeName: '柯羽',
    content: '我的云服务器从今早开始就无法连接 SSH，请帮忙查看。',
    replies: [
      { id: 1, author: '张明', role: 'user', content: '我的云服务器从今早开始就无法连接 SSH，请帮忙查看。', time: '2025-07-20 10:30' },
      { id: 2, author: '柯羽', role: 'admin', content: '您好，已确认主机状态正常，可能是安全组规则问题，请检查 22 端口是否放行。', time: '2025-07-20 11:00' },
      { id: 3, author: '张明', role: 'user', content: '已经放行了，但还是连不上。', time: '2025-07-20 11:15' },
    ] },
  { id: 2, no: 'TK20250719005', userId: 3, userName: '王芳', title: '订单退款咨询', priority: 'NORMAL', status: 'PENDING', category: '订单', lastReply: '2025-07-19 17:30', createdAt: '2025-07-19 16:20', assigneeId: null, assigneeName: null,
    content: '我想咨询订单 ORD20250719002 的退款流程。',
    replies: [{ id: 1, author: '王芳', role: 'user', content: '我想咨询订单 ORD20250719002 的退款流程。', time: '2025-07-19 16:20' }] },
  { id: 3, no: 'TK20250718012', userId: 5, userName: '刘洋', title: '续费优惠券问题', priority: 'NORMAL', status: 'PROCESSING', category: '财务', lastReply: '2025-07-19 09:42', createdAt: '2025-07-18 14:00', assigneeId: 1, assigneeName: '柯羽',
    content: '续费时优惠券无法使用，请协助处理。',
    replies: [
      { id: 1, author: '刘洋', role: 'user', content: '续费时优惠券无法使用，请协助处理。', time: '2025-07-18 14:00' },
      { id: 2, author: '柯羽', role: 'admin', content: '已为您手动应用优惠券，请刷新页面查看。', time: '2025-07-18 14:30' },
    ] },
  { id: 4, no: 'TK20250717007', userId: 6, userName: '赵敏', title: '产品功能建议', priority: 'LOW', status: 'RESOLVED', category: '建议', lastReply: '2025-07-17 18:00', createdAt: '2025-07-17 15:00', assigneeId: 1, assigneeName: '柯羽',
    content: '建议增加自动续费功能。',
    replies: [
      { id: 1, author: '赵敏', role: 'user', content: '建议增加自动续费功能。', time: '2025-07-17 15:00' },
      { id: 2, author: '柯羽', role: 'admin', content: '感谢您的建议，我们将在 v2.5 版本中加入自动续费功能。', time: '2025-07-17 18:00' },
    ] },
  { id: 5, no: 'TK20250716003', userId: 2, userName: '李伟', title: '账号解封申请', priority: 'NORMAL', status: 'CLOSED', category: '账号', lastReply: '2025-07-17 10:00', createdAt: '2025-07-16 09:00', assigneeId: 1, assigneeName: '柯羽',
    content: '我的账号被误封禁，请协助解封。',
    replies: [
      { id: 1, author: '李伟', role: 'user', content: '我的账号被误封禁，请协助解封。', time: '2025-07-16 09:00' },
      { id: 2, author: '柯羽', role: 'admin', content: '经核查您的账号存在违规行为，解封申请已被驳回。', time: '2025-07-17 10:00' },
    ] },
  { id: 6, no: 'TK20250715001', userId: 4, userName: '陈杰', title: '备案信息修改', priority: 'URGENT', status: 'PROCESSING', category: '备案', lastReply: '2025-07-15 16:00', createdAt: '2025-07-15 14:00', assigneeId: 1, assigneeName: '柯羽',
    content: '需要更新备案信息中的网站负责人。',
    replies: [
      { id: 1, author: '陈杰', role: 'user', content: '需要更新备案信息中的网站负责人。', time: '2025-07-15 14:00' },
      { id: 2, author: '柯羽', role: 'admin', content: '请提供新的负责人信息，我们将在 1 个工作日内处理。', time: '2025-07-15 16:00' },
    ] },
];

const USER_PRODUCTS = [
  { id: 1, userId: 1, userName: '张明', name: 'web-prod-01', type: '云服务器', spec: '2核4G', ip: '43.135.12.8', expireAt: '2025-09-12', status: 'RUNNING' },
  { id: 2, userId: 3, userName: '王芳', name: 'db-master', type: '云数据库', spec: '4核8G', ip: '43.135.12.21', expireAt: '2025-11-01', status: 'RUNNING' },
  { id: 3, userId: 5, userName: '刘洋', name: 'cdn-edge-01', type: 'CDN', spec: '100GB', ip: '-', expireAt: '2025-08-20', status: 'RUNNING' },
  { id: 4, userId: 6, userName: '赵敏', name: 'test-dev', type: '轻量云', spec: '1核2G', ip: '43.135.13.7', expireAt: '2025-07-25', status: 'STOPPED' },
  { id: 5, userId: 1, userName: '张明', name: 'cache-redis', type: '云Redis', spec: '2GB', ip: '43.135.12.9', expireAt: '2025-10-12', status: 'RUNNING' },
];

const COUPONS = [
  { id: 1, name: '新人立减', code: 'NEWUSER10', type: 'AMOUNT', value: 10, minSpend: 50, validFrom: '2025-07-01', validTo: '2025-12-31', status: 'ACTIVE', used: 234, total: 1000 },
  { id: 2, name: '满百减十', code: 'SAVE10', type: 'AMOUNT', value: 10, minSpend: 100, validFrom: '2025-06-01', validTo: '2025-09-30', status: 'ACTIVE', used: 128, total: 500 },
  { id: 3, name: '老用户九折', code: 'VIP90', type: 'PERCENT', value: 10, minSpend: 0, validFrom: '2025-07-01', validTo: '2025-07-31', status: 'ACTIVE', used: 56, total: 200 },
  { id: 4, name: '春节特惠', code: 'CNY2025', type: 'AMOUNT', value: 50, minSpend: 500, validFrom: '2025-02-01', validTo: '2025-02-15', status: 'EXPIRED', used: 412, total: 500 },
  { id: 5, name: '夏季促销', code: 'SUMMER20', type: 'PERCENT', value: 20, minSpend: 200, validFrom: '2025-07-01', validTo: '2025-08-31', status: 'ACTIVE', used: 78, total: 300 },
];

const ANNOUNCEMENTS = [
  { id: 1, title: '系统维护通知', summary: '系统将于 2025-07-25 02:00-04:00 进行例行维护，期间部分功能可能不可用。', content: '尊敬的用户，系统将于 2025-07-25 02:00-04:00 进行例行维护，期间部分功能可能不可用，请提前做好准备。', status: 'PUBLISHED', publishedAt: '2025-07-20 10:00', readCount: 1242 },
  { id: 2, title: 'v2.4.1 版本更新', summary: '新增自动续费功能、优化工单回复体验、修复若干已知问题。', content: '本次更新内容：\n1. 新增自动续费功能\n2. 优化工单回复体验\n3. 修复若干已知问题', status: 'PUBLISHED', publishedAt: '2025-07-18 15:00', readCount: 2156 },
  { id: 3, title: '夏季促销活动开始', summary: '7 月 1 日至 8 月 31 日，全场云服务器 8 折起，更有满减优惠券等你领。', content: '夏季促销活动正式开启，全场云服务器 8 折起。', status: 'PUBLISHED', publishedAt: '2025-07-01 00:00', readCount: 3589 },
  { id: 4, title: 'CDN 流量包升级公告', summary: 'CDN 流量包即将升级，新版本将提供更稳定的加速体验。', content: 'CDN 流量包升级草稿。', status: 'DRAFT', publishedAt: null, readCount: 0 },
  { id: 5, title: '新春红包活动', summary: '新春红包活动回顾，感谢各位用户的支持。', content: '感谢各位用户的支持。', status: 'PUBLISHED', publishedAt: '2025-02-20 10:00', readCount: 5210 },
];

const ADMINS = [
  { id: 1, username: 'admin', nickname: '柯羽', role: 'SUPER_ADMIN', status: 'ACTIVE', lastLoginAt: '2025-07-20 10:23', lastLoginIp: '223.104.10.21' },
  { id: 2, username: 'operator1', nickname: '运营小王', role: 'OPERATOR', status: 'ACTIVE', lastLoginAt: '2025-07-19 16:32', lastLoginIp: '116.231.20.18' },
  { id: 3, username: 'finance01', nickname: '财务小李', role: 'FINANCE', status: 'ACTIVE', lastLoginAt: '2025-07-19 09:11', lastLoginIp: '114.88.142.10' },
  { id: 4, username: 'support02', nickname: '客服小张', role: 'SUPPORT', status: 'ACTIVE', lastLoginAt: '2025-07-18 22:08', lastLoginIp: '120.229.18.32' },
  { id: 5, username: 'tech_lead', nickname: '技术负责人', role: 'TECH', status: 'ACTIVE', lastLoginAt: '2025-07-17 14:50', lastLoginIp: '58.34.122.7' },
  { id: 6, username: 'admin_jane', nickname: 'Jane', role: 'ADMIN', status: 'DISABLED', lastLoginAt: '2025-06-10 08:12', lastLoginIp: '180.158.21.45' },
];

const AUDIT_LOGS = [
  { id: 1, action: '管理员登录', adminId: 1, adminName: '柯羽', targetType: 'auth', targetId: null, ip: '223.104.10.21', userAgent: 'Mozilla/5.0 (Linux; Android 14)', createdAt: '2025-07-20 10:23:18' },
  { id: 2, action: '订单退款', adminId: 1, adminName: '柯羽', targetType: 'order', targetId: 5, ip: '223.104.10.21', userAgent: 'Mozilla/5.0 (Linux; Android 14)', createdAt: '2025-07-17 11:25:30' },
  { id: 3, action: '用户封禁', adminId: 1, adminName: '柯羽', targetType: 'user', targetId: 4, ip: '223.104.10.21', userAgent: 'Mozilla/5.0 (Linux; Android 14)', createdAt: '2025-07-16 09:05:12' },
  { id: 4, action: '系统配置更新', adminId: 1, adminName: '柯羽', targetType: 'config', targetId: null, ip: '223.104.10.21', userAgent: 'Mozilla/5.0 (Linux; Android 14)', createdAt: '2025-07-15 18:33:45' },
  { id: 5, action: '管理员登录', adminId: 2, adminName: '运营小王', targetType: 'auth', targetId: null, ip: '116.231.20.18', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)', createdAt: '2025-07-19 16:32:11' },
  { id: 6, action: '工单回复', adminId: 2, adminName: '运营小王', targetType: 'ticket', targetId: 3, ip: '116.231.20.18', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)', createdAt: '2025-07-19 17:01:23' },
];

const SMTP_TEMPLATES = [
  { id: 1, name: '欢迎注册', code: 'welcome', description: '用户注册成功后发送的欢迎邮件', status: 'ACTIVE', updatedAt: '2025-07-15 10:00' },
  { id: 2, name: '订单支付成功', code: 'order_paid', description: '订单支付成功后的通知邮件', status: 'ACTIVE', updatedAt: '2025-07-12 14:30' },
  { id: 3, name: '工单回复通知', code: 'ticket_reply', description: '工单有新回复时通知用户', status: 'ACTIVE', updatedAt: '2025-07-10 09:15' },
  { id: 4, name: '产品到期提醒', code: 'product_expiring', description: '产品即将到期时的提醒邮件', status: 'ACTIVE', updatedAt: '2025-07-08 11:45' },
  { id: 5, name: '密码重置', code: 'reset_password', description: '密码重置链接邮件', status: 'INACTIVE', updatedAt: '2025-06-25 16:20' },
];

const SMTP_LOGS = [
  { id: 1, to: 'zhangming@example.com', templateName: '欢迎注册', templateCode: 'welcome', status: 'SUCCESS', sentAt: '2025-07-20 10:30:15' },
  { id: 2, to: 'liwei@example.com', templateName: '订单支付成功', templateCode: 'order_paid', status: 'SUCCESS', sentAt: '2025-07-19 14:57:32' },
  { id: 3, to: 'wangfang@example.com', templateName: '订单支付成功', templateCode: 'order_paid', status: 'SUCCESS', sentAt: '2025-07-19 09:32:18' },
  { id: 4, to: 'invalid@example.com', templateName: '工单回复通知', templateCode: 'ticket_reply', status: 'FAILED', sentAt: '2025-07-18 14:35:00', error: 'SMTP connection timeout' },
  { id: 5, to: 'liuyang@example.com', templateName: '产品到期提醒', templateCode: 'product_expiring', status: 'SUCCESS', sentAt: '2025-07-18 08:00:00' },
  { id: 6, to: 'zhaomin@example.com', templateName: '工单回复通知', templateCode: 'ticket_reply', status: 'SUCCESS', sentAt: '2025-07-17 18:00:42' },
];

const FINANCE_TRANSACTIONS = [
  { id: 1, type: 'INCOME', amount: 588.0, description: '订单 ORD20250719008 支付', userName: '李伟', createdAt: '2025-07-19 14:57' },
  { id: 2, type: 'INCOME', amount: 328.0, description: '订单 ORD20250719002 支付', userName: '王芳', createdAt: '2025-07-19 09:32' },
  { id: 3, type: 'REFUND', amount: 98.0, description: '订单 ORD20250717009 退款', userName: '陈静', createdAt: '2025-07-17 11:25' },
  { id: 4, type: 'INCOME', amount: 68.0, description: '订单 ORD20250718015 支付', userName: '赵磊', createdAt: '2025-07-18 16:43' },
  { id: 5, type: 'ADJUST', amount: 100.0, description: '管理员手动调整', userName: '刘洋', createdAt: '2025-07-17 15:00' },
];

export default async function mock(method, url, ...args) {
  await delay();

  // ===== 认证 =====
  if (url === '/admin/auth/login' && method === 'post') {
    const { username, password } = args[0] || {};
    if (username && password) {
      return { token: 'mock-admin-token-' + Date.now(), profile: ADMIN_PROFILE };
    }
    throw new Error('用户名或密码错误');
  }
  if (url === '/admin/auth/profile' && method === 'get') return ADMIN_PROFILE;

  // ===== 仪表盘 =====
  if (url === '/admin/dashboard' && method === 'get') {
    return {
      metrics: {
        sales: { value: 12856.5, delta: '+12.5%', deltaType: 'up' },
        users: { value: 1842, delta: '+8.2%', deltaType: 'up' },
        orders: { value: 326, delta: '-3.1%', deltaType: 'down' },
      },
      charts: {
        salesTrend: [
          { date: '07-14', value: 1820 },
          { date: '07-15', value: 2150 },
          { date: '07-16', value: 1680 },
          { date: '07-17', value: 2410 },
          { date: '07-18', value: 1980 },
          { date: '07-19', value: 2780 },
          { date: '07-20', value: 1286 },
        ],
        userTrend: [
          { date: '07-14', value: 12 },
          { date: '07-15', value: 18 },
          { date: '07-16', value: 9 },
          { date: '07-17', value: 22 },
          { date: '07-18', value: 15 },
          { date: '07-19', value: 28 },
          { date: '07-20', value: 16 },
        ],
        orderDist: [
          { name: '云服务器', value: 145 },
          { name: '轻量云', value: 88 },
          { name: '独服', value: 12 },
          { name: 'CDN', value: 56 },
          { name: '其他', value: 25 },
        ],
      },
    };
  }

  // ===== 用户 =====
  if (url === '/admin/users' && method === 'get') return { list: USERS, total: USERS.length };
  if (url.startsWith('/admin/users/') && url.endsWith('/status') && method === 'put') return { ok: true };
  if (url.startsWith('/admin/users/') && url.endsWith('/balance') && method === 'post') return { ok: true };
  const userMatch = url.match(/^\/admin\/users\/(\d+)$/);
  if (userMatch && method === 'get') {
    const u = USERS.find((x) => x.id === +userMatch[1]);
    if (!u) throw new Error('用户不存在');
    return {
      ...u,
      recentOrders: ORDERS.filter((o) => o.userId === u.id).slice(0, 3),
    };
  }

  // ===== 商品 =====
  if (url === '/admin/products' && method === 'get') return { list: PRODUCTS, total: PRODUCTS.length };
  if (url === '/admin/products' && method === 'post') return { id: Date.now(), ...args[0] };
  if (url === '/admin/products/sync' && method === 'post') return { synced: 6 };

  // ===== 订单 =====
  if (url === '/admin/orders' && method === 'get') return { list: ORDERS, total: ORDERS.length };
  const orderMatch = url.match(/^\/admin\/orders\/(\d+)$/);
  if (orderMatch && method === 'get') {
    const o = ORDERS.find((x) => x.id === +orderMatch[1]);
    if (!o) throw new Error('订单不存在');
    return {
      ...o,
      timeline: [
        { title: '订单创建', time: o.createdAt, status: 'done' },
        { title: '用户支付', time: o.paidAt || '-', status: o.paidAt ? 'done' : 'current' },
        { title: '系统开通', time: o.status === 'OPENED' ? o.paidAt : '-', status: o.status === 'OPENED' ? 'done' : 'pending' },
        { title: '服务运行', time: o.status === 'OPENED' ? '至今' : '-', status: o.status === 'OPENED' ? 'done' : 'pending' },
        { title: '服务到期', time: '-', status: 'pending' },
      ],
    };
  }

  // ===== 用户产品 =====
  if (url === '/admin/user-products' && method === 'get') return { list: USER_PRODUCTS, total: USER_PRODUCTS.length };

  // ===== 工单 =====
  if (url === '/admin/tickets' && method === 'get') return { list: TICKETS, total: TICKETS.length };
  const ticketMatch = url.match(/^\/admin\/tickets\/(\d+)$/);
  if (ticketMatch && method === 'get') {
    const t = TICKETS.find((x) => x.id === +ticketMatch[1]);
    if (!t) throw new Error('工单不存在');
    return t;
  }
  if (ticketMatch && url.endsWith('/reply') && method === 'post') {
    return { id: Date.now(), author: '柯羽', role: 'admin', content: args[1].content, time: '2025-07-20 12:00' };
  }

  // ===== 财务 =====
  if (url === '/admin/finance/overview' && method === 'get') {
    return {
      period: { income: 52886.5, expense: 98.0, net: 52788.5 },
      transactions: FINANCE_TRANSACTIONS,
      charts: {
        trend: [
          { date: '07-14', income: 3200, expense: 0 },
          { date: '07-15', income: 2150, expense: 0 },
          { date: '07-16', income: 1680, expense: 0 },
          { date: '07-17', income: 2410, expense: 98 },
          { date: '07-18', income: 1980, expense: 0 },
          { date: '07-19', income: 916, expense: 0 },
          { date: '07-20', income: 0, expense: 0 },
        ],
        incomeDist: [
          { name: '云服务器', value: 38560 },
          { name: '轻量云', value: 8420 },
          { name: '独服', value: 4495 },
          { name: 'CDN', value: 1120 },
          { name: '其他', value: 291.5 },
        ],
      },
    };
  }

  // ===== 上游配置 =====
  if (url === '/admin/upstream/api-key' && method === 'get') {
    return {
      apiKey: 'ry_****_****_****_a1b2c3d4',
      apiBase: 'https://api.v2.rainyun.com',
      mockMode: false,
      connected: true,
      lastSyncAt: '2025-07-20 10:00',
    };
  }
  if (url === '/admin/upstream/panel-config' && method === 'get') {
    return {
      panelDomain: 'panel.keyu.cloud',
      panelName: '柯羽云面板',
      icpNo: '京ICP备2025xxxxxx号',
    };
  }

  // ===== SMTP 配置 =====
  if (url === '/admin/smtp/config' && method === 'get') {
    return {
      host: 'smtp.qiye.aliyun.com',
      port: 465,
      encryption: 'SSL/TLS',
      fromEmail: 'noreply@keyu.cloud',
      username: 'noreply@keyu.cloud',
      password: '****',
      fromName: '柯羽云',
    };
  }
  if (url === '/admin/smtp/templates' && method === 'get') return { list: SMTP_TEMPLATES };
  if (url === '/admin/smtp/logs' && method === 'get') return { list: SMTP_LOGS, total: SMTP_LOGS.length };

  // ===== 短信配置 =====
  if (url === '/admin/sms/config' && method === 'get') {
    return {
      provider: 'aliyun',
      accessKeyId: 'LTAI****JD9H',
      accessKeySecret: '****',
      signName: '柯羽云',
      templateCode: 'SMS_123456789',
      region: 'cn-hangzhou',
      configured: true,
    };
  }

  // ===== 优惠券 =====
  if (url === '/admin/coupons' && method === 'get') return { list: COUPONS, total: COUPONS.length };

  // ===== 公告 =====
  if (url === '/admin/announcements' && method === 'get') return { list: ANNOUNCEMENTS };

  // ===== 系统配置 =====
  if (url === '/admin/system/configs' && method === 'get') {
    return {
      configs: [
        { key: 'site_name', value: '柯羽云' },
        { key: 'site_domain', value: 'keyu.cloud' },
        { key: 'icp_no', value: '京ICP备2025xxxxxx号' },
        { key: 'support_qq', value: '10001' },
        { key: 'support_wechat', value: 'keyu-support' },
      ],
    };
  }
  if (url === '/admin/system/env-info' && method === 'get') {
    return {
      nodeVersion: 'v20.10.0',
      npmVersion: '10.2.3',
      database: 'PostgreSQL 15.4',
      redis: '7.2.0',
      os: 'Ubuntu 22.04.3 LTS',
      cpu: 'Intel Xeon E5-2680v4 @ 2.40GHz',
      memory: '16GB',
      disk: '500GB SSD',
    };
  }
  if (url === '/admin/system/version-check' && method === 'get') {
    return {
      currentVersion: '2.4.1',
      latestVersion: '2.4.1',
      hasUpdate: false,
      releaseDate: '2025-07-18',
      changelog: '- 新增自动续费功能\n- 优化工单回复体验\n- 修复若干已知问题',
    };
  }

  // ===== 管理员 =====
  if (url === '/admin/admins' && method === 'get') return { list: ADMINS, total: ADMINS.length };

  // ===== 审计日志 =====
  if (url === '/admin/audit-logs' && method === 'get') return { list: AUDIT_LOGS, total: AUDIT_LOGS.length };

  // ===== 通用回退 =====
  if (method === 'put' || method === 'post' || method === 'delete') return { ok: true };

  console.warn('[mock] 未匹配:', method, url, args);
  return null;
}
