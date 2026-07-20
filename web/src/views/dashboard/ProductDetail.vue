<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userProductApi } from '@/api/user-product';
import { ticketApi } from '@/api/ticket';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const product = ref<any>(null);
const relatedTickets = ref<any[]>([]);

// 实时资源使用率（来自 /usage API，进入页面自动刷新一次，之后每 10 秒刷新）
const usageData = ref<any>(null);
const usageLoading = ref(false);
const USAGE_REFRESH_INTERVAL = 10000; // 10 秒
let usageTimer: ReturnType<typeof setInterval> | null = null;

// OS 模板列表（与购买页保持一致：按产品 zone 过滤 + mapOs 标准化）
const osList = ref<any[]>([]);
const osListLoading = ref(false);

// 预装软件列表（与购买页保持一致）
const appTemplates = ref<any[]>([]);

// 操作中状态
const actionLoading = ref<Record<string, boolean>>({});

// 重装系统弹窗
const reinstallDialog = reactive({
  visible: false,
  loading: false,
  osId: '' as number | '',
  password: '',
  useCustomPassword: false,
  selectedAppIds: [] as number[],
  appVars: {} as Record<string, string>,
  currentDist: '',
});

// 续费表单
const renewForm = reactive({
  duration: 1,
  loading: false,
  priceLoading: false,
  prices: null as Record<string, number> | null,
  balance: 0,
});

// 续费时长选项（雨云官方仅支持 1/3/6/12 月）
const durationOptions = [
  { label: '1 个月', value: 1 },
  { label: '3 个月', value: 3 },
  { label: '6 个月', value: 6 },
  { label: '1 年', value: 12 },
];

// 当前选中时长对应的续费价格
const currentRenewPrice = computed(() => {
  if (!renewForm.prices) return null;
  const p = renewForm.prices[String(renewForm.duration)];
  if (p == null) return null;
  // 后端可能返回字符串（Prisma Decimal）或数字，统一转为 number
  const num = Number(p);
  return isNaN(num) ? null : num;
});

// 余额是否充足
const isBalanceEnough = computed(() => {
  if (currentRenewPrice.value == null) return true;
  return renewForm.balance >= currentRenewPrice.value;
});

// 余额不足金额
const shortageAmount = computed(() => {
  if (currentRenewPrice.value == null) return 0;
  return Math.max(0, currentRenewPrice.value - renewForm.balance);
});

// 产品 ID
const productId = computed(() => Number(route.params.id));

// 状态映射（兼容大小写）
const stateMap: Record<string, { text: string; type: string }> = {
  running: { text: '运行中', type: 'success' },
  RUNNING: { text: '运行中', type: 'success' },
  expired: { text: '已到期', type: 'danger' },
  EXPIRED: { text: '已到期', type: 'danger' },
  paused: { text: '已暂停', type: 'warning' },
  PAUSED: { text: '已暂停', type: 'warning' },
  stopped: { text: '已关机', type: 'info' },
  STOPPED: { text: '已关机', type: 'info' },
  pending: { text: '开通中', type: 'info' },
  PENDING: { text: '开通中', type: 'info' },
};

// 上游实时状态（来自 product.upstreamDetail）
const upstream = computed(() => product.value?.upstreamDetail || null);

// 资源使用率（优先用 usageData，回退到 upstream.usage_percent）
const usagePercent = computed(
  () => usageData.value?.usage_percent || upstream.value?.usage_percent || null,
);

const cpuPercent = computed(() => usagePercent.value?.cpu ?? null);
const memoryPercent = computed(() => usagePercent.value?.memory ?? null);
const diskPercent = computed(() => usagePercent.value?.disk ?? null);
const netInKb = computed(() => usagePercent.value?.net_in_kb ?? null);
const netOutKb = computed(() => usagePercent.value?.net_out_kb ?? null);
const diskReadKb = computed(() => usagePercent.value?.disk_read_kb ?? null);
const diskWriteKb = computed(() => usagePercent.value?.disk_write_kb ?? null);

const memoryMaxBytes = computed(() => usagePercent.value?.memory_max_bytes ?? null);
const memoryUsedBytes = computed(() => {
  const up = usagePercent.value;
  if (!up) return null;
  if (up.memory_used_bytes && up.memory_used_bytes > 0) return up.memory_used_bytes;
  if (up.memory_max_bytes && up.memory_free_bytes != null) {
    return up.memory_max_bytes - up.memory_free_bytes;
  }
  return null;
});

const diskTotalBytes = computed(() => usagePercent.value?.disk_total_bytes ?? null);
const diskUsedBytes = computed(() => usagePercent.value?.disk_used_bytes ?? null);

// 上游同步的产品信息（与子面板用户那边一致）
const upstreamInfo = computed(() => {
  const u = upstream.value;
  if (!u) return null;
  return {
    host_name: u.host_name || '',
    os_name: u.os_name || u.os_chinese_name || '',
    os_type: u.os_type || '',
    ipv4: u.ipv4 || u.int_ipv4 || '',
    nat_public_ip: u.nat_public_ip || '',
    nat_public_domain: u.nat_public_domain || '',
    zone: u.zone || u.zone_name || '',
    region: u.region || '',
    node_name: u.node_name || '',
    plan_name: u.plan_name || u.plan_chinese_name || '',
    cpu: u.cpu || 0,
    memory: u.memory || 0,
    disk: u.disk || 0,
    bandwidth: u.bandwidth || 0,
    net_in: u.net_in || 0,
    net_out: u.net_out || 0,
    traffic_bytes: u.traffic_bytes || 0,
    traffic_bytes_day_limit: u.traffic_bytes_day_limit || 0,
    status: u.status || '',
  };
});

const trafficPercent = computed(() => {
  if (!upstreamInfo.value || !upstreamInfo.value.traffic_bytes_day_limit) return null;
  return (upstreamInfo.value.traffic_bytes / upstreamInfo.value.traffic_bytes_day_limit) * 100;
});

const currentState = computed(() => {
  if (upstreamInfo.value?.status) return upstreamInfo.value.status;
  return product.value?.state || '';
});

const canStart = computed(() => {
  const s = String(currentState.value || '').toUpperCase();
  return s !== 'RUNNING' && s !== 'EXPIRED';
});
const canStop = computed(() => {
  const s = String(currentState.value || '').toUpperCase();
  return s === 'RUNNING';
});
const canRestart = computed(() => {
  const s = String(currentState.value || '').toUpperCase();
  return s === 'RUNNING';
});

// 服务器内存（GB，用于 Windows 校验：Windows 仅 2G+ 可选）
const serverMemoryGb = computed(() => {
  const m = Number(upstreamInfo.value?.memory || 0);
  return m / 1024; // 上游 memory 字段单位 MB
});

// ===== OS 列表过滤（与购买页一致）：Windows 仅 2G+ 内存可选 =====
const WINDOWS_MIN_MEMORY = 2; // GB

const availableOsList = computed(() => {
  if (!osList.value.length) return [];
  const canWindows = serverMemoryGb.value >= WINDOWS_MIN_MEMORY;
  return osList.value.filter((os: any) => {
    if (os.is_available === false) return false;
    if (os.os_type === 'windows' && !canWindows) return false;
    return true;
  });
});

// ===== OS 按发行版分组（基于 order 字段分段，与购买页一致） =====
// 200=Debian / 300=Ubuntu / 400=CentOS / 500=Windows
// 600=RockyLinux / 700=AlpineLinux / 800=MacOS
function inferDist(os: any): string {
  if (os.order) {
    if (os.order < 300) return 'Debian';
    if (os.order < 400) return 'Ubuntu';
    if (os.order < 500) return 'CentOS';
    if (os.order < 600) return 'Windows';
    if (os.order < 700) return 'RockyLinux';
    if (os.order < 800) return 'AlpineLinux';
    return 'MacOS';
  }
  const n = (os.name || os.code || '').toLowerCase();
  if (n.includes('win')) return 'Windows';
  if (n.includes('debian')) return 'Debian';
  if (n.includes('ubuntu')) return 'Ubuntu';
  if (n.includes('centos') || n.includes('almalinux')) return 'CentOS';
  if (n.includes('rocky')) return 'RockyLinux';
  if (n.includes('alpine')) return 'AlpineLinux';
  if (n.includes('macos') || n.includes('mac os')) return 'MacOS';
  return '其他';
}

const groupedOsList = computed<{ dist: string; items: any[] }[]>(() => {
  const groups = new Map<string, any[]>();
  for (const os of availableOsList.value) {
    const dist = inferDist(os);
    if (!groups.has(dist)) groups.set(dist, []);
    groups.get(dist)!.push(os);
  }
  for (const list of groups.values()) {
    list.sort(
      (a, b) =>
        (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name)),
    );
  }
  return Array.from(groups.entries())
    .map(([dist, items]) => ({ dist, items }))
    .sort((a, b) => (a.items[0]?.order ?? 999) - (b.items[0]?.order ?? 999));
});

const currentDistOsList = computed(() => {
  const g = groupedOsList.value.find((x) => x.dist === reinstallDialog.currentDist);
  return g?.items || [];
});

const currentOs = computed(() => {
  if (!reinstallDialog.osId) return null;
  return availableOsList.value.find((o: any) => o.id === reinstallDialog.osId) || null;
});

// ===== 预装软件按所选 OS 过滤（基于 os_requirement 正则，与购买页一致） =====
const filteredAppTemplates = computed(() => {
  if (!appTemplates.value.length || !currentOs.value) return [];
  const osCode = currentOs.value.code || currentOs.value.name || '';
  return appTemplates.value.filter((app: any) => {
    const req = app.os_requirement;
    if (!req) return true;
    try {
      return new RegExp(req).test(osCode);
    } catch {
      return false;
    }
  });
});

const selectedAppsWithVars = computed(() => {
  return filteredAppTemplates.value.filter(
    (a: any) =>
      reinstallDialog.selectedAppIds.includes(a.app_id) && a.vars && a.vars.length > 0,
  );
});

function shouldShowVar(app: any, vDef: any): boolean {
  if (!vDef.depend_var) return true;
  const depVal = reinstallDialog.appVars[`${app.app_id}:${vDef.depend_var}`] || '';
  if (!vDef.depend_regex) return !!depVal;
  try {
    return new RegExp(vDef.depend_regex).test(depVal);
  } catch {
    return !!depVal;
  }
}

function selectOsDist(dist: string) {
  reinstallDialog.currentDist = dist;
  const group = groupedOsList.value.find((g) => g.dist === dist);
  if (group && group.items.length) {
    reinstallDialog.osId = group.items[0].id;
  }
}

// 格式化工具
function formatTime(val: string | number) {
  if (!val && val !== 0) return '-';
  try {
    // 数字时间戳：雨云 update_time 为秒级，前端需乘 1000 转毫秒
    if (typeof val === 'number') {
      return new Date(val < 1e12 ? val * 1000 : val).toLocaleString('zh-CN');
    }
    return new Date(val).toLocaleString('zh-CN');
  } catch {
    return String(val);
  }
}
function formatMoney(val: number | string | null | undefined) {
  return `¥${Number(val || 0).toFixed(2)}`;
}
function formatBytes(bytes: number | null | undefined, decimals = 2) {
  if (bytes == null || isNaN(bytes as number)) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}
function formatRate(kb: number | null | undefined) {
  if (kb == null || isNaN(kb as number)) return '-';
  if (kb < 1) return `${(kb * 1024).toFixed(0)} B/s`;
  if (kb < 1024) return `${kb.toFixed(2)} KB/s`;
  return `${(kb / 1024).toFixed(2)} MB/s`;
}
function formatMemory(mb: number) {
  if (!mb) return '-';
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
}
function formatDisk(gb: number) {
  if (!gb) return '-';
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb} GB`;
}
function progressColor(percent: number | null | undefined) {
  if (percent == null) return '#4f7a3f';
  if (percent > 80) return '#a33a2e';
  if (percent > 60) return '#b8860b';
  return '#4f7a3f';
}

// 加载产品详情
async function loadDetail() {
  if (!productId.value) return;
  loading.value = true;
  try {
    const res = await userProductApi.detail(productId.value);
    product.value = res.data;
    loadRelatedTickets();
    // 进入页面时自动刷新一次资源使用率
    fetchUsage();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false;
  }
}

async function loadRelatedTickets() {
  try {
    const res = await ticketApi.list({
      userProductId: productId.value,
      page: 1,
      pageSize: 10,
    });
    relatedTickets.value = res.data?.list || res.data?.items || [];
  } catch (e) {
    // 忽略工单加载失败
  }
}

// 拉取实时资源使用率
async function fetchUsage() {
  if (!productId.value) return;
  usageLoading.value = true;
  try {
    const res = await userProductApi.usage(productId.value);
    usageData.value = res.data;
  } catch (e) {
    // 静默失败：资源使用率不阻塞页面
  } finally {
    usageLoading.value = false;
  }
}

async function fetchOsList() {
  if (!productId.value) return;
  osListLoading.value = true;
  try {
    const res = await userProductApi.osTemplates(productId.value);
    osList.value = res.data || [];
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    osListLoading.value = false;
  }
}

async function fetchAppTemplates() {
  if (!productId.value) return;
  try {
    const res = await userProductApi.appTemplates(productId.value);
    appTemplates.value = res.data || [];
  } catch (e) {
    // 静默失败
  }
}

// 操作产品（开机/关机/重启，直接调雨云官方 API）
async function onOperate(action: string, actionText: string) {
  if (!product.value) return;
  try {
    await ElMessageBox.confirm(
      `确定要${actionText}产品「${product.value.name || product.value.productName}」吗？`,
      `${actionText}确认`,
      {
        customClass: 'keke-confirm-box',
        confirmButtonClass: 'el-button--primary',
        type: action === 'restart' ? 'warning' : 'info',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  actionLoading.value[action] = true;
  try {
    await userProductApi.operate(productId.value, action as 'start' | 'stop' | 'restart');
    ElMessage.success(`${actionText}指令已发送`);
    await loadDetail();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    actionLoading.value[action] = false;
  }
}

// 打开重装系统弹窗
async function openReinstallDialog() {
  reinstallDialog.osId = '';
  reinstallDialog.password = '';
  reinstallDialog.useCustomPassword = false;
  reinstallDialog.selectedAppIds = [];
  reinstallDialog.appVars = {};
  reinstallDialog.currentDist = '';
  reinstallDialog.visible = true;

  // 并行加载 OS 列表和预装软件列表
  const osPromise = osList.value.length ? Promise.resolve() : fetchOsList();
  const appPromise = appTemplates.value.length ? Promise.resolve() : fetchAppTemplates();
  await Promise.all([osPromise, appPromise]);

  // 默认选中第一个发行版和该发行版下第一个 OS
  if (groupedOsList.value.length) {
    selectOsDist(groupedOsList.value[0].dist);
  }
}

// 监听 OS 切换：清除已选但当前 OS 不支持的预装软件
watch(
  () => reinstallDialog.osId,
  () => {
    if (!filteredAppTemplates.value.length) {
      reinstallDialog.selectedAppIds = [];
      return;
    }
    const validIds = new Set(filteredAppTemplates.value.map((a: any) => a.app_id));
    reinstallDialog.selectedAppIds = reinstallDialog.selectedAppIds.filter((id) =>
      validIds.has(id),
    );
  },
);

// 确认重装系统
//   - 不填密码 → 不传 password 字段，雨云自动随机生成
//   - 填了密码 → 传 password 字段
//   - 预装软件 → 透传 app_vars 数组
async function confirmReinstall() {
  if (!reinstallDialog.osId && reinstallDialog.osId !== 0) {
    ElMessage.warning('请选择操作系统');
    return;
  }
  const customPwd = reinstallDialog.useCustomPassword ? reinstallDialog.password : '';
  if (customPwd && customPwd.length < 8) {
    ElMessage.warning('密码长度至少 8 位');
    return;
  }

  // 组装预装软件参数
  const appVars = reinstallDialog.selectedAppIds.map((appId) => {
    const vars: Record<string, string> = {};
    const app = appTemplates.value.find((a: any) => a.app_id === appId);
    if (app?.vars) {
      for (const v of app.vars) {
        const key = `${appId}:${v.name}`;
        const userVal = reinstallDialog.appVars[key];
        vars[v.name] = userVal ?? v.default ?? '';
      }
    }
    return { app_id: appId, vars };
  });

  const appNames = reinstallDialog.selectedAppIds
    .map((id) => appTemplates.value.find((a: any) => a.app_id === id)?.chinese_name || '')
    .filter(Boolean);

  try {
    await ElMessageBox.confirm(
      `重装系统将清除服务器上的所有数据，且无法恢复！\n` +
        (appNames.length ? `预装软件：${appNames.join('、')}\n` : '') +
        (customPwd ? '将使用您设置的密码\n' : '将自动生成随机密码（稍后在面板查看）\n') +
        `确认继续吗？`,
      '危险操作确认',
      {
        customClass: 'keke-confirm-box',
        confirmButtonClass: 'el-button--danger',
        type: 'error',
        confirmButtonText: '确认重装',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  reinstallDialog.loading = true;
  try {
    await userProductApi.reinstall(
      productId.value,
      Number(reinstallDialog.osId),
      customPwd || undefined,
      appVars.length ? appVars : undefined,
    );
    ElMessage.success(
      customPwd
        ? '重装系统指令已发送，请等待几分钟'
        : '重装系统指令已发送，系统将自动生成随机密码，请稍后在面板查看',
    );
    reinstallDialog.visible = false;
    await loadDetail();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    reinstallDialog.loading = false;
  }
}

// 拉取续费价格 + 刷新余额
async function fetchRenewPrice() {
  if (!productId.value) return;
  renewForm.priceLoading = true;
  renewForm.balance = Number(authStore.user?.balance || 0);
  try {
    const [priceRes, profileRes] = await Promise.all([
      userProductApi.getRenewPrice(productId.value).catch((e) => {
        console.warn('获取续费价格失败:', e);
        return null;
      }),
      authApi.profile().catch(() => null),
    ]);
    if (priceRes?.data?.prices) {
      renewForm.prices = priceRes.data.prices;
    } else if (priceRes?.data) {
      renewForm.prices = (priceRes.data as any).prices || (priceRes.data as any);
    }
    if (profileRes?.data?.balance != null) {
      renewForm.balance = Number(profileRes.data.balance || 0);
      if (authStore.user) {
        authStore.user = { ...authStore.user, balance: Number(profileRes.data.balance) };
      }
    }
  } finally {
    renewForm.priceLoading = false;
  }
}

// 跳转到充值页面
function goToRecharge() {
  router.push('/dashboard/finance');
}

// 余额不足弹窗（可点击"立即去充值"）
async function showInsufficientBalanceDialog() {
  try {
    await ElMessageBox.confirm(
      `当前账户余额 ${formatMoney(renewForm.balance)}，续费需 ${formatMoney(currentRenewPrice.value)}，差额 ${formatMoney(shortageAmount.value)}。请先充值后再续费。`,
      '余额不足',
      {
        confirmButtonText: '立即去充值',
        cancelButtonText: '稍后再说',
        type: 'warning',
        customClass: 'keke-confirm-box',
        confirmButtonClass: 'el-button--warning',
      },
    );
    goToRecharge();
  } catch {
    // 用户取消
  }
}

async function onRenew() {
  // 余额检查：若价格已加载且余额不足，弹窗提示并阻止续费
  if (currentRenewPrice.value != null && !isBalanceEnough.value) {
    showInsufficientBalanceDialog();
    return;
  }
  renewForm.loading = true;
  try {
    await userProductApi.renew(productId.value, renewForm.duration);
    ElMessage.success('续费成功');
    // 续费后刷新用户余额
    authStore.fetchProfile().catch(() => {});
    await loadDetail();
  } catch (e: any) {
    // 提取后端返回的错误码和消息（http 拦截器已把 code/message 挂到 error 上）
    const errCode = String(e?.code || e?.response?.data?.code || '');
    const errMsg = String(e?.message || e?.response?.data?.message || '');
    // 余额不足错误：弹出余额不足弹窗
    if (errCode === 'INSUFFICIENT_BALANCE' ||
        errMsg.includes('余额不足') || errMsg.includes('余额') ||
        errMsg.includes('balance') || errMsg.includes('insufficient')) {
      try {
        const profileRes = await authApi.profile();
        if (profileRes?.data?.balance != null) {
          renewForm.balance = Number(profileRes.data.balance || 0);
          if (authStore.user) {
            authStore.user = { ...authStore.user, balance: Number(profileRes.data.balance) };
          }
        }
      } catch {
        // ignore
      }
      showInsufficientBalanceDialog();
    }
    // 其他错误已由 http 拦截器统一弹消息提示，这里无需重复处理
  } finally {
    renewForm.loading = false;
  }
}

async function openPanel() {
  try {
    const res = await userProductApi.getPanelUrl(productId.value);
    const url = res.data?.url || res.data?.panelUrl || res.data?.loginUrl;
    if (url) {
      window.open(typeof url === 'string' ? url : String(url), '_blank');
    } else {
      ElMessage.warning('未获取到管理面板地址');
    }
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

async function onSync() {
  loading.value = true;
  try {
    await userProductApi.sync(productId.value);
    ElMessage.success('状态已同步');
    await loadDetail();
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false;
  }
}

function goTicket(row: any) {
  router.push(`/dashboard/tickets/${row.id}`);
}
function goNewTicket() {
  router.push({
    path: '/dashboard/tickets/new',
    query: { productId: String(productId.value) },
  });
}
function goBack() {
  router.push('/dashboard/products');
}
function goOrder() {
  if (product.value?.orderId) {
    router.push(`/dashboard/orders/${product.value.orderId}`);
  }
}

onMounted(() => {
  loadDetail();
  fetchRenewPrice();
  // 进入页面已通过 loadDetail 触发首次刷新，之后每 10 秒自动刷新
  usageTimer = setInterval(() => {
    if (product.value && !usageLoading.value) {
      fetchUsage();
    }
  }, USAGE_REFRESH_INTERVAL);
});

onUnmounted(() => {
  if (usageTimer) {
    clearInterval(usageTimer);
    usageTimer = null;
  }
});
</script>

<template>
  <div class="product-detail-page" v-loading="loading">
    <!-- 页头 -->
    <header class="page-head">
      <el-button link class="back-btn" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <div class="head-meta">
        <span class="eyebrow">PRODUCT DETAIL</span>
        <h1 class="page-title font-display">
          {{ upstreamInfo?.host_name || product?.name || product?.productName || '产品详情' }}
        </h1>
      </div>
      <div class="head-actions" v-if="product">
        <el-button class="btn-outline" @click="onSync">
          <el-icon><Refresh /></el-icon>
          同步状态
        </el-button>
        <el-button class="btn-gold" @click="openPanel">
          <el-icon><Monitor /></el-icon>
          进入官方面板
        </el-button>
      </div>
    </header>

    <template v-if="product">
      <!-- 状态卡 -->
      <section class="status-card card">
        <div class="status-row">
          <span class="eyebrow">当前状态</span>
          <span
            class="status-text is-large"
            :class="`is-${stateMap[currentState]?.type || 'info'}`"
          >
            {{ stateMap[currentState]?.text || currentState || '未知' }}
          </span>
        </div>
        <div class="status-extra">
          <span class="extra-label">到期时间</span>
          <span
            class="extra-value"
            :class="{ 'is-expired': product.state === 'expired' }"
          >{{ formatTime(product.expireAt) }}</span>
        </div>
      </section>

      <!-- 基本信息（与子面板用户那边同步）+ 实时资源使用 -->
      <section class="info-grid">
        <div class="detail-card card">
          <div class="card-header">
            <h2 class="card-title">基本信息</h2>
            <span class="sync-tag" v-if="upstreamInfo">
              <el-icon><Connection /></el-icon>
              已与子面板同步
            </span>
          </div>
          <div class="card-body">
            <el-descriptions :column="2" class="dashed-desc">
              <el-descriptions-item label="主机名">
                {{ upstreamInfo?.host_name || product?.name || product?.productName || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="套餐">
                {{ upstreamInfo?.plan_name || product?.spec || product?.specName || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="CPU">
                {{ upstreamInfo?.cpu ? `${upstreamInfo.cpu} 核` : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="内存">
                {{ upstreamInfo?.memory ? formatMemory(upstreamInfo.memory) : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="磁盘">
                {{ upstreamInfo?.disk ? formatDisk(upstreamInfo.disk) : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="带宽">
                <template v-if="upstreamInfo?.net_in && upstreamInfo.net_in !== upstreamInfo.bandwidth">
                  ↑{{ upstreamInfo.net_in }} / ↓{{ upstreamInfo.bandwidth }} Mbps
                </template>
                <template v-else-if="upstreamInfo?.bandwidth">
                  {{ upstreamInfo.bandwidth }} Mbps
                </template>
                <template v-else>-</template>
              </el-descriptions-item>
              <el-descriptions-item label="操作系统">
                {{ upstreamInfo?.os_name || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="区域/节点">
                {{ upstreamInfo?.zone || upstreamInfo?.region || '-' }}
                <span v-if="upstreamInfo?.node_name" class="sub-text">
                  / {{ upstreamInfo.node_name }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="IPv4 地址">
                <span class="mono-value">
                  {{ upstreamInfo?.ipv4 || product?.ip || product?.ipv4 || '-' }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="NAT 公网">
                <span v-if="upstreamInfo?.nat_public_domain" class="mono-value">
                  {{ upstreamInfo.nat_public_domain }}
                </span>
                <span v-else-if="upstreamInfo?.nat_public_ip" class="mono-value">
                  {{ upstreamInfo.nat_public_ip }}
                </span>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="所属订单">
                <span v-if="product.orderId" class="link-text" @click="goOrder">#{{ product.orderId }}</span>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">
                <span class="time-value">{{ formatTime(product.createdAt) }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <!-- 实时资源使用（来自雨云官方 API，与子面板一致） -->
        <div class="detail-card card">
          <div class="card-header">
            <h2 class="card-title">实时资源使用</h2>
            <el-button
              link
              class="refresh-btn"
              :loading="usageLoading"
              @click="fetchUsage"
            >
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
          <div class="card-body metrics-body">
            <template v-if="usagePercent">
              <div class="metric-item">
                <div class="metric-head">
                  <span class="metric-label eyebrow">CPU 使用率</span>
                  <span class="metric-value">
                    {{ cpuPercent != null ? cpuPercent.toFixed(2) : '--' }}%
                  </span>
                </div>
                <el-progress
                  :percentage="Number(cpuPercent || 0)"
                  :stroke-width="8"
                  :color="progressColor(cpuPercent)"
                />
              </div>

              <div class="metric-item">
                <div class="metric-head">
                  <span class="metric-label eyebrow">内存使用率</span>
                  <span class="metric-value">
                    {{ memoryPercent != null ? memoryPercent.toFixed(2) : '--' }}%
                    <span class="metric-sub" v-if="memoryUsedBytes != null && memoryMaxBytes">
                      ({{ formatBytes(memoryUsedBytes) }} / {{ formatBytes(memoryMaxBytes) }})
                    </span>
                  </span>
                </div>
                <el-progress
                  :percentage="Number(memoryPercent || 0)"
                  :stroke-width="8"
                  :color="progressColor(memoryPercent)"
                />
              </div>

              <div class="metric-item">
                <div class="metric-head">
                  <span class="metric-label eyebrow">磁盘使用率</span>
                  <span class="metric-value">
                    {{ diskPercent != null ? diskPercent.toFixed(2) : '--' }}%
                    <span class="metric-sub" v-if="diskUsedBytes != null && diskTotalBytes">
                      ({{ formatBytes(diskUsedBytes) }} / {{ formatBytes(diskTotalBytes) }})
                    </span>
                  </span>
                </div>
                <el-progress
                  :percentage="Number(diskPercent || 0)"
                  :stroke-width="8"
                  :color="progressColor(diskPercent)"
                />
              </div>

              <div class="metric-grid">
                <div class="metric-cell">
                  <span class="metric-label eyebrow">入站速率</span>
                  <span class="metric-value-sm">{{ formatRate(netInKb) }}</span>
                </div>
                <div class="metric-cell">
                  <span class="metric-label eyebrow">出站速率</span>
                  <span class="metric-value-sm">{{ formatRate(netOutKb) }}</span>
                </div>
                <div class="metric-cell">
                  <span class="metric-label eyebrow">磁盘读</span>
                  <span class="metric-value-sm">{{ formatRate(diskReadKb) }}</span>
                </div>
                <div class="metric-cell">
                  <span class="metric-label eyebrow">磁盘写</span>
                  <span class="metric-value-sm">{{ formatRate(diskWriteKb) }}</span>
                </div>
              </div>

              <div class="metric-item" v-if="upstreamInfo?.traffic_bytes_day_limit">
                <div class="metric-head">
                  <span class="metric-label eyebrow">流量使用</span>
                  <span class="metric-value">
                    {{ formatBytes(upstreamInfo.traffic_bytes) }}
                    <span class="metric-sub">
                      / {{ formatBytes(upstreamInfo.traffic_bytes_day_limit) }}
                    </span>
                  </span>
                </div>
                <el-progress
                  :percentage="Number(trafficPercent || 0)"
                  :stroke-width="8"
                  :color="progressColor(trafficPercent)"
                />
              </div>

              <div class="metric-update" v-if="usagePercent.update_time">
                <el-icon><Clock /></el-icon>
                数据更新于：{{ formatTime(usagePercent.update_time) }}
              </div>
            </template>

            <el-empty
              v-else
              :description="usageLoading ? '加载中...' : '暂无实时数据（仅在服务器运行时可用）'"
              :image-size="80"
            />
          </div>
        </div>
      </section>

      <!-- 操作面板（开机/关机/重启/重装系统，直接调雨云官方 API） -->
      <section class="detail-card card">
        <div class="card-header">
          <h2 class="card-title">操作面板</h2>
          <span class="card-subtip">所有操作均直接调用雨云官方 API</span>
        </div>
        <div class="card-body action-panel">
          <el-button
            type="success"
            :loading="actionLoading.start"
            :disabled="!canStart"
            @click="onOperate('start', '开机')"
          >
            <el-icon><VideoPlay /></el-icon>
            开机
          </el-button>
          <el-button
            type="warning"
            :loading="actionLoading.stop"
            :disabled="!canStop"
            @click="onOperate('stop', '关机')"
          >
            <el-icon><VideoPause /></el-icon>
            关机
          </el-button>
          <el-button
            type="primary"
            :loading="actionLoading.restart"
            :disabled="!canRestart"
            @click="onOperate('restart', '重启')"
          >
            <el-icon><RefreshRight /></el-icon>
            重启
          </el-button>
          <el-button
            type="danger"
            plain
            @click="openReinstallDialog"
          >
            <el-icon><Tools /></el-icon>
            重装系统
          </el-button>
          <el-button class="btn-gold" plain @click="openPanel">
            <el-icon><Monitor /></el-icon>
            进入官方面板
          </el-button>
        </div>
      </section>

      <!-- 续费表单 -->
      <section class="detail-card card">
        <div class="card-header">
          <h2 class="card-title">续费</h2>
        </div>
        <div class="card-body renew-body">
          <div class="renew-form">
            <span class="renew-label eyebrow">续费时长</span>
            <el-select v-model="renewForm.duration" style="width: 200px" :loading="renewForm.priceLoading">
              <el-option
                v-for="opt in durationOptions"
                :key="opt.value"
                :label="opt.label + (renewForm.prices && renewForm.prices[String(opt.value)] != null
                  ? ` · ¥${Number(renewForm.prices[String(opt.value)]).toFixed(2)}`
                  : '')"
                :value="opt.value"
              />
            </el-select>
            <el-button
              class="btn-gold"
              :loading="renewForm.loading"
              :disabled="!isBalanceEnough && currentRenewPrice != null"
              @click="onRenew"
            >
              <el-icon><Coin /></el-icon>
              立即续费
            </el-button>
            <el-button
              v-if="!isBalanceEnough && currentRenewPrice != null"
              class="btn-warning"
              @click="goToRecharge"
            >
              <el-icon><Wallet /></el-icon>
              立即去充值
            </el-button>
          </div>

          <!-- 价格汇总区 -->
          <div class="renew-summary" v-if="renewForm.priceLoading">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>正在获取续费价格...</span>
          </div>
          <div class="renew-summary" v-else-if="currentRenewPrice != null">
            <div class="summary-row">
              <span class="summary-label">续费价格</span>
              <span class="summary-value price">{{ formatMoney(currentRenewPrice) }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">账户余额</span>
              <span class="summary-value" :class="{ 'is-short': !isBalanceEnough }">{{ formatMoney(renewForm.balance) }}</span>
            </div>
            <div class="summary-row summary-total" v-if="!isBalanceEnough">
              <span class="summary-label">还需充值</span>
              <span class="summary-value shortage">{{ formatMoney(shortageAmount) }}</span>
            </div>
          </div>
          <div class="renew-tip" v-else>
            <el-icon><WarningFilled /></el-icon>
            <span>未能获取续费价格，可在点击"立即续费"后由系统尝试续费</span>
          </div>
        </div>
      </section>

      <!-- 关联工单 -->
      <section class="detail-card card">
        <div class="card-header card-header--action">
          <h2 class="card-title">关联工单</h2>
          <el-button link class="link-action" @click="goNewTicket">+ 提交工单</el-button>
        </div>
        <div class="card-body">
          <el-empty v-if="!relatedTickets.length" description="暂无关联工单" :image-size="80" />
          <div v-else class="table-wrap">
            <el-table :data="relatedTickets" size="small" class="dashed-table">
              <el-table-column label="工单号" min-width="140">
                <template #default="{ row }">
                  <span class="link-text" @click="goTicket(row)">{{ row.ticketNo || `#${row.id}` }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
              <el-table-column prop="status" label="状态" width="110" align="center">
                <template #default="{ row }">
                  <span class="status-text">{{ row.status }}</span>
                </template>
              </el-table-column>
              <el-table-column label="创建时间" width="180">
                <template #default="{ row }">
                  <span class="time-value">{{ formatTime(row.createdAt) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </section>
    </template>

    <!-- 重装系统弹窗（与购买页保持一致：OS 按发行版分组 + 预装软件 + 密码可选） -->
    <el-dialog
      v-model="reinstallDialog.visible"
      title="重装系统"
      width="820px"
      :close-on-click-modal="false"
      class="reinstall-dialog"
    >
      <div class="reinstall-body">
        <el-form label-position="top" class="reinstall-form">
          <!-- 操作系统：两层结构（发行版 tab + 版本下拉），与购买页一致 -->
          <el-form-item label="操作系统">
            <div class="os-picker">
              <div class="os-dist-tabs" v-if="groupedOsList.length">
                <div
                  v-for="g in groupedOsList"
                  :key="g.dist"
                  class="os-dist-tab"
                  :class="{ 'is-active': reinstallDialog.currentDist === g.dist }"
                  @click="selectOsDist(g.dist)"
                >
                  {{ g.dist }}
                  <span class="os-dist-count">{{ g.items.length }}</span>
                </div>
              </div>
              <el-select
                v-model="reinstallDialog.osId"
                :loading="osListLoading"
                placeholder="请选择系统版本"
                filterable
                style="width: 100%; margin-top: 12px"
              >
                <el-option
                  v-for="os in currentDistOsList"
                  :key="os.id"
                  :label="os.name + (os.is_eol ? '（已停止维护）' : '')"
                  :value="os.id"
                >
                  <span class="os-option">
                    <span class="os-name">{{ os.name }}</span>
                    <span v-if="os.is_eol" class="os-tag os-tag-eol">EOL</span>
                    <span v-else-if="os.is_with_bbr" class="os-tag os-tag-bbr">BBR</span>
                  </span>
                </el-option>
              </el-select>
              <div class="os-empty" v-if="!groupedOsList.length && !osListLoading">
                当前区域暂无可用操作系统
              </div>
            </div>
          </el-form-item>

          <!-- 预装软件（与购买页一致：按所选 OS 过滤 + 支持变量 + 2 列网格） -->
          <el-form-item label="预装软件（可选）">
            <div class="app-picker">
              <div v-if="!currentOs" class="app-empty">请先选择操作系统</div>
              <div v-else-if="!filteredAppTemplates.length" class="app-empty">
                当前所选操作系统暂无兼容的预装软件
              </div>
              <el-checkbox-group
                v-else
                v-model="reinstallDialog.selectedAppIds"
                class="app-checkbox-group"
              >
                <el-checkbox
                  v-for="app in filteredAppTemplates"
                  :key="app.app_id"
                  :label="app.app_id"
                  class="app-checkbox"
                >
                  <div class="app-info">
                    <div class="app-name">
                      {{ app.chinese_name || app.name }}
                      <span
                        class="app-name-en font-mono"
                        v-if="app.chinese_name && app.name !== app.chinese_name"
                      >{{ app.name }}</span>
                    </div>
                    <div v-if="app.desc" class="app-desc">{{ app.desc }}</div>
                    <div v-if="app.tags && app.tags.length" class="app-tags">
                      <span v-for="t in app.tags" :key="t" class="app-tag font-mono">{{ t }}</span>
                    </div>
                  </div>
                </el-checkbox>
              </el-checkbox-group>

              <!-- 已选应用的变量表单 -->
              <div
                v-for="app in selectedAppsWithVars"
                :key="`vars-${app.app_id}`"
                class="app-vars-block"
              >
                <div class="app-vars-title">{{ app.chinese_name || app.name }} 配置</div>
                <div
                  v-for="v in app.vars"
                  :key="`${app.app_id}-${v.name}`"
                  v-show="shouldShowVar(app, v)"
                  class="app-var-item"
                >
                  <label class="app-var-label">
                    {{ v.chinese || v.name }}
                    <span v-if="v.desc" class="app-var-desc">{{ v.desc }}</span>
                  </label>
                  <el-select
                    v-if="v.enum && v.enum.length"
                    v-model="reinstallDialog.appVars[`${app.app_id}:${v.name}`]"
                    :placeholder="`请选择${v.chinese || v.name}`"
                    size="small"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="opt in (v.enum as any[])"
                      :key="typeof opt === 'string' ? opt : opt.value"
                      :label="typeof opt === 'string' ? opt : opt.text"
                      :value="typeof opt === 'string' ? opt : opt.value"
                    />
                  </el-select>
                  <el-input
                    v-else
                    v-model="reinstallDialog.appVars[`${app.app_id}:${v.name}`]"
                    :placeholder="v.default || `请输入${v.chinese || v.name}`"
                    size="small"
                    style="width: 100%"
                  />
                </div>
              </div>
            </div>
          </el-form-item>

          <!-- 新密码：可选（不勾选则雨云自动随机生成） -->
          <el-form-item label="登录密码">
            <div class="password-picker">
              <el-radio-group v-model="reinstallDialog.useCustomPassword">
                <el-radio-button :value="false">随机生成（推荐）</el-radio-button>
                <el-radio-button :value="true">自定义密码</el-radio-button>
              </el-radio-group>
              <el-input
                v-if="reinstallDialog.useCustomPassword"
                v-model="reinstallDialog.password"
                type="password"
                show-password
                placeholder="请输入新登录密码（至少 8 位）"
                style="margin-top: 12px"
              />
              <div class="password-hint" v-else>
                不填则雨云自动生成随机密码，重装完成后可在官方面板查看
              </div>
            </div>
          </el-form-item>
        </el-form>

        <div class="reinstall-warn">
          <el-icon><WarningFilled /></el-icon>
          <span>重装系统将清除服务器上的所有数据，且无法恢复！请谨慎操作！</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="reinstallDialog.visible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="reinstallDialog.loading"
          @click="confirmReinstall"
        >
          确认重装
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.product-detail-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页头 ============
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.back-btn {
  color: var(--text-tertiary);
  padding: 0;
  font-size: 13px;

  &:hover {
    color: var(--text-gold);
  }
}

.head-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
  letter-spacing: -0.3px;
  word-break: break-all;
}

.head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

// ============ 状态卡 ============
.status-card {
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-text {
  font-size: 13px;
  font-weight: 500;

  &.is-large {
    font-size: 16px;
    font-weight: 600;
  }

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger { color: var(--danger); }
  &.is-info { color: var(--text-tertiary); }
}

.status-extra {
  display: flex;
  align-items: center;
  gap: 8px;
}

.extra-label {
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.extra-value {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;

  &.is-expired {
    color: var(--danger);
  }
}

// ============ 信息网格 ============
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

// ============ 详情卡 ============
.detail-card {
  overflow: visible;
  min-width: 0;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  :deep(.el-table) {
    min-width: 600px;
  }
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-base);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  &--action {
    .link-action {
      color: var(--text-gold);
      font-size: 13px;
      padding: 0;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-subtip {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.5px;
}

.sync-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--success);
  padding: 2px 8px;
  background: var(--success-bg, rgba(79, 122, 63, 0.1));
  border-radius: 10px;
}

.refresh-btn {
  color: var(--text-gold);
  font-size: 12px;
  padding: 0;
}

.card-body {
  padding: 20px;
}

.link-text {
  color: var(--text-gold);
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;

  &:hover {
    text-decoration: underline;
  }
}

.mono-value {
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}

.time-value {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
}

.sub-text {
  color: var(--text-tertiary);
  font-size: 12px;
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

:deep(.dashed-table) {
  --el-table-border-color: transparent;

  .el-table__body tr.el-table__row--striped td {
    background: transparent;
  }

  .el-table__cell {
    border-bottom: 1px dashed var(--border-base) !important;
  }

  th.el-table__cell {
    border-bottom: 1px solid var(--border-base) !important;
    background: transparent;
    .cell {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--text-tertiary);
    }
  }

  .el-table__body tr:hover > td {
    background: var(--bg-hover) !important;
  }
}

// ============ 资源使用 ============
.metrics-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.metric-label {
  display: block;
}

.metric-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.metric-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.02));
  border-radius: 8px;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-value-sm {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
}

.metric-update {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', monospace;
  padding-top: 4px;
  border-top: 1px dashed var(--border-base);
}

// ============ 操作面板 ============
.action-panel {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

// ============ 续费表单 ============
.renew-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.renew-form {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.renew-label {
  white-space: nowrap;
}

.renew-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--warning);
}

// 续费价格汇总区
.renew-summary {
  padding: 14px 16px;
  background: var(--bg-subtle);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 56px;

  // 加载中状态
  &:has(.is-loading) {
    flex-direction: row;
    align-items: center;
    color: var(--text-tertiary);
    font-size: 12px;
    .el-icon { font-size: 14px; }
  }
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;

  .summary-label {
    color: var(--text-secondary);
  }

  .summary-value {
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-primary);
    font-weight: 500;

    &.price {
      color: var(--gold-400);
      font-size: 16px;
      font-weight: 600;
    }

    &.is-short {
      color: var(--danger);
    }

    &.shortage {
      color: var(--danger);
      font-weight: 600;
    }
  }

  &.summary-total {
    padding-top: 8px;
    border-top: 1px dashed var(--border-base);
    margin-top: 4px;
  }
}

// 余额不足时的"立即去充值"按钮
.btn-warning {
  background: var(--warning, #f59e0b) !important;
  border-color: var(--warning, #f59e0b) !important;
  color: #fff !important;

  &:hover {
    opacity: 0.9;
  }
}

// ============ 重装系统弹窗 ============
// 弹窗本身加宽 + 内容 padding 调整
:deep(.reinstall-dialog) {
  .el-dialog__body {
    padding: 16px 24px 8px;
  }
  .el-dialog__footer {
    padding: 12px 24px 20px;
  }
}

.reinstall-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.reinstall-form {
  :deep(.el-form-item) {
    margin-bottom: 22px;
    &:last-child { margin-bottom: 0; }
  }
  :deep(.el-form-item__label) {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    padding-bottom: 8px;
    line-height: 1.4;
  }
}

.reinstall-warn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--danger-bg);
  border-radius: 8px;
  color: var(--danger);
  font-size: 13px;
  line-height: 1.5;
}

// OS 选择器（与购买页一致的两层结构）
.os-picker {
  width: 100%;
}

.os-dist-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.os-dist-tab {
  padding: 6px 14px;
  border: 1px solid var(--border-base);
  border-radius: 16px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 5px;

  &:hover {
    border-color: var(--text-gold);
    color: var(--text-gold);
  }

  &.is-active {
    background: var(--text-gold);
    color: #fff;
    border-color: var(--text-gold);
  }
}

.os-dist-count {
  font-size: 11px;
  opacity: 0.85;
  font-family: 'JetBrains Mono', monospace;
}

.os-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.os-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  .os-name {
    flex: 1;
    min-width: 0;
  }

  .os-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;

    &.os-tag-eol {
      background: rgba(230, 162, 60, 0.15);
      color: var(--warning, #e6a23c);
    }

    &.os-tag-bbr {
      background: rgba(79, 122, 63, 0.15);
      color: var(--success, #4f7a3f);
    }
  }
}

// 预装软件选择器
.app-picker {
  width: 100%;
}

.app-empty {
  padding: 14px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.02));
  border-radius: 8px;
}

// 桌面端 2 列网格；窄屏自动降为 1 列
.app-checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;

  @include tablet-down {
    grid-template-columns: 1fr;
  }
}

.app-checkbox {
  display: flex;
  align-items: flex-start;
  padding: 12px 14px;
  border: 1px solid var(--border-base);
  border-radius: 8px;
  margin-right: 0 !important;
  height: 100%;
  transition: all 0.2s;

  &:hover {
    border-color: var(--text-gold);
  }

  :deep(.el-checkbox__label) {
    flex: 1;
    min-width: 0;
    padding-left: 8px;
  }
}

.app-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.app-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.app-name-en {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.app-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.app-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.app-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  color: var(--text-secondary);
}

.app-vars-block {
  margin-top: 14px;
  padding: 14px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.02));
  border-radius: 8px;
  border: 1px solid var(--border-base);
}

.app-vars-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border-base);
}

.app-var-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
}

.app-var-label {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.app-var-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
}

// 密码选择器
.password-picker {
  width: 100%;
}

.password-hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 10px 14px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.02));
  border-radius: 6px;
  line-height: 1.5;
}

// ============ 响应式 ============
@include tablet-down {
  .product-detail-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .info-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .card-header {
    padding: 14px 16px;
  }
  .card-body {
    padding: 16px;
  }
  :deep(.dashed-desc) .el-descriptions__table {
    table-layout: fixed;
  }
}

// 手机端
@include mobile {
  .product-detail-page {
    gap: 12px;
  }
  .page-title {
    font-size: 19px;
  }
  .page-head {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .head-actions {
    flex-wrap: wrap;
    .el-button {
      flex: 1;
      min-width: 0;
    }
  }
  .status-card {
    padding: 14px 16px;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .card-header {
    padding: 12px 14px;
    flex-wrap: wrap;
  }
  .card-title {
    font-size: 15px;
  }
  .card-body {
    padding: 12px;
  }
  .info-grid {
    gap: 12px;
  }
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

  .metrics-body {
    gap: 14px;
  }

  .metric-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .action-panel {
    gap: 8px;
    .el-button {
      flex: 1 1 calc(50% - 8px);
      min-width: 0;
      margin-left: 0 !important;
    }
  }

  .renew-form {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    .el-select {
      width: 100% !important;
    }
    .el-button {
      width: 100%;
    }
  }

  .reinstall-warn {
    padding: 8px 12px;
    font-size: 11px;
  }

  .os-dist-tabs {
    gap: 4px;
  }

  .os-dist-tab {
    padding: 4px 10px;
    font-size: 11px;
  }
}
</style>
