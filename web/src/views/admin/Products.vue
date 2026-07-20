<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import { adminApi } from '@/api/admin';
import {
  MACHINE_LABELS,
  LINE_LABELS,
  CHARGE_TYPE_LABELS,
  DISK_TYPE_LABELS,
} from '@/api/product';

// 筛选
const filters = reactive({
  keyword: '',
  category: '',
  status: '',
  page: 1,
  pageSize: 20,
  // 排序：默认按 ID 倒序（最新同步的在前）
  sortBy: 'id',
  sortOrder: 'desc' as 'asc' | 'desc',
});

// 可排序字段列表
const sortOptions = [
  { label: '本地 ID', value: 'id' },
  { label: '官方 ID', value: 'upstreamPlanId' },
  { label: '商品名称', value: 'name' },
  { label: '区域', value: 'zone' },
  { label: '处理器', value: 'machine' },
  { label: '网络线路', value: 'line' },
  { label: '计费类型', value: 'chargeType' },
  { label: 'CPU 核数', value: 'cpu' },
  { label: '内存大小', value: 'memory' },
  { label: '磁盘大小', value: 'disk' },
  { label: '带宽大小', value: 'bandwidth' },
  { label: '优惠率', value: 'markupRate' },
  { label: '推荐权重', value: 'sortWeight' },
  { label: '上下架', value: 'isOnSale' },
  { label: '创建时间', value: 'createdAt' },
  { label: '更新时间', value: 'updatedAt' },
];

// 列表
const loading = ref(false);
const syncing = ref(false);
const list = ref<any[]>([]);
const total = ref(0);

// 格式化
const formatMoney = (v: any): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '¥0.00';
  return '¥' + Number(v).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// 解析 prices JSON
// 后端 formatProduct 已反序列化为对象：{ "1": "105.80", "3": "301.53", "6": "571.32", "12": "1015.68" }
const parsePrices = (prices: any): { cycle: string; price: number }[] => {
  if (!prices) return [];
  // 兼容字符串 JSON
  if (typeof prices === 'string') {
    try { return parsePrices(JSON.parse(prices)); } catch { return []; }
  }
  // 对象：{ "1": ..., "3": ..., "6": ..., "12": ... }
  if (typeof prices === 'object' && !Array.isArray(prices)) {
    const cycleLabels: Record<string, string> = { '1': '1月', '3': '3月', '6': '6月', '12': '12月' };
    return Object.entries(prices).map(([cycle, price]) => ({
      cycle: cycleLabels[cycle] || `${cycle}月`,
      price: Number(price ?? 0),
    }));
  }
  // 数组：[{cycle, price}]
  if (Array.isArray(prices)) {
    return prices.map((p: any) => ({
      cycle: p.cycle || p.name || p.period || '',
      price: Number(p.price ?? p.amount ?? 0),
    }));
  }
  return [];
};

// 解析规格：从分散字段组装（cpu/memory/disk/bandwidth/traffic）
const parseSpec = (row: any): string => {
  if (!row) return '-';
  // 兼容旧版 spec 字段
  if (row.spec) {
    if (typeof row.spec === 'string') {
      try { return parseSpec(JSON.parse(row.spec)); } catch { return row.spec; }
    }
    if (typeof row.spec === 'object') {
      const parts: string[] = [];
      if (row.spec.cpu) parts.push(`${row.spec.cpu}核`);
      if (row.spec.memory || row.spec.ram) parts.push(`${row.spec.memory || row.spec.ram}G`);
      if (row.spec.disk || row.spec.storage) parts.push(`${row.spec.disk || row.spec.storage}G`);
      if (row.spec.bandwidth) parts.push(`${row.spec.bandwidth}M`);
      return parts.join(' / ') || JSON.stringify(row.spec);
    }
  }
  // 新版：从分散字段组装
  const parts: string[] = [];
  if (row.cpu) parts.push(`${row.cpu}核`);
  if (row.memory) {
    const mem = Number(row.memory);
    parts.push(mem >= 1024 ? `${mem / 1024}G` : `${mem}M`);
  }
  if (row.disk) parts.push(`${row.disk}G`);
  if (row.bandwidth) parts.push(`${row.bandwidth}M`);
  return parts.join(' / ') || '-';
};

// 处理器型号（雨云 machine 字段：E5v2/EPYCv2/G6v1/P8v2 等）
const formatMachine = (m: any): string => {
  if (!m) return '-';
  return MACHINE_LABELS[m] || m;
};

// 网络线路（雨云 line 字段：single/opt/3c/bgp/global/sb/iij）
const formatLine = (l: any): string => {
  if (l === null || l === undefined || l === '') return '默认';
  return LINE_LABELS[l] || l;
};

// 计费类型（雨云 chargeType 字段：package=不限流量 / package_traffic=流量叠加）
const formatChargeType = (c: any): string => {
  if (!c) return '-';
  return CHARGE_TYPE_LABELS[c] || c;
};

// 在售系统盘类型列表（雨云 disk_selling 数组）
const formatDiskSelling = (ds: any): string => {
  if (!ds) return '-';
  let arr = ds;
  if (typeof ds === 'string') {
    try { arr = JSON.parse(ds); } catch { arr = []; }
  }
  if (!Array.isArray(arr) || !arr.length) return '-';
  return arr.map((t: string) => DISK_TYPE_LABELS[t] || t).join(' / ');
};

// 月流量
const formatTraffic = (t: any, chargeType?: string): string => {
  if (chargeType === 'package') return '不限';
  const n = Number(t ?? 0);
  if (!n) return chargeType === 'package_traffic' ? '叠加' : '不限';
  return `${n} GB`;
};

// 状态映射：isOnSale → online/offline
const getStatus = (row: any): string => {
  if (row.status) return row.status;
  if (row.isOnSale === true) return 'online';
  if (row.isOnSale === false) return 'offline';
  return 'online';
};

const statusTag = (s: string) => {
  const map: Record<string, string> = {
    online: 'success', offline: 'info', active: 'success',
    inactive: 'info', disabled: 'danger',
  };
  return map[s] || 'info';
};

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    online: '上架', offline: '下架', active: '上架',
    inactive: '下架', disabled: '禁用',
  };
  return map[s] || s;
};

// 优惠率显示：markupRate 是小数（-0.10 = 9折 / +0.10 = 加价10% / 0 = 原价）
const formatMarkup = (m: any): string => {
  if (m === null || m === undefined) return '原价';
  const num = Number(m);
  if (isNaN(num) || num === 0) return '原价';
  // 兼容整数与小数：> 1 视为百分比（10 = 10%），否则是小数（0.1 = 10%）
  const rate = num > 1 ? num : num * 100;
  if (rate < 0) {
    // 负数 = 优惠（折扣）
    const discount = Math.abs(rate);
    // 9折 / 95折 / 88折
    const off = 100 - discount;
    return `${(off / 10).toFixed(off % 10 === 0 ? 0 : 1)}折`;
  }
  // 正数 = 加价
  return `+${rate.toFixed(1)}%`;
};

// 优惠率标签类型
const markupTagType = (m: any): string => {
  const num = Number(m);
  if (isNaN(num) || num === 0) return 'info';
  return num < 0 ? 'success' : 'warning';
};

// 取官方原价（1月价格）
// upstreamPrices 是后端反序列化后的对象：{ "1": 105.80, "3": 301.53, ... }
const getUpstreamMonthlyPrice = (row: any): number => {
  if (!row) return 0;
  let up: any = row.upstreamPrices;
  if (typeof up === 'string') {
    try { up = JSON.parse(up); } catch { up = {}; }
  }
  if (up && typeof up === 'object') {
    return Number(up['1'] ?? 0);
  }
  return 0;
};

// 内存格式化：MB → GB（>=1024 时除以 1024）
const formatMemory = (m: any): string => {
  const n = Number(m);
  if (!n) return '';
  return n >= 1024 ? `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)}G` : `${n}M`;
};

// 组合商品展示名：地区 · 规格版本 · CPU核数 + 内存
// 例如：中国香港 · KVM 高配版 · 4核8G
const getDisplayName = (row: any): string => {
  if (!row) return '-';
  const parts: string[] = [];
  if (row.zone) parts.push(row.zone);
  else if (row.zoneName) parts.push(row.zoneName);
  if (row.zoneName && row.zone && row.zone !== row.zoneName) parts.push(row.zoneName);
  if (row.cpu) parts.push(`${row.cpu}核${formatMemory(row.memory)}`);
  return parts.filter(Boolean).join(' · ') || row.name || '-';
};

// 取官方原价（按周期）
const getUpstreamPrice = (row: any, cycle: string): number => {
  if (!row) return 0;
  let up: any = row.upstreamPrices;
  if (typeof up === 'string') {
    try { up = JSON.parse(up); } catch { up = {}; }
  }
  return Number(up?.[cycle] ?? 0);
};

// 取本站售价（按周期）
const getSellPrice = (row: any, cycle: string): number => {
  if (!row) return 0;
  let pr: any = row.prices;
  if (typeof pr === 'string') {
    try { pr = JSON.parse(pr); } catch { pr = {}; }
  }
  return Number(pr?.[cycle] ?? 0);
};

// 节省金额（1月）
const getSavedAmount = (row: any): number => {
  const up = getUpstreamMonthlyPrice(row);
  const sell = getSellPrice(row, '1');
  if (!up || !sell) return 0;
  return Math.max(0, up - sell);
};

// ===== IP 选项相关 =====
// IP 类型中文名映射
const IP_TYPE_LABELS: Record<string, string> = {
  '': '默认 IPv4',
  'ipv6': 'IPv6',
  'home_ip': '家宽 IP',
  'hk_ddosip': '香港高防 IP',
  'us_ddosip': '美国高防 IP',
  'jp_ddosip': '日本高防 IP',
  'sy_bgpip': '邵阳 BGP IP',
  'sx_bgpip': '陕西 BGP IP',
  'wz_cmip': '温州移动 IP',
  'sz_txip': '深圳腾讯云 IP',
  'gz_aliyunip': '广州阿里云 IP',
  'gz_txip': '广州腾讯云 IP',
  'nb_bgpip': '宁波 BGP IP',
  'nb_cmip': '宁波移动 IP',
  'nb_cuip': '宁波联通 IP',
  'nb_cntcpip': '宁波电联双线 IP',
  'nb_ddosip': '宁波高防 IP',
  'nb_ddosip200': '宁波高防 200G IP',
  'nb_ddosip300': '宁波高防 300G IP',
  'nb_ddosip400': '宁波高防 400G IP',
  'nb_cmddosip': '宁波移动高防 IP',
};

// 获取 IP 类型中文名
const getIpTypeLabel = (ipType: string): string => {
  return IP_TYPE_LABELS[ipType] ?? (ipType || '默认 IPv4');
};

// 获取在售 IP 选项列表（已按价格升序）
const getIpOptions = (row: any): { type: string; label: string; price: number }[] => {
  if (!row) return [];
  let selling: any = row.upstreamIpSelling;
  let prices: any = row.ipPrices;
  if (typeof selling === 'string') { try { selling = JSON.parse(selling); } catch { selling = []; } }
  if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = {}; } }
  if (!Array.isArray(selling) || !selling.length) return [];
  return selling
    .map((t: string) => ({
      type: t,
      label: getIpTypeLabel(t),
      price: Number(prices?.[t] ?? 0),
    }))
    .sort((a: any, b: any) => a.price - b.price);
};

// 默认 IP（空串）的售价
const getDefaultIpPrice = (row: any): number => {
  let prices: any = row.ipPrices;
  if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = {}; } }
  return Number(prices?.[''] ?? 0);
};

// 起售价 = 机器月价 + 最便宜的 IP 月价（默认 IPv4）
const getStartingPrice = (row: any): number => {
  const machine = getSellPrice(row, '1');
  const ip = getDefaultIpPrice(row);
  return machine + ip;
};

// IP 选项数量（展示用）
const getIpOptionsCount = (row: any): number => {
  let selling: any = row.upstreamIpSelling;
  if (typeof selling === 'string') { try { selling = JSON.parse(selling); } catch { selling = []; } }
  return Array.isArray(selling) ? selling.length : 0;
};

// ===== 多视图表格辅助函数 =====
// 周期折扣映射（实测雨云上游）：1月=1.0, 3月=0.9, 6月=0.8, 12月=0.7
const DURATION_DISCOUNT: Record<string, number> = {
  '1': 1.0,
  '3': 0.9,
  '6': 0.8,
  '12': 0.7,
};

// 取上游 IP 月价（按 IP 类型）
const getUpstreamIpPrice = (row: any, ipType: string = ''): number => {
  if (!row) return 0;
  let prices: any = row.upstreamIpPrices;
  if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = {}; } }
  return Number(prices?.[ipType] ?? 0);
};

// 取本站 IP 月价（已优惠率，按 IP 类型）
const getSellIpPrice = (row: any, ipType: string = ''): number => {
  if (!row) return 0;
  let prices: any = row.ipPrices;
  if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = {}; } }
  return Number(prices?.[ipType] ?? 0);
};

// 计算总价（机器 + IP×数量）× 周期折扣
// mode: 'upstream' 用上游价 / 'sell' 用本站售价
const calcTotal = (
  row: any,
  duration: string,
  ipType: string = '',
  ipCount: number = 1,
  mode: 'upstream' | 'sell' = 'sell',
): number => {
  if (!row) return 0;
  const priceField = mode === 'upstream' ? 'upstreamPrices' : 'prices';
  const ipField = mode === 'upstream' ? 'upstreamIpPrices' : 'ipPrices';

  let prices: any = (row as any)[priceField];
  if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = {}; } }
  // 月价（已含周期折扣存为 prices[duration]，所以直接取）
  const machineTotal = Number(prices?.[duration] ?? 0);

  let ipPrices: any = (row as any)[ipField];
  if (typeof ipPrices === 'string') { try { ipPrices = JSON.parse(ipPrices); } catch { ipPrices = {}; } }
  const ipMonthly = Number(ipPrices?.[ipType] ?? 0);
  // IP 是月价，需手动乘 周期 × 折扣 × 数量
  const discount = DURATION_DISCOUNT[duration] ?? 1.0;
  const durationNum = Number(duration) || 1;
  const ipTotal = ipMonthly * Math.max(1, ipCount) * durationNum * discount;

  return Math.round((machineTotal + ipTotal) * 100) / 100;
};

// 取最便宜的在售 IP（通常是 IPv6 免费 或 默认 IPv4）
const getCheapestIp = (row: any): { type: string; label: string; price: number } | null => {
  const opts = getIpOptions(row);
  return opts.length ? opts[0] : null;
};

// 取最贵的在售 IP
const getMostExpensiveIp = (row: any): { type: string; label: string; price: number } | null => {
  const opts = getIpOptions(row);
  return opts.length ? opts[opts.length - 1] : null;
};

// 当前激活的视图 Tab
type ViewTab = 'overview' | 'upstream' | 'sell' | 'total' | 'ip';
const activeTab = ref<ViewTab>('overview');

const tabs = [
  { value: 'overview' as ViewTab, label: '综合视图', desc: '精简概览' },
  { value: 'upstream' as ViewTab, label: '商品原价', desc: '上游官方价' },
  { value: 'sell' as ViewTab, label: '优惠后售价', desc: '本站售价' },
  { value: 'total' as ViewTab, label: '总价对比', desc: '机器+IP（前后对比）' },
  { value: 'ip' as ViewTab, label: 'IP 选项明细', desc: '所有可选 IP' },
];

// 周期列定义
const cycleColumns = [
  { value: '1', label: '1 月' },
  { value: '3', label: '3 月' },
  { value: '6', label: '6 月' },
  { value: '12', label: '12 月' },
];

// IP 选项明细：展开行的数据
const getIpDetailRows = (row: any): { type: string; label: string; upstream: number; sell: number; isFree: boolean; isDefault: boolean }[] => {
  const opts = getIpOptions(row);
  return opts.map((o) => ({
    type: o.type,
    label: o.label,
    upstream: getUpstreamIpPrice(row, o.type),
    sell: o.price,
    isFree: o.price === 0,
    isDefault: o.type === '',
  }));
};

// 预览优惠后价格（编辑弹窗中实时预览）：返回所有周期映射
const previewPriceMap = (markupRate: number, upstreamPricesJson: string): { cycle: string; original: number; sell: number }[] => {
  try {
    const up: any = typeof upstreamPricesJson === 'string'
      ? JSON.parse(upstreamPricesJson || '{}')
      : (upstreamPricesJson || {});
    if (!up || typeof up !== 'object') return [];
    const cycleLabels: Record<string, string> = { '1': '1月', '3': '3月', '6': '6月', '12': '12月' };
    const rate = Number(markupRate) || 0;
    return Object.entries(up).map(([k, v]) => ({
      cycle: cycleLabels[k] || `${k}月`,
      original: Number(v) || 0,
      sell: Number(Number(v) * (1 + rate)).toFixed(2) as unknown as number,
    }));
  } catch {
    return [];
  }
};

// 加载列表
const loadList = async () => {
  loading.value = true;
  try {
    const res: any = await adminApi.products({
      keyword: filters.keyword || undefined,
      category: filters.category || undefined,
      status: filters.status || undefined,
      page: filters.page,
      pageSize: filters.pageSize,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
    if (res?.success) {
      const d = res.data;
      list.value = d?.list ?? d?.items ?? d?.records ?? [];
      total.value = d?.total ?? list.value.length;
    }
  } catch {} finally {
    loading.value = false;
  }
};

const onSearch = () => { filters.page = 1; loadList(); };
const onReset = () => {
  filters.keyword = ''; filters.category = ''; filters.status = '';
  filters.sortBy = 'id'; filters.sortOrder = 'desc';
  filters.page = 1; loadList();
};
const onPageChange = (p: number) => { filters.page = p; loadList(); };
const onSizeChange = (s: number) => { filters.pageSize = s; filters.page = 1; loadList(); };

// 切换排序字段
const onSortFieldChange = () => {
  filters.page = 1;
  loadList();
};
// 切换升降序
const toggleSortOrder = () => {
  filters.sortOrder = filters.sortOrder === 'desc' ? 'asc' : 'desc';
  filters.page = 1;
  loadList();
};
// 表头点击排序
const onSortChange = ({ prop, order }: { prop: any; order: any }) => {
  if (!prop || !order) {
    // 取消排序 → 恢复默认
    filters.sortBy = 'id';
    filters.sortOrder = 'desc';
  } else {
    filters.sortBy = String(prop);
    filters.sortOrder = order === 'ascending' ? 'asc' : 'desc';
  }
  filters.page = 1;
  loadList();
};

// 同步雨云商品
const onSync = async () => {
  ElMessageBox.confirm(
    '系统将从雨云上游拉取最新套餐数据并同步到本地商品库，过程通常需要数秒。已有套餐会按上游价格自动更新售价（按当前优惠率重算）。',
    '同步雨云商品',
    {
      type: 'info',
      confirmButtonText: '开始同步',
      cancelButtonText: '取消',
      customClass: 'keke-confirm-box',
      confirmButtonClass: 'el-button--primary',
      cancelButtonClass: 'btn-outline',
    },
  )
    .then(async () => {
      syncing.value = true;
      try {
        const res: any = await adminApi.syncProducts();
        if (res?.success) {
          const d = res.data || {};
          const total = d.total ?? 0;
          const created = d.created ?? 0;
          const updated = d.updated ?? 0;
          const unchanged = d.unchanged ?? 0;
          // 详细结果弹窗
          ElMessageBox.alert(
            `<div class="sync-result">
              <div class="sync-row">
                <span class="sync-label">上游套餐总数</span>
                <span class="sync-value mono">${total}</span>
              </div>
              <div class="sync-row">
                <span class="sync-label">新建商品</span>
                <span class="sync-value mono text-success">+${created}</span>
              </div>
              <div class="sync-row">
                <span class="sync-label">更新商品</span>
                <span class="sync-value mono text-warning">~${updated}</span>
              </div>
              <div class="sync-row">
                <span class="sync-label">未变化</span>
                <span class="sync-value mono text-tertiary">${unchanged}</span>
              </div>
            </div>`,
            '同步完成',
            {
              type: 'success',
              dangerouslyUseHTMLString: true,
              confirmButtonText: '好的',
              customClass: 'keke-confirm-box',
              confirmButtonClass: 'el-button--primary',
            },
          );
          loadList();
        }
      } catch {} finally {
        syncing.value = false;
      }
    })
    .catch(() => {});
};

// 编辑弹窗
const editDialog = reactive({
  visible: false,
  loading: false,
  isEdit: false,
  form: {
    id: 0,
    name: '',
    category: '',
    description: '',
    markupRate: -0.10,
    status: 'online',
    sort: 0,
    upstreamPlanId: '',
    upstreamPricesJson: '{}', // 不可编辑，仅用于价格预览
    isRecommended: false,
    perUserLimit: 0,
    group: '',
    defaultIpType: '',
    ipOptions: [] as { type: string; label: string; upstreamPrice: number; sellPrice: number }[],
  },
});
const editFormRef = ref<FormInstance>();

// 把 row 的 IP 选项转为编辑弹窗用的格式
const buildIpOptions = (row: any, markupRate: number) => {
  let selling: any = row.upstreamIpSelling;
  let upPrices: any = row.upstreamIpPrices;
  if (typeof selling === 'string') { try { selling = JSON.parse(selling); } catch { selling = []; } }
  if (typeof upPrices === 'string') { try { upPrices = JSON.parse(upPrices); } catch { upPrices = {}; } }
  if (!Array.isArray(selling)) return [];
  const rate = Number(markupRate) || 0;
  return selling
    .map((t: string) => {
      const up = Number(upPrices?.[t] ?? 0);
      const sell = up === 0 ? 0 : Math.round(up * (1 + rate) * 100) / 100;
      return {
        type: t,
        label: getIpTypeLabel(t),
        upstreamPrice: up,
        sellPrice: sell,
      };
    })
    .sort((a: any, b: any) => a.sellPrice - b.sellPrice);
};

const openCreate = () => {
  editDialog.isEdit = false;
  editDialog.form = {
    id: 0,
    name: '',
    category: 'RCS',
    description: '',
    markupRate: -0.10,
    status: 'online',
    sort: 0,
    upstreamPlanId: '',
    upstreamPricesJson: '{}',
    isRecommended: false,
    perUserLimit: 0,
    group: '',
    defaultIpType: '',
    ipOptions: [],
  };
  editDialog.visible = true;
};

const openEdit = (row: any) => {
  editDialog.isEdit = true;
  // 把 upstreamPrices 对象序列化为 JSON 字符串（供弹窗预览用）
  const upJson = typeof row.upstreamPrices === 'object'
    ? JSON.stringify(row.upstreamPrices)
    : (row.upstreamPrices || '{}');
  const markupRate = row.markupRate ?? row.markup ?? -0.10;
  editDialog.form = {
    id: row.id,
    // 名称默认使用 地区+配置 组合（与官方一致时也清晰可读）
    name: row.name || '',
    category: row.category || 'RCS',
    description: row.description || '',
    markupRate,
    status: getStatus(row),
    sort: row.sortWeight ?? row.sort ?? 0,
    upstreamPlanId: String(row.upstreamPlanId ?? row.upstreamProductId ?? row.upstreamId ?? ''),
    upstreamPricesJson: upJson,
    isRecommended: !!row.isRecommended,
    perUserLimit: Number(row.perUserLimit ?? 0),
    group: row.group || '',
    defaultIpType: row.defaultIpType ?? '',
    ipOptions: buildIpOptions(row, markupRate),
  };
  editDialog.visible = true;
};

// 优惠率变化时同步刷新 IP 选项的售价预览
const onMarkupRateChange = () => {
  const rate = Number(editDialog.form.markupRate) || 0;
  editDialog.form.ipOptions = editDialog.form.ipOptions.map((ip) => ({
    ...ip,
    sellPrice: ip.upstreamPrice === 0 ? 0 : Math.round(ip.upstreamPrice * (1 + rate) * 100) / 100,
  }));
};

// 用 getDisplayName 自动填充名称
const autoFillName = () => {
  // 找到当前编辑的商品（用 upstreamPlanId 在 list 中查）
  const row = editDialog.form.id
    ? list.value.find((r: any) => r.id === editDialog.form.id)
    : null;
  if (row) {
    editDialog.form.name = getDisplayName(row);
  }
};

const submitEdit = async () => {
  if (!editDialog.form.name.trim()) {
    ElMessage.warning('请输入商品名称');
    return;
  }

  // 后端 UpdateProductDto 仅接受这些字段
  const payload: any = {
    name: editDialog.form.name.trim(),
    description: editDialog.form.description || null,
    isOnSale: editDialog.form.status === 'online',
    markupRate: Number(editDialog.form.markupRate),
    sortWeight: Number(editDialog.form.sort),
    isRecommended: !!editDialog.form.isRecommended,
  };
  if (editDialog.form.perUserLimit > 0) payload.perUserLimit = Number(editDialog.form.perUserLimit);
  if (editDialog.form.group) payload.group = editDialog.form.group;

  editDialog.loading = true;
  try {
    const res: any = editDialog.isEdit
      ? await adminApi.updateProduct(editDialog.form.id, payload)
      : await adminApi.createProduct(payload);
    if (res?.success) {
      ElMessage.success(editDialog.isEdit ? '更新成功' : '创建成功');
      editDialog.visible = false;
      loadList();
    }
  } catch {} finally {
    editDialog.loading = false;
  }
};

// 上下架
const onToggleStatus = (row: any) => {
  const currentStatus = getStatus(row);
  const next = currentStatus === 'online' ? 'offline' : 'online';
  ElMessageBox.confirm(
    `确认要${next === 'online' ? '上架' : '下架'}商品「${row.name}」吗？`,
    '切换上下架',
    { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning' },
  )
    .then(async () => {
      try {
        // 用 isOnSale 字段调用后端
        const res: any = await adminApi.updateProduct(row.id, { isOnSale: next === 'online' });
        if (res?.success) {
          ElMessage.success('操作成功');
          loadList();
        }
      } catch {}
    })
    .catch(() => {});
};

// 删除
const onDelete = (row: any) => {
  ElMessageBox.confirm(
    `确认要删除商品「${row.name}」吗？此操作不可恢复。`,
    '删除商品',
    { customClass: 'keke-confirm-box', confirmButtonClass: 'el-button--primary',  type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
  )
    .then(async () => {
      try {
        const res: any = await adminApi.deleteProduct(row.id);
        if (res?.success) {
          ElMessage.success('删除成功');
          loadList();
        }
      } catch {}
    })
    .catch(() => {});
};

// 删除所有商品（含二次确认 + 强制输入 "DELETE" 才能执行）
// mode: 'soft' = 全部下架（数据保留）/ 'hard' = 物理删除（不可恢复）
const deletingAll = ref(false);
const onDeleteAll = () => {
  ElMessageBox.confirm(
    `<div class="delete-all-box">
      <p class="da-warning">此操作将影响 <b>${total.value}</b> 个商品，请谨慎操作。</p>
      <div class="da-options">
        <label><input type="radio" name="da-mode" value="soft" checked /> 软删除：仅下架所有商品（数据保留，可重新上架）</label>
        <label><input type="radio" name="da-mode" value="hard" /> 物理删除：从数据库永久删除所有商品记录（<b>不可恢复</b>，含关联订单）</label>
      </div>
      <p class="da-confirm">如确认继续，请在下方输入框输入 <code>DELETE</code>：</p>
      <input class="da-input" id="da-confirm-input" placeholder="DELETE" />
    </div>`,
    '删除所有商品',
    {
      type: 'error',
      dangerouslyUseHTMLString: true,
      confirmButtonText: '执行删除',
      cancelButtonText: '取消',
      customClass: 'keke-confirm-box',
      confirmButtonClass: 'el-button--danger',
      beforeClose: (action, instance, done) => {
        if (action !== 'confirm') return done();
        const inputEl = document.querySelector('#da-confirm-input') as HTMLInputElement | null;
        const val = (inputEl?.value || '').trim();
        if (val !== 'DELETE') {
          ElMessage.warning('请输入 DELETE 以确认删除');
          return;
        }
        done();
      },
    },
  )
    .then(async () => {
      const checked = document.querySelector('input[name="da-mode"]:checked') as HTMLInputElement | null;
      const mode: 'soft' | 'hard' = (checked?.value as any) === 'hard' ? 'hard' : 'soft';
      deletingAll.value = true;
      try {
        const res: any = await adminApi.deleteAllProducts(mode);
        if (res?.success) {
          const d = res.data || {};
          ElMessage.success(res.message || `已${mode === 'hard' ? '物理删除' : '下架'} ${d.deleted ?? 0} 个商品`);
          loadList();
        }
      } catch {} finally {
        deletingAll.value = false;
      }
    })
    .catch(() => {});
};

onMounted(() => loadList());
</script>

<template>
  <div class="admin-products">
    <!-- 页面头 -->
    <div class="page-header">
      <div class="header-left">
        <span class="eyebrow">PRODUCT MANAGEMENT</span>
        <h2 class="page-title font-display">商品管理</h2>
      </div>
      <div class="header-actions">
        <el-button class="row-btn" :loading="syncing" @click="onSync">
          <el-icon style="margin-right: 6px;"><RefreshRight /></el-icon>
          同步雨云
        </el-button>
        <el-button class="row-btn" @click="openCreate">
          <el-icon style="margin-right: 6px;"><Plus /></el-icon>
          新建商品
        </el-button>
        <el-button
          class="row-btn btn-danger-outline"
          :loading="deletingAll"
          :disabled="!total"
          @click="onDeleteAll"
        >
          <el-icon style="margin-right: 6px;"><Delete /></el-icon>
          删除所有
        </el-button>
      </div>
    </div>

    <!-- 筛选卡 -->
    <div class="card filter-card">
      <div class="filter-bar">
        <el-form :inline="true" :model="filters" @submit.prevent>
          <el-form-item label="关键字">
            <el-input
              v-model="filters.keyword"
              placeholder="商品名称"
              clearable
              style="width: 200px"
              @keyup.enter="onSearch"
              @clear="onSearch"
            />
          </el-form-item>
          <el-form-item label="分类">
            <el-input v-model="filters.category" placeholder="分类" clearable style="width: 140px" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="filters.status" placeholder="全部" clearable style="width: 120px" @change="onSearch">
              <el-option label="上架" value="online" />
              <el-option label="下架" value="offline" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序">
            <div class="sort-row">
              <el-select
                v-model="filters.sortBy"
                placeholder="排序字段"
                style="width: 140px"
                @change="onSortFieldChange"
              >
                <el-option
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <el-tooltip
                :content="filters.sortOrder === 'desc' ? '当前：降序（点击切换升序）' : '当前：升序（点击切换降序）'"
                placement="top"
              >
                <el-button class="sort-order-btn" @click="toggleSortOrder">
                  <el-icon><Sort /></el-icon>
                  <span class="sort-order-text">{{ filters.sortOrder === 'desc' ? '降序' : '升序' }}</span>
                </el-button>
              </el-tooltip>
            </div>
          </el-form-item>
          <el-form-item>
            <el-button class="row-btn" @click="onSearch">
              <el-icon style="margin-right: 4px;"><Search /></el-icon>
              搜索
            </el-button>
            <el-button class="row-btn" @click="onReset">
              <el-icon style="margin-right: 4px;"><RefreshLeft /></el-icon>
              重置
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 列表卡 -->
    <div class="card table-card">
      <!-- 视图切换 Tab -->
      <div class="view-tabs">
        <button
          v-for="t in tabs"
          :key="t.value"
          type="button"
          class="view-tab"
          :class="{ active: activeTab === t.value }"
          @click="activeTab = t.value"
        >
          <span class="view-tab-label">{{ t.label }}</span>
          <span class="view-tab-desc">{{ t.desc }}</span>
        </button>
      </div>

      <div class="table-wrap">
        <!-- ===== Tab 1: 综合视图（紧凑布局，无需横向滚动） ===== -->
        <el-table v-show="activeTab === 'overview'" v-loading="loading" :data="list" @sort-change="onSortChange">
          <el-table-column prop="upstreamPlanId" label="官方ID" width="80" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="{ row }">
              <span class="mono official-id">#{{ row.upstreamPlanId ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="商品 / 规格" min-width="240" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="{ row }">
              <div class="product-info">
                <div class="info-top">
                  <span class="product-name">{{ row.name }}</span>
                </div>
                <div class="info-bottom">
                  <span class="info-tag region" :title="`区域代码 ${row.zone}`">{{ row.zoneName || row.zone || '-' }}</span>
                  <span class="info-tag spec" :title="'CPU/内存/磁盘/带宽'">{{ parseSpec(row) }}</span>
                  <span class="info-tag" :title="`流量：${formatTraffic(row.traffic, row.chargeType)} · 线路：${formatLine(row.line)} · 处理器：${formatMachine(row.machine)}`">
                    {{ formatLine(row.line) }} · {{ formatMachine(row.machine) }}
                  </span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="1月价格（含 IP）" min-width="200">
            <template #default="{ row }">
              <div class="price-compare-compact">
                <div class="price-line-original">
                  <span class="strike">{{ formatMoney(getUpstreamPrice(row, '1') + getUpstreamIpPrice(row, '')) }}</span>
                  <span class="discount-badge mini" :class="`is-${markupTagType(row.markupRate ?? row.markup)}`">
                    {{ formatMarkup(row.markupRate ?? row.markup) }}
                  </span>
                </div>
                <div class="price-line-sell">
                  <span class="price-sell-main">{{ formatMoney(getStartingPrice(row)) }}</span>
                  <span class="price-sell-unit">/月起</span>
                </div>
                <div class="price-line-sub" v-if="getIpOptionsCount(row) > 1">
                  共 {{ getIpOptionsCount(row) }} 种 IP 可选
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="netMode" label="网络" width="90" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="{ row }">
              <span class="net-badge" :class="{ 'is-nat': row.netMode === 'nat' }">
                {{ row.netMode === 'nat' ? 'NAT' : '独立' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="availableStock" label="库存" width="80" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="{ row }">
              <span class="stock-text" :class="{ 'is-low': row.availableStock > 0 && row.availableStock <= 10 }">
                {{ row.availableStock > 0 ? `${row.availableStock}` : '充足' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="isOnSale" label="状态" width="80" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="{ row }">
              <span class="status-text" :class="`is-${statusTag(getStatus(row))}`">
                {{ statusLabel(getStatus(row)) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button class="row-btn" size="default" @click="openEdit(row)">
                <el-icon style="margin-right: 4px;"><Edit /></el-icon>
                编辑
              </el-button>
              <el-button class="row-btn row-btn-warn" size="default" @click="onToggleStatus(row)">
                {{ getStatus(row) === 'online' ? '下架' : '上架' }}
              </el-button>
              <el-button class="row-btn row-btn-danger" size="default" @click="onDelete(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无商品" /></template>
        </el-table>

        <!-- ===== Tab 2: 商品原价（上游官方价） ===== -->
        <el-table v-show="activeTab === 'upstream'" v-loading="loading" :data="list">
          <el-table-column prop="upstreamPlanId" label="官方ID" width="80" align="center">
            <template #default="{ row }">
              <span class="mono official-id">#{{ row.upstreamPlanId ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="商品信息" min-width="200">
            <template #default="{ row }">
              <div class="product-info">
                <span class="product-name">{{ row.name }}</span>
                <div class="info-bottom">
                  <span class="info-tag region">{{ row.zone || row.zoneName || '-' }}</span>
                  <span class="info-tag spec">{{ parseSpec(row) }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            v-for="c in cycleColumns"
            :key="`up-machine-${c.value}`"
            :label="`机器 ${c.label}`"
            min-width="95"
            align="right"
          >
            <template #default="{ row }">
              <span class="mono price-upstream">{{ formatMoney(getUpstreamPrice(row, c.value)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="默认 IPv4" min-width="110" align="right">
            <template #default="{ row }">
              <div class="ip-price-cell">
                <span class="mono price-upstream">{{ formatMoney(getUpstreamIpPrice(row, '')) }}<span class="price-unit">/月</span></span>
                <span class="mono ip-price-sell-sub" v-if="getDefaultIpPrice(row) > 0 && getDefaultIpPrice(row) !== getUpstreamIpPrice(row, '')">
                  → {{ formatMoney(getDefaultIpPrice(row)) }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="IP 种类" width="70" align="center">
            <template #default="{ row }">
              <span class="ip-count-badge">{{ getIpOptionsCount(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button class="row-btn" size="default" @click="openEdit(row)">
                <el-icon style="margin-right: 4px;"><Edit /></el-icon>编辑
              </el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无商品" /></template>
        </el-table>

        <!-- ===== Tab 3: 优惠后售价（本站价） ===== -->
        <el-table v-show="activeTab === 'sell'" v-loading="loading" :data="list">
          <el-table-column prop="upstreamPlanId" label="官方ID" width="80" align="center">
            <template #default="{ row }">
              <span class="mono official-id">#{{ row.upstreamPlanId ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="商品信息" min-width="200">
            <template #default="{ row }">
              <div class="product-info">
                <span class="product-name">{{ row.name }}</span>
                <div class="info-bottom">
                  <span class="info-tag region">{{ row.zone || row.zoneName || '-' }}</span>
                  <span class="info-tag spec">{{ parseSpec(row) }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            v-for="c in cycleColumns"
            :key="`sell-machine-${c.value}`"
            :label="`机器 ${c.label}`"
            min-width="95"
            align="right"
          >
            <template #default="{ row }">
              <span class="mono price-sell">{{ formatMoney(getSellPrice(row, c.value)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="默认 IPv4" min-width="110" align="right">
            <template #default="{ row }">
              <div class="ip-price-cell">
                <span class="mono ip-price-strike" v-if="getUpstreamIpPrice(row, '') > 0 && getUpstreamIpPrice(row, '') !== getDefaultIpPrice(row)">
                  {{ formatMoney(getUpstreamIpPrice(row, '')) }}
                </span>
                <span class="mono price-sell">{{ formatMoney(getDefaultIpPrice(row)) }}<span class="price-unit">/月</span></span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="markupRate" label="优惠率" width="90" align="center">
            <template #default="{ row }">
              <span class="discount-badge" :class="`is-${markupTagType(row.markupRate ?? row.markup)}`">
                {{ formatMarkup(row.markupRate ?? row.markup) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button class="row-btn" size="default" @click="openEdit(row)">
                <el-icon style="margin-right: 4px;"><Edit /></el-icon>编辑
              </el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无商品" /></template>
        </el-table>

        <!-- ===== Tab 4: 总价对比（机器 + 默认IPv4 × 1，优惠前后） ===== -->
        <el-table v-show="activeTab === 'total'" v-loading="loading" :data="list">
          <el-table-column prop="upstreamPlanId" label="官方ID" width="80" align="center">
            <template #default="{ row }">
              <span class="mono official-id">#{{ row.upstreamPlanId ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="商品信息" min-width="180">
            <template #default="{ row }">
              <div class="product-info">
                <span class="product-name">{{ row.name }}</span>
                <div class="info-bottom">
                  <span class="info-tag region">{{ row.zone || row.zoneName || '-' }}</span>
                  <span class="info-tag spec">{{ parseSpec(row) }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            v-for="c in cycleColumns"
            :key="`total-${c.value}`"
            :label="`${c.label} 总价`"
            min-width="140"
            align="center"
          >
            <template #default="{ row }">
              <div class="total-compare">
                <div class="total-original mono">
                  {{ formatMoney(calcTotal(row, c.value, '', 1, 'upstream')) }}
                </div>
                <el-icon class="arrow"><ArrowRight /></el-icon>
                <div class="total-sell mono">
                  {{ formatMoney(calcTotal(row, c.value, '', 1, 'sell')) }}
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button class="row-btn" size="default" @click="openEdit(row)">
                <el-icon style="margin-right: 4px;"><Edit /></el-icon>编辑
              </el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无商品" /></template>
        </el-table>

        <!-- ===== Tab 5: IP 选项明细（展开行） ===== -->
        <el-table v-show="activeTab === 'ip'" v-loading="loading" :data="list" row-key="id">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="ip-detail-wrap">
                <table v-if="getIpDetailRows(row).length" class="ip-detail-table">
                  <thead>
                    <tr>
                      <th style="width: 40px"></th>
                      <th>IP 类型</th>
                      <th style="text-align: right">上游月价</th>
                      <th style="text-align: right">本站月价</th>
                      <th style="text-align: center">1月总价</th>
                      <th style="text-align: center">12月总价</th>
                      <th style="text-align: center">标签</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="ip in getIpDetailRows(row)" :key="ip.type || 'default'">
                      <td></td>
                      <td>
                        <span class="ip-detail-label">{{ ip.label }}</span>
                        <span class="ip-detail-type mono" v-if="ip.type">({{ ip.type }})</span>
                      </td>
                      <td style="text-align: right" class="mono">{{ formatMoney(ip.upstream) }}</td>
                      <td style="text-align: right" class="mono" :class="{ 'text-free': ip.isFree }">
                        {{ ip.isFree ? '免费' : formatMoney(ip.sell) }}
                      </td>
                      <td style="text-align: center" class="mono">
                        {{ formatMoney(calcTotal(row, '1', ip.type, 1, 'sell')) }}
                      </td>
                      <td style="text-align: center" class="mono">
                        {{ formatMoney(calcTotal(row, '12', ip.type, 1, 'sell')) }}
                      </td>
                      <td style="text-align: center">
                        <span v-if="ip.isDefault" class="ip-tag ip-tag-default">默认</span>
                        <span v-if="ip.isFree" class="ip-tag ip-tag-free">免费</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <el-empty v-else description="该商品暂无 IP 选项" :image-size="50" />
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="upstreamPlanId" label="官方ID" width="80" align="center">
            <template #default="{ row }">
              <span class="mono official-id">#{{ row.upstreamPlanId ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="商品信息" min-width="180">
            <template #default="{ row }">
              <div class="product-info">
                <span class="product-name">{{ row.name }}</span>
                <div class="info-bottom">
                  <span class="info-tag region">{{ row.zone || row.zoneName || '-' }}</span>
                  <span class="info-tag spec">{{ parseSpec(row) }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="IP 种类数" width="90" align="center">
            <template #default="{ row }">
              <span class="ip-count-badge">{{ getIpOptionsCount(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="最便宜 IP" min-width="150">
            <template #default="{ row }">
              <div v-if="getCheapestIp(row)" class="ip-summary">
                <span class="ip-summary-label">{{ getCheapestIp(row)!.label }}</span>
                <span class="ip-summary-price mono" :class="{ 'text-free': getCheapestIp(row)!.price === 0 }">
                  {{ getCheapestIp(row)!.price === 0 ? '免费' : formatMoney(getCheapestIp(row)!.price) }}
                </span>
              </div>
              <span v-else class="text-tertiary">—</span>
            </template>
          </el-table-column>
          <el-table-column label="最贵 IP" min-width="150">
            <template #default="{ row }">
              <div v-if="getMostExpensiveIp(row)" class="ip-summary">
                <span class="ip-summary-label">{{ getMostExpensiveIp(row)!.label }}</span>
                <span class="ip-summary-price mono">
                  {{ formatMoney(getMostExpensiveIp(row)!.price) }}
                </span>
              </div>
              <span v-else class="text-tertiary">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="markupRate" label="优惠率" width="90" align="center">
            <template #default="{ row }">
              <span class="discount-badge" :class="`is-${markupTagType(row.markupRate ?? row.markup)}`">
                {{ formatMarkup(row.markupRate ?? row.markup) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button class="row-btn" size="default" @click="openEdit(row)">
                <el-icon style="margin-right: 4px;"><Edit /></el-icon>编辑
              </el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无商品" /></template>
        </el-table>
      </div>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="editDialog.visible"
      :title="editDialog.isEdit ? '编辑商品' : '新建商品'"
      width="680px"
      :close-on-click-modal="false"
      class="keke-confirm-box"
    >
      <el-form ref="editFormRef" :model="editDialog.form" label-width="100px" label-position="right">
        <!-- 商品名称：可手动填写或一键填充 地区+配置 -->
        <el-form-item label="商品名称" required>
          <div class="name-row">
            <el-input
              v-model="editDialog.form.name"
              placeholder="建议：地区 · 配置（例：中国香港 · KVM 高配版 · 4核8G）"
              maxlength="100"
              show-word-limit
            />
            <el-button
              v-if="editDialog.isEdit"
              class="row-btn"
              size="default"
              @click="autoFillName"
            >
              <el-icon style="margin-right: 4px;"><MagicStick /></el-icon>
              自动生成
            </el-button>
          </div>
          <div class="form-tip">
            默认显示与官方一致的代号（如 mlarge）。点击「自动生成」可填入「地区 · 规格版本 · 配置」格式。
          </div>
        </el-form-item>

        <!-- 上游套餐 ID（只读） -->
        <el-form-item label="官方套餐 ID" v-if="editDialog.isEdit">
          <el-input :model-value="`#${editDialog.form.upstreamPlanId}`" disabled />
          <div class="form-tip">由雨云上游同步生成，不可修改</div>
        </el-form-item>

        <!-- 状态 + 推荐开关 -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="上下架">
              <el-select v-model="editDialog.form.status" style="width: 100%">
                <el-option label="上架" value="online" />
                <el-option label="下架" value="offline" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="推荐商品">
              <el-switch
                v-model="editDialog.form.isRecommended"
                active-text="推荐"
                inactive-text="普通"
                inline-prompt
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 优惠率 + 排序权重 -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="优惠率">
              <el-input-number
                v-model="editDialog.form.markupRate"
                :precision="2"
                :step="0.05"
                :min="-0.9"
                :max="5"
                controls-position="right"
                style="width: 100%"
                @change="onMarkupRateChange"
              />
              <div class="form-tip markup-tip">
                <span class="tip-arrow">−</span>
                <span class="tip-text">优惠（9折）</span>
                <span class="tip-divider">·</span>
                <span class="tip-text">0 = 原价</span>
                <span class="tip-divider">·</span>
                <span class="tip-arrow">+</span>
                <span class="tip-text">加价</span>
                <span class="tip-divider">→</span>
                <strong :class="editDialog.form.markupRate < 0 ? 'text-success' : (editDialog.form.markupRate > 0 ? 'text-warning' : 'text-tertiary')">
                  {{ formatMarkup(editDialog.form.markupRate) }}
                </strong>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序权重">
              <el-input-number
                v-model="editDialog.form.sort"
                :step="1"
                :min="0"
                controls-position="right"
                style="width: 100%"
              />
              <div class="form-tip">数值越大越靠前展示</div>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 价格预览（根据优惠率实时计算） -->
        <el-form-item label="售价预览">
          <div class="price-preview" v-if="editDialog.isEdit">
            <div class="preview-section-title">机器价（不含 IP）</div>
            <div
              v-for="p in previewPriceMap(editDialog.form.markupRate, editDialog.form.upstreamPricesJson)"
              :key="p.cycle"
              class="preview-row"
            >
              <span class="preview-cycle">{{ p.cycle }}</span>
              <span class="preview-original">¥{{ Number(p.original).toFixed(2) }}</span>
              <el-icon class="preview-arrow"><ArrowRight /></el-icon>
              <span class="preview-sell">¥{{ p.sell }}</span>
            </div>
            <div class="preview-section-title" v-if="editDialog.form.ipOptions.length">
              IP 选项（{{ editDialog.form.ipOptions.length }} 种）
            </div>
            <div
              v-for="ip in editDialog.form.ipOptions"
              :key="ip.type"
              class="preview-row ip-preview-row"
            >
              <span class="preview-cycle ip-label">{{ ip.label }}</span>
              <span class="preview-original">¥{{ Number(ip.upstreamPrice).toFixed(2) }}</span>
              <el-icon class="preview-arrow"><ArrowRight /></el-icon>
              <span class="preview-sell" :class="{ 'is-free': Number(ip.sellPrice) === 0 }">
                {{ Number(ip.sellPrice) === 0 ? '免费' : `¥${ip.sellPrice}` }}
              </span>
            </div>
            <div class="preview-tip">
              官方原价 → 本站售价（保存后写入数据库）<br/>
              实付总价 = (机器价 + IP价 × IP数) × 周期折扣
            </div>
          </div>
          <div class="price-preview" v-else>
            <div class="preview-tip">新建商品保存后由同步自动生成</div>
          </div>
        </el-form-item>

        <!-- 商品描述 -->
        <el-form-item label="商品描述">
          <el-input
            v-model="editDialog.form.description"
            type="textarea"
            :rows="3"
            placeholder="商品描述（可选），不填将使用默认文案"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>

        <!-- 高级选项（折叠） -->
        <el-collapse class="advanced-collapse">
          <el-collapse-item title="高级选项" name="adv">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="分组">
                  <el-input
                    v-model="editDialog.form.group"
                    placeholder="如：标准版 / 入门款（可选）"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="每人限购">
                  <el-input-number
                    v-model="editDialog.form.perUserLimit"
                    :min="0"
                    :step="1"
                    controls-position="right"
                    style="width: 100%"
                  />
                  <div class="form-tip">0 = 不限制</div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button class="row-btn" @click="editDialog.visible = false">取消</el-button>
        <el-button class="row-btn" :loading="editDialog.loading" @click="submitEdit">
          {{ editDialog.isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.admin-products {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 编辑弹窗：内容区可滚动 ============
:deep(.keke-confirm-box) {
  .el-dialog__body {
    max-height: 70vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 12px;

    // 美化滚动条
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--border-base);
      border-radius: 3px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background: var(--gold-300);
    }
  }

  // 弹窗内所有按钮统一高度（含一键填充、取消、保存）
  .el-button {
    height: 36px;
    padding: 0 16px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 4px;

    .el-icon {
      font-size: 13px;
    }
  }

  // 表单内的"一键填充"小按钮稍紧凑
  .el-dialog__body .el-button {
    height: 32px;
    padding: 0 12px;
    font-size: 12px;
  }
}

// ============ 全局按钮放大优化（管理员后台） ============
// Element Plus 默认按钮高度偏小（约 24-28px），这里统一放大，更易点击
.admin-products {
  // 顶部主要操作按钮
  .page-header .header-actions {
    :deep(.el-button) {
      height: 40px;
      padding: 0 18px;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.3px;
      border-radius: 4px;

      .el-icon {
        font-size: 14px;
      }
    }
  }

  // 筛选栏按钮
  .filter-bar {
    :deep(.el-button) {
      height: 36px;
      padding: 0 16px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 4px;

      .el-icon {
        font-size: 13px;
      }
    }

    :deep(.el-input),
    :deep(.el-select) {
      .el-input__wrapper {
        min-height: 36px;
      }
      .el-input__inner {
        height: 36px;
        font-size: 13px;
      }
    }
  }

  // 表格内行内按钮（编辑/上下架/删除）
  .table-card .row-btn {
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
    margin: 2px 4px 2px 0;

    &:last-child {
      margin-right: 0;
    }

    .el-icon {
      font-size: 12px;
    }
  }

  // 行内按钮颜色变体
  .row-btn {
    background: var(--bg-subtle);
    border: 1px solid var(--border-base);
    color: var(--text-secondary);

    &:hover {
      background: rgba(212, 121, 142, 0.08);
      border-color: var(--gold-300);
      color: var(--gold-500);
    }

    &.row-btn-warn {
      color: var(--warning);
      border-color: rgba(255, 193, 7, 0.3);

      &:hover {
        background: rgba(255, 193, 7, 0.1);
        border-color: var(--warning);
        color: var(--warning);
      }
    }

    &.row-btn-danger {
      color: var(--danger);
      border-color: rgba(244, 67, 54, 0.3);

      &:hover {
        background: rgba(244, 67, 54, 0.1);
        border-color: var(--danger);
        color: var(--danger);
      }
    }

    &.btn-danger-outline {
      color: var(--danger);
      border-color: rgba(244, 67, 54, 0.4);

      &:hover {
        background: rgba(244, 67, 54, 0.1);
        border-color: var(--danger);
        color: var(--danger);
      }

      &.is-disabled,
      &.is-disabled:hover {
        color: var(--el-text-color-disabled);
        border-color: var(--el-border-color);
        background: transparent;
        cursor: not-allowed;
      }
    }
  }

  // 删除所有商品弹窗样式
  .delete-all-box {
    line-height: 1.7;
    font-size: 14px;

    .da-warning {
      margin: 0 0 12px;
      color: var(--danger);
    }
    .da-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      margin-bottom: 12px;
      background: rgba(244, 67, 54, 0.05);
      border: 1px solid rgba(244, 67, 54, 0.2);
      border-radius: 8px;

      label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 13px;

        input[type='radio'] {
          cursor: pointer;
        }
        b {
          color: var(--danger);
        }
      }
    }
    .da-confirm {
      margin: 0 0 8px;
      font-size: 13px;
      color: var(--el-text-color-secondary);

      code {
        padding: 1px 6px;
        margin: 0 2px;
        background: var(--el-fill-color-light);
        border-radius: 4px;
        font-family: 'JetBrains Mono', monospace;
        color: var(--danger);
        font-weight: 600;
      }
    }
    .da-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--el-border-color);
      border-radius: 6px;
      font-size: 14px;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 1px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.2s;

      &:focus {
        border-color: var(--danger);
      }
    }
  }

  // 分页器放大
  .pagination-wrap {
    :deep(.el-pagination) {
      --el-pagination-button-width: 36px;
      --el-pagination-button-height: 36px;
      --el-pagination-font-size: 13px;

      .btn-prev, .btn-next, .el-pager li {
        min-width: 36px;
        height: 36px;
        line-height: 36px;
      }

      .el-input__wrapper {
        min-height: 36px;
      }
    }
  }
}

// ============ 排序切换按钮 ============
.sort-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-order-btn {
  height: 36px !important;
  padding: 0 14px !important;
  font-size: 12px !important;
  font-weight: 500;
  border-radius: 4px !important;
  background: var(--bg-subtle) !important;
  border: 1px solid var(--border-base) !important;
  color: var(--text-secondary) !important;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s var(--ease-out-expo);

  &:hover {
    background: rgba(212, 121, 142, 0.08) !important;
    border-color: var(--gold-300) !important;
    color: var(--gold-500) !important;
  }

  .el-icon {
    font-size: 13px;
    transition: transform 0.2s var(--ease-out-expo);
  }

  .sort-order-text {
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.3px;
  }
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
    gap: 6px;
  }

  .page-title {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    letter-spacing: -0.3px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  @include mobile {
    .page-title { font-size: 22px; }
    .header-actions { width: 100%; }
    .header-actions .el-button { flex: 1; }
  }
}

// ============ 筛选卡 ============
.filter-card {
  padding: 16px 20px;

  :deep(.el-form-item) {
    margin-bottom: 0;
    margin-right: 12px;
  }
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;

  @include mobile {
    flex-direction: column;
    align-items: stretch;

    :deep(.el-form--inline) {
      display: flex;
      flex-direction: column;
      width: 100%;
    }
    :deep(.el-form-item) {
      margin-right: 0;
      width: 100%;
      .el-input, .el-select, .el-date-editor { width: 100% !important; }
    }
  }
}

// ============ 表格卡 ============
.table-card {
  overflow: visible;
  min-width: 0;
  :deep(.el-table) {
    --el-table-border-color: var(--border-base);
    --el-table-header-bg-color: transparent;
    --el-table-tr-bg-color: transparent;
    --el-table-bg-color: transparent;

    &::before,
    .el-table__inner-wrapper::before {
      display: none;
    }

    th.el-table__cell {
      background: transparent;
      border-bottom: 1px solid var(--border-base);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--text-tertiary);
      padding: 12px 0;
    }

    .el-table__cell {
      border-bottom: 1px dashed var(--border-light);
      padding: 12px 0;
    }

    .el-table__fixed-right::before,
    .el-table__fixed::before {
      display: none;
    }
  }
}

// 表格包裹：桌面端不滚动（响应式自适应），移动端允许水平滚动
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  :deep(.el-table) {
    // 综合视图（Tab 1）在桌面端宽度自适应，不强制最小宽度
    // 其他视图保留最小宽度，仅在内容确实超过容器时才允许横向滚动
    min-width: 0;
  }

  // 在小屏幕（< 768px）允许横向滚动作为兜底
  @include mobile {
    :deep(.el-table) {
      min-width: 720px;
    }
  }
}


// ============ 商品信息列 ============
.product-info {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .info-top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .info-bottom {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .product-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .product-codename {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text-tertiary);
    padding: 1px 6px;
    border: 1px dashed var(--border-light);
    border-radius: 3px;
    letter-spacing: 0.3px;
  }

  .info-tag {
    font-size: 11px;
    color: var(--text-tertiary);
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--bg-subtle);
    letter-spacing: 0.2px;

    &.region {
      color: var(--text-gold);
      background: rgba(212, 121, 142, 0.08);
      border: 1px solid rgba(212, 121, 142, 0.2);
      font-weight: 500;
    }

    &.spec {
      font-family: 'JetBrains Mono', monospace;
    }
  }
}

// ============ 价格对比列 ============
.price-compare {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

// 紧凑价格显示（综合视图 Tab 1）
.price-compare-compact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.3;

  .price-line-original {
    display: flex;
    align-items: center;
    gap: 6px;

    .strike {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-tertiary);
      text-decoration: line-through;
      text-decoration-color: rgba(244, 67, 54, 0.5);
    }
  }

  .price-line-sell {
    display: flex;
    align-items: baseline;
    gap: 2px;

    .price-sell-main {
      font-family: 'JetBrains Mono', monospace;
      font-size: 15px;
      font-weight: 700;
      color: var(--gold-500);
    }

    .price-sell-unit {
      font-size: 10px;
      color: var(--text-tertiary);
    }
  }

  .price-line-sub {
    font-size: 10px;
    color: var(--text-tertiary);
    letter-spacing: 0.2px;
  }
}

// 优惠率徽章紧凑版
.discount-badge.mini {
  padding: 1px 6px;
  font-size: 10px;
  border-radius: 8px;
  letter-spacing: 0;
}

// IP 价格单元格（原价划线 + 优惠后价 或 上游价 → 优惠后价）
.ip-price-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  line-height: 1.2;

  .ip-price-strike {
    color: var(--text-tertiary);
    text-decoration: line-through;
    text-decoration-color: rgba(244, 67, 54, 0.5);
    text-decoration-thickness: 1px;
    font-size: 11px;
  }

  .ip-price-sell-sub {
    color: var(--gold-500);
    font-size: 11px;
    font-weight: 600;
  }

  .price-unit {
    font-size: 10px;
    color: var(--text-tertiary);
    font-weight: 400;
    margin-left: 1px;
  }
}

.price-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;

  .price-label {
    display: inline-block;
    width: 42px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text-tertiary);
    letter-spacing: 0.3px;
  }

  .price-original {
    color: var(--text-tertiary);
    text-decoration: line-through;
    font-family: 'JetBrains Mono', monospace;
  }

  .arrow {
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .price-sell {
    color: var(--gold-500);
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;

    &.price-total {
      color: var(--success);
      font-size: 13px;
      padding: 1px 6px;
      border-radius: 3px;
      background: rgba(76, 175, 80, 0.1);

      .price-total-value {
        font-size: 14px;
        font-weight: 700;
        margin-left: 2px;
      }
    }
  }

  &.price-row-ip {
    .ip-info {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: 'JetBrains Mono', monospace;

      .ip-price {
        color: var(--text-secondary);
        font-weight: 600;

        .ip-unit {
          font-size: 10px;
          color: var(--text-tertiary);
          font-weight: 400;
          margin-left: 1px;
        }
      }

      .ip-count {
        font-size: 10px;
        color: var(--text-tertiary);
        letter-spacing: 0.3px;
        padding: 1px 5px;
        border: 1px solid var(--border-light);
        border-radius: 8px;
        background: var(--bg-subtle);
      }
    }
  }
}

// 官方 ID 列
.official-id {
  color: var(--gold-500);
  font-weight: 600;
  font-size: 13px;
}

// 优惠率徽章
.discount-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.3px;
  font-variant-numeric: tabular-nums;

  &.is-success {
    color: var(--success);
    background: rgba(76, 175, 80, 0.12);
    border: 1px solid rgba(76, 175, 80, 0.3);
  }

  &.is-warning {
    color: var(--warning);
    background: rgba(255, 193, 7, 0.12);
    border: 1px solid rgba(255, 193, 7, 0.3);
  }

  &.is-info {
    color: var(--text-tertiary);
    background: var(--bg-subtle);
    border: 1px solid var(--border-base);
  }
}

.markup {
  color: var(--text-gold);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-family: 'JetBrains Mono', monospace;
}

// 状态纯文字
.status-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;

  &.is-success { color: var(--success); }
  &.is-warning { color: var(--warning); }
  &.is-danger  { color: var(--danger); }
  &.is-info    { color: var(--text-tertiary); }
  &.is-primary { color: var(--text-gold); }
}

// 网络模式标签
.net-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 3px;
}

// 处理器 / 线路 / 计费类型 列样式
.machine-text,
.line-text,
.charge-text {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 4px;
  background: rgba(64, 158, 255, 0.08);
  color: #409eff;
  letter-spacing: 0.2px;
}

.machine-text {
  background: rgba(103, 194, 58, 0.08);
  color: #67c23a;
}

.line-text {
  background: rgba(230, 162, 60, 0.08);
  color: #e6a23c;
}

.charge-text {
  background: rgba(144, 147, 153, 0.08);
  color: #909399;
}

// 网络模式标签（NAT / 独立 IP）
.net-badge {
  color: var(--success);
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.25);

  &.is-nat {
    color: var(--warning);
    background: rgba(230, 162, 60, 0.08);
    border-color: rgba(230, 162, 60, 0.25);
  }
}

// 库存文字
.stock-text {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', monospace;

  &.is-low {
    color: var(--warning);
    font-weight: 600;
  }
}

.text-tertiary {
  color: var(--text-tertiary);
  font-size: 12px;
}

.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.form-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.4;

  &.markup-tip {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;

    .tip-arrow {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      color: var(--text-secondary);
    }

    .tip-divider {
      color: var(--text-tertiary);
      opacity: 0.5;
    }

    .tip-text {
      color: var(--text-tertiary);
    }
  }
}

.text-success { color: var(--success); }
.text-warning { color: var(--warning); }
.text-tertiary { color: var(--text-tertiary); }

// ===== 编辑弹窗 =====
.name-row {
  display: flex;
  gap: 8px;
  width: 100%;

  :deep(.el-input) {
    flex: 1;
  }
}

.price-preview {
  width: 100%;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-base);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .preview-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;

    .preview-cycle {
      display: inline-block;
      width: 36px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-tertiary);
      letter-spacing: 0.3px;
    }

    .preview-original {
      color: var(--text-tertiary);
      text-decoration: line-through;
      font-family: 'JetBrains Mono', monospace;
    }

    .preview-arrow {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .preview-sell {
      color: var(--gold-500);
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
    }
  }

  .preview-tip {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 4px;
    letter-spacing: 0.2px;
  }
}

// 高级选项折叠面板
.advanced-collapse {
  border: none;
  margin-top: 8px;

  :deep(.el-collapse-item__header) {
    background: transparent;
    border-bottom: 1px dashed var(--border-base);
    padding-left: 0;
    font-size: 13px;
    color: var(--text-tertiary);
    letter-spacing: 0.3px;

    &.is-active {
      color: var(--text-gold);
    }
  }

  :deep(.el-collapse-item__wrap) {
    background: transparent;
    border: none;
  }

  :deep(.el-collapse-item__content) {
    padding: 16px 0 0;
  }
}

.font-mono {
  :deep(.el-textarea__inner) {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
  }
}

// ===== 响应式 =====
@include tablet-down {
  .filter-card :deep(.el-form--inline .el-form-item) { margin-right: 0; }
}

@include mobile {
  .filter-card { padding: 12px 12px 0; }
  .pagination-wrap { padding: 12px; }
}

// ============ 视图切换 Tab ============
.view-tabs {
  display: flex;
  gap: 4px;
  padding: 10px 16px 0;
  border-bottom: 1px solid var(--border-light);
  overflow-x: auto;
  flex-wrap: nowrap;

  @include mobile {
    padding: 8px 8px 0;
    gap: 2px;
  }
}

.view-tab {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 14px 10px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s var(--ease-out-expo);
  color: var(--text-tertiary);
  position: relative;
  top: 1px;

  .view-tab-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
    line-height: 1.2;
  }

  .view-tab-desc {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text-tertiary);
    opacity: 0.7;
    line-height: 1;
    letter-spacing: 0.3px;
  }

  &:hover {
    color: var(--text-primary);

    .view-tab-desc {
      opacity: 1;
    }
  }

  &.active {
    color: var(--text-gold);
    border-bottom-color: var(--gold-500);

    .view-tab-desc {
      color: var(--gold-400);
      opacity: 1;
    }
  }

  @include mobile {
    padding: 6px 10px 8px;

    .view-tab-label { font-size: 12px; }
    .view-tab-desc { display: none; }
  }
}

// ============ 多视图表格通用样式 ============
.price-unit {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: 400;
  margin-left: 2px;
}

.price-upstream {
  color: var(--text-tertiary);
}

.price-sell {
  color: var(--text-gold);
  font-weight: 600;
}

// IP 种类数徽章
.ip-count-badge {
  display: inline-block;
  min-width: 24px;
  height: 22px;
  line-height: 22px;
  padding: 0 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-gold);
  background: var(--gold-50);
  border: 1px solid var(--gold-300);
  border-radius: 11px;
  text-align: center;
}

// ===== 总价对比单元格 =====
.total-compare {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  .total-original {
    font-size: 12px;
    color: var(--text-tertiary);
    text-decoration: line-through;
  }

  .arrow {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .total-sell {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-gold);
  }
}

.total-hint {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.3px;
}

// ===== IP 汇总（最便宜/最贵） =====
.ip-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .ip-summary-label {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .ip-summary-price {
    font-size: 13px;
    color: var(--text-gold);
    font-weight: 600;

    &.text-free {
      color: var(--success);
    }
  }
}

.text-free {
  color: var(--success) !important;
  font-weight: 700;
}

// ===== IP 明细展开表 =====
.ip-detail-wrap {
  padding: 8px 16px 16px 56px;
  background: var(--bg-subtle);

  @include mobile {
    padding: 8px 8px 12px 24px;
  }
}

.ip-detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th {
    text-align: left;
    padding: 8px 10px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--text-tertiary);
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-base);
    background: transparent;
  }

  td {
    padding: 8px 10px;
    border-bottom: 1px dashed var(--border-light);
    color: var(--text-primary);
    vertical-align: middle;
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background: var(--glass-bg-subtle);
  }

  .ip-detail-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-right: 6px;
  }

  .ip-detail-type {
    font-size: 10px;
    color: var(--text-tertiary);
  }
}

// IP 标签（默认/免费）
.ip-tag {
  display: inline-block;
  padding: 1px 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  border-radius: 8px;
  margin-right: 4px;
  line-height: 1.4;

  &.ip-tag-default {
    color: var(--text-gold);
    background: var(--gold-50);
    border: 1px solid var(--gold-300);
  }

  &.ip-tag-free {
    color: #fff;
    background: var(--success);
  }
}
</style>
