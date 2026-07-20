import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  // ============ 前台门户 ============
  {
    path: '/',
    component: () => import('@/layouts/PortalLayout.vue'),
    children: [
      { path: '', name: 'Home', component: () => import('@/views/portal/Home.vue') },
      { path: 'products', name: 'Products', component: () => import('@/views/portal/Products.vue') },
      { path: 'products/zone/:zone', name: 'ZoneDetail', component: () => import('@/views/portal/ZoneDetail.vue') },
      { path: 'products/:id', name: 'ProductDetail', component: () => import('@/views/portal/ProductDetail.vue') },
      { path: 'login', name: 'Login', component: () => import('@/views/portal/Login.vue'), meta: { public: true } },
      { path: 'register', name: 'Register', component: () => import('@/views/portal/Register.vue'), meta: { public: true } },
      { path: 'payment/result', name: 'PaymentResult', component: () => import('@/views/portal/PaymentResult.vue'), meta: { public: true } },
    ],
  },

  // ============ 用户后台 ============
  {
    path: '/dashboard',
    component: () => import('@/layouts/DashboardLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'DashboardHome', component: () => import('@/views/dashboard/Home.vue') },
      { path: 'orders', name: 'DashboardOrders', component: () => import('@/views/dashboard/Orders.vue') },
      { path: 'orders/:id', name: 'DashboardOrderDetail', component: () => import('@/views/dashboard/OrderDetail.vue') },
      { path: 'products', name: 'DashboardProducts', component: () => import('@/views/dashboard/Products.vue') },
      { path: 'products/:id', name: 'DashboardProductDetail', component: () => import('@/views/dashboard/ProductDetail.vue') },
      { path: 'tickets', name: 'DashboardTickets', component: () => import('@/views/dashboard/Tickets.vue') },
      { path: 'tickets/new', name: 'DashboardTicketNew', component: () => import('@/views/dashboard/TicketNew.vue') },
      { path: 'tickets/:id', name: 'DashboardTicketDetail', component: () => import('@/views/dashboard/TicketDetail.vue') },
      { path: 'finance', name: 'DashboardFinance', component: () => import('@/views/dashboard/Finance.vue') },
      { path: 'profile', name: 'DashboardProfile', component: () => import('@/views/dashboard/Profile.vue') },
      { path: 'notifications', name: 'DashboardNotifications', component: () => import('@/views/dashboard/Notifications.vue') },
    ],
  },

  // ============ 管理后台 ============
  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: () => import('@/views/admin/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      { path: '', name: 'AdminDashboard', component: () => import('@/views/admin/Dashboard.vue') },
      { path: 'users', name: 'AdminUsers', component: () => import('@/views/admin/Users.vue') },
      { path: 'users/:id', name: 'AdminUserDetail', component: () => import('@/views/admin/UserDetail.vue') },
      { path: 'products', name: 'AdminProducts', component: () => import('@/views/admin/Products.vue') },
      { path: 'orders', name: 'AdminOrders', component: () => import('@/views/admin/Orders.vue') },
      { path: 'orders/:id', name: 'AdminOrderDetail', component: () => import('@/views/admin/OrderDetail.vue') },
      { path: 'user-products', name: 'AdminUserProducts', component: () => import('@/views/admin/UserProducts.vue') },
      { path: 'tickets', name: 'AdminTickets', component: () => import('@/views/admin/Tickets.vue') },
      { path: 'tickets/:id', name: 'AdminTicketDetail', component: () => import('@/views/admin/TicketDetail.vue') },
      { path: 'finance', name: 'AdminFinance', component: () => import('@/views/admin/Finance.vue') },
      { path: 'upstream', name: 'AdminUpstream', component: () => import('@/views/admin/Upstream.vue') },
      { path: 'smtp', name: 'AdminSmtp', component: () => import('@/views/admin/Smtp.vue') },
      { path: 'smtp/templates', name: 'AdminSmtpTemplates', component: () => import('@/views/admin/SmtpTemplates.vue') },
      { path: 'smtp/logs', name: 'AdminSmtpLogs', component: () => import('@/views/admin/SmtpLogs.vue') },
      { path: 'sms', name: 'AdminSms', component: () => import('@/views/admin/Sms.vue') },
      { path: 'coupons', name: 'AdminCoupons', component: () => import('@/views/admin/Coupons.vue') },
      { path: 'announcements', name: 'AdminAnnouncements', component: () => import('@/views/admin/Announcements.vue') },
      { path: 'system', name: 'AdminSystem', component: () => import('@/views/admin/System.vue') },
      { path: 'environment', name: 'AdminEnvironment', component: () => import('@/views/admin/Environment.vue') },
      { path: 'version-update', name: 'AdminVersionUpdate', component: () => import('@/views/admin/VersionUpdate.vue') },
      { path: 'admins', name: 'AdminAdmins', component: () => import('@/views/admin/Admins.vue') },
      { path: 'profile', name: 'AdminProfile', component: () => import('@/views/admin/Profile.vue') },
      { path: 'audit-logs', name: 'AdminAuditLogs', component: () => import('@/views/admin/AuditLogs.vue') },
    ],
  },

  // 404
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token');
  const adminToken = localStorage.getItem('adminToken');

  if (to.meta.requiresAuth && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
  } else if (to.meta.requiresAdmin && !adminToken) {
    next({ name: 'AdminLogin' });
  } else {
    next();
  }
});

export default router;
