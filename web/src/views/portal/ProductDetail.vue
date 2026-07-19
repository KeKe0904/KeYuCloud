<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import {
  productApi,
  type Product,
  type AppTemplate,
  type OsTemplate,
  DISK_TYPE_LABELS,
  NET_ZONE_LABELS,
  MACHINE_LABELS,
  LINE_LABELS,
  CHARGE_TYPE_LABELS,
} from '@/api/product';
import { orderApi } from '@/api/order';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

// 商品 ID
const productId = computed(() => Number(route.params.id));

// 数据状态
const loading = ref(false);
const submitting = ref(false);
const product = ref<Product | null>(null);
const osList = ref<OsTemplate[]>([]);
const appTemplates = ref<AppTemplate[]>([]);
// 注：网络区域（zone）由套餐本身绑定，雨云不允许跨区选择，故不再拉取 zoneOptions

// ===== 雨云官方限制常量 =====
// 系统盘：默认 30GB，最大扩容至 250GB（即额外扩容最多 220GB）
// 系统盘扩容价格：按盘型从上游 disk_price 取，再乘 (1+markupRate)
const DISK_MAX_TOTAL = 250; // 系统盘总容量上限
// IP 数量上限（雨云官方限制）
const IP_MAX_COUNT = 5;
// Windows 系统最低内存要求（GB）
const WINDOWS_MIN_MEMORY = 2;

// 购买表单
const formRef = ref<FormInstance>();
const form = reactive({
  duration: 1,
  osId: undefined as number | undefined,
  quantity: 1,
  couponCode: '',
  // IP 选项（机器价不含 IP，IP 单独计费）
  // null = 不购买独立 IP（NAT 商品默认）
  // '' = 默认 IPv4，'ipv6'/'hk_ddosip'/... = 其他 IP 类型
  ipType: null as string | null,
  ipCount: 1,
  // 系统盘扩容（额外硬盘 GB，0=不扩容）
  addDiskSize: 0,
  // 系统盘类型（cloud-hdd / cloud-ssd / ssd / hdd，从 upstreamDiskSelling 选）
  diskType: '' as string,
  // 预装软件（多选 app_id 数组，提交时转换为 appVars）
  selectedAppIds: [] as number[],
  // 预装软件的应用变量值（key = `${appId}:${varName}`，value = 用户输入值）
  appVars: {} as Record<string, string>,
});

// 时长选项（实测雨云上游周期折扣：3月9折/6月8折/12月7折）
const durationOptions = [
  { value: 1, label: '1 个月', discount: '原价' },
  { value: 3, label: '3 个月', discount: '9 折' },
  { value: 6, label: '6 个月', discount: '8 折' },
  { value: 12, label: '12 个月', discount: '7 折' },
];

// 周期折扣映射
const DURATION_DISCOUNT_MAP: Record<number, number> = {
  1: 1.0,
  3: 0.9,
  6: 0.8,
  12: 0.7,
};

// ===== IP 类型中文映射 =====
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

const getIpTypeLabel = (t: string): string => IP_TYPE_LABELS[t] ?? (t || '默认 IPv4');

// 解析 prices JSON
const priceMap = computed<Record<string, number>>(() => {
  if (!product.value) return {};
  try {
    const p: any = product.value.prices;
    return typeof p === 'string' ? JSON.parse(p || '{}') : (p || {});
  } catch {
    return {};
  }
});

// 官方原价（按上游 upstreamPrices）
const upstreamPriceMap = computed<Record<string, number>>(() => {
  if (!product.value) return {};
  try {
    const p: any = (product.value as any).upstreamPrices;
    const obj = typeof p === 'string' ? JSON.parse(p || '{}') : (p || {});
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = Number(v);
    return out;
  } catch {
    return {};
  }
});

// IP 选项列表（基于 upstreamIpPrices + ipPrices，按价格升序）
// 雨云真实数据：NAT 共享 IP 套餐 ip_selling=null 但 ip_prices={"":80}
//   → NAT 商品仍可花 80元/月购买独立 IP，不应禁用 IP 选项
// 判断依据：upstreamIpPrices 非空对象 = 该套餐支持购买独立 IP
interface IpOption {
  type: string;
  label: string;
  price: number; // 月价（已优惠后售价）
  originalPrice: number; // 上游原价（未优惠）
  isFree: boolean; // 是否免费（原价 0 或售价 0）
  hasDiscount: boolean; // 是否有优惠（售价 < 原价）
}
const ipOptions = computed<IpOption[]>(() => {
  if (!product.value) return [];
  // 解析上游 IP 价格对象（如 {"":5,"hk_ddosip":30,"ipv6":0}）
  let upstreamIpPrices: any = (product.value as any).upstreamIpPrices;
  if (typeof upstreamIpPrices === 'string') {
    try { upstreamIpPrices = JSON.parse(upstreamIpPrices || '{}'); } catch { upstreamIpPrices = {}; }
  }
  if (!upstreamIpPrices || typeof upstreamIpPrices !== 'object') {
    upstreamIpPrices = {};
  }
  // 上游 IP 价格对象为空 → 该套餐不支持购买独立 IP（罕见情况）
  const ipTypeKeys = Object.keys(upstreamIpPrices);
  if (!ipTypeKeys.length) return [];

  // 解析已优惠后的 IP 售价
  let prices: any = (product.value as any).ipPrices;
  if (typeof prices === 'string') {
    try { prices = JSON.parse(prices || '{}'); } catch { prices = {}; }
  }
  if (!prices || typeof prices !== 'object') prices = {};

  // 优先用 upstreamIpSelling（在售 IP 类型数组）作为筛选源；
  // 若上游 ip_selling=null（NAT 套餐），则用 upstreamIpPrices 的 key 列表兜底
  let selling: any = (product.value as any).upstreamIpSelling;
  if (typeof selling === 'string') {
    try { selling = JSON.parse(selling || '[]'); } catch { selling = []; }
  }
  const sellingList: string[] =
    Array.isArray(selling) && selling.length ? selling : ipTypeKeys;

  return sellingList
    .map((t: string) => {
      const originalPrice = Number(upstreamIpPrices[t] ?? 0);
      const price = Number(prices?.[t] ?? originalPrice);
      const free = price === 0 || originalPrice === 0;
      return {
        type: t,
        label: getIpTypeLabel(t),
        price,
        originalPrice,
        isFree: free,
        hasDiscount: !free && price < originalPrice,
      };
    })
    .sort((a: IpOption, b: IpOption) => a.price - b.price);
});

// 是否为 NAT 共享 IP 商品
const isNatProduct = computed<boolean>(() => {
  return (product.value as any)?.netMode === 'nat';
});

// 库存显示文本：0=充足 / >0=剩余 N 台
const stockText = computed<string>(() => {
  const stock = Number((product.value as any)?.availableStock ?? 0);
  if (!stock || stock <= 0) return '充足';
  return `剩余 ${stock} 台`;
});

// 库存是否紧张（<= 10 台）
const isStockLow = computed<boolean>(() => {
  const stock = Number((product.value as any)?.availableStock ?? 0);
  return stock > 0 && stock <= 10;
});

// 当前选中的 IP 月价（优惠后）
const currentIpMonthly = computed<number>(() => {
  const opt = ipOptions.value.find((o) => o.type === form.ipType);
  return opt?.price ?? 0;
});

// 当前选中的 IP 上游原价月价（用于显示划线原价）
const currentIpUpstreamMonthly = computed<number>(() => {
  const opt = ipOptions.value.find((o) => o.type === form.ipType);
  return opt?.originalPrice ?? 0;
});

// ===== OS 列表过滤：Windows 仅 2G+ 内存套餐可选；保留 EOL OS 但标记警告 =====
// 雨云官方规则：Windows Server 系统因资源占用较高，仅在内存 ≥ 2GB 的套餐上可选
// 注：不再过滤 is_eol，前端可显示 EOL OS 并附带警告（让用户自主决定）
const availableOsList = computed<OsTemplate[]>(() => {
  if (!osList.value.length) return [];
  const memory = Number(product.value?.memory ?? 0);
  const canWindows = memory >= WINDOWS_MIN_MEMORY;
  return osList.value.filter((os) => {
    // is_available=false 强制下架（雨云上游已禁用）
    if (os.is_available === false) return false;
    // Windows 系统仅在内存 >= 2GB 时可选
    if (os.os_type === 'windows' && !canWindows) return false;
    return true;
  });
});

// ===== OS 按发行版分组（基于 order 字段分段） =====
// 雨云 OS order 字段分段：
//   200=Debian / 300=Ubuntu / 400=CentOS / 500=Windows
//   600=RockyLinux / 700=AlpineLinux / 800=MacOS
// 兜底：order 缺失时按 name 关键字推断
function inferDist(os: OsTemplate): string {
  if (os.order) {
    if (os.order < 300) return 'Debian';
    if (os.order < 400) return 'Ubuntu';
    if (os.order < 500) return 'CentOS';
    if (os.order < 600) return 'Windows';
    if (os.order < 700) return 'RockyLinux';
    if (os.order < 800) return 'AlpineLinux';
    return 'MacOS';
  }
  // 兜底：按 name 关键字
  const n = (os.name || '').toLowerCase();
  if (n.includes('win')) return 'Windows';
  if (n.includes('debian')) return 'Debian';
  if (n.includes('ubuntu')) return 'Ubuntu';
  if (n.includes('centos') || n.includes('almalinux')) return 'CentOS';
  if (n.includes('rocky')) return 'RockyLinux';
  if (n.includes('alpine')) return 'AlpineLinux';
  if (n.includes('macos') || n.includes('mac os')) return 'MacOS';
  return '其他';
}

// 发行版分组列表（按 order 升序，组内按 order 升序）
const groupedOsList = computed<{ dist: string; items: OsTemplate[] }[]>(() => {
  const groups = new Map<string, OsTemplate[]>();
  for (const os of availableOsList.value) {
    const dist = inferDist(os);
    if (!groups.has(dist)) groups.set(dist, []);
    groups.get(dist)!.push(os);
  }
  // 组内排序（order 升序，order 缺失按 name）
  for (const list of groups.values()) {
    list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
  }
  // 组间排序（按组内最小 order）
  return Array.from(groups.entries())
    .map(([dist, items]) => ({ dist, items }))
    .sort((a, b) => (a.items[0]?.order ?? 999) - (b.items[0]?.order ?? 999));
});

// 当前选中的 OS 所属发行版（用于"两层结构：发行版 tab + 版本 combobox"）
const currentOsDist = computed<string>(() => {
  if (!form.osId) return '';
  const os = availableOsList.value.find((o) => o.id === form.osId);
  return os ? inferDist(os) : '';
});

// 切换发行版 tab：自动选中该发行版下第一个 OS
function selectOsDist(dist: string) {
  const group = groupedOsList.value.find((g) => g.dist === dist);
  if (group && group.items.length) {
    form.osId = group.items[0].id;
  }
}

// 当前选中的 OS 对象
const currentOs = computed<OsTemplate | undefined>(() => {
  return availableOsList.value.find((o) => o.id === form.osId);
});

// ===== 预装软件按所选 OS 过滤（基于 os_requirement 正则） =====
// 雨云公开端点 /product/fast-install-app 返回的每个应用都带 os_requirement 正则字符串，
// 用于匹配 OS 的 name 字段（注意：是 OS 的 code/name 原始字段，不是 chinese_name）
//   例如 '^(?!bt)(?!win)(?!alpine).*' → 排除 bt/win/alpine 系统
//        '^win.*' → 仅 Windows
//        '(btpanel10|debian12|...)' → 仅匹配特定 OS
// 若 os_requirement 为空字符串 → 表示该应用兼容所有 OS
// 若正则编译失败 → 安全起见排除该应用（避免误装）
const filteredAppTemplates = computed<AppTemplate[]>(() => {
  if (!appTemplates.value.length || !currentOs.value) return [];
  // 雨云 os_requirement 匹配的是 OS 的原始 name（即 code 字段，如 'debian12' / 'win2022'）
  // mapOs 中 code 字段保留原始 name，所以这里用 currentOs.value.code
  const osCode = currentOs.value.code || currentOs.value.name || '';
  return appTemplates.value.filter((app) => {
    const req = app.os_requirement;
    if (!req) return true; // 无限制
    try {
      const re = new RegExp(req);
      return re.test(osCode);
    } catch {
      // 正则编译失败：安全起见排除
      return false;
    }
  });
});

// ===== 当前所选应用列表中需要填变量的应用（含 vars 数组） =====
const selectedAppsWithVars = computed<AppTemplate[]>(() => {
  return filteredAppTemplates.value.filter(
    (a) => form.selectedAppIds.includes(a.app_id) && a.vars && a.vars.length > 0,
  );
});

// 判断某变量是否应该显示（基于 depend_var / depend_regex 联动）
function shouldShowVar(app: AppTemplate, vDef: { depend_var?: string; depend_regex?: string }): boolean {
  if (!vDef.depend_var) return true;
  const depVal = form.appVars[`${app.app_id}:${vDef.depend_var}`] || '';
  if (!vDef.depend_regex) return !!depVal;
  try {
    return new RegExp(vDef.depend_regex).test(depVal);
  } catch {
    return !!depVal;
  }
}

// ===== 系统盘类型选项（基于 upstreamDiskSelling） =====
// 雨云 disk_selling: ["ssd","hdd","cloud-ssd","cloud-hdd"] 在售盘型数组
// 每种盘型的单价从 upstreamDiskPrices 取，再乘 (1+markupRate) 得到售价
interface DiskTypeOption {
  type: string;
  label: string;
  price: number; // 售价（已含优惠率，元/GB/月）
  originalPrice: number; // 上游原价
  defaultSize: number; // 默认容量（GB）
}

const diskTypeOptions = computed<DiskTypeOption[]>(() => {
  if (!product.value) return [];
  // 解析 upstreamDiskSelling
  let selling: any = (product.value as any).upstreamDiskSelling;
  if (typeof selling === 'string') {
    try { selling = JSON.parse(selling || '[]'); } catch { selling = []; }
  }
  if (!Array.isArray(selling)) selling = [];
  if (!selling.length) return [];

  // 解析 upstreamDiskPrices
  let prices: any = (product.value as any).upstreamDiskPrices;
  if (typeof prices === 'string') {
    try { prices = JSON.parse(prices || '{}'); } catch { prices = {}; }
  }
  if (!prices || typeof prices !== 'object') prices = {};

  // 解析 upstreamDiskSizes
  let sizes: any = (product.value as any).upstreamDiskSizes;
  if (typeof sizes === 'string') {
    try { sizes = JSON.parse(sizes || '{}'); } catch { sizes = {}; }
  }
  if (!sizes || typeof sizes !== 'object') sizes = {};

  const markupRate = Number((product.value as any).markupRate ?? 0);
  return (selling as string[])
    .map((t) => {
      const originalPrice = Number(prices[t] ?? 0);
      const sellPrice = Math.round(originalPrice * (1 + markupRate) * 100) / 100;
      return {
        type: t,
        label: DISK_TYPE_LABELS[t] ?? t,
        price: sellPrice,
        originalPrice,
        defaultSize: Number(sizes[t] ?? 0),
      };
    })
    .sort((a, b) => a.price - b.price);
});

// 当前选中的盘型对应的月价（元/GB/月，已含优惠）
const currentDiskTypeMonthly = computed<number>(() => {
  const opt = diskTypeOptions.value.find((o) => o.type === form.diskType);
  return opt?.price ?? 0;
});

// 当前选中的盘型的上游原价（用于显示划线原价）
const currentDiskTypeUpstreamMonthly = computed<number>(() => {
  const opt = diskTypeOptions.value.find((o) => o.type === form.diskType);
  return opt?.originalPrice ?? 0;
});

// ===== 系统盘扩容计算 =====
// 套餐自带磁盘大小
const productDiskSize = computed<number>(() => {
  return Number(product.value?.disk ?? 30);
});

// 系统盘扩容上限 = 总容量上限(250GB) - 套餐自带磁盘
const diskExpandMax = computed<number>(() => {
  return Math.max(0, DISK_MAX_TOTAL - productDiskSize.value);
});

// 系统盘扩容月价 = 扩容GB × 当前盘型售价（元/GB/月）
// 若未选盘型或盘型价为 0 → 扩容月价为 0（避免误导）
const diskExpandMonthly = computed<number>(() => {
  if (!form.addDiskSize || !currentDiskTypeMonthly.value) return 0;
  return Math.round(form.addDiskSize * currentDiskTypeMonthly.value * 100) / 100;
});

// 优惠率（小数 → 折扣标签）
const discountLabel = computed<string | null>(() => {
  const m = Number((product.value as any)?.markupRate ?? 0);
  if (!m || m >= 0 || isNaN(m)) return null;
  const rate = m > 1 ? m : m * 100;
  const off = 100 + rate; // m 负数 → off < 100
  return `${(off / 10).toFixed(off % 10 === 0 ? 0 : 1)}折`;
});

// 机器月价（不含 IP，已优惠率，对应 prices['1']）
const machineMonthly = computed<number>(() => {
  return Number(priceMap.value['1'] ?? 0);
});

// 当前时长下机器总价（已含周期折扣，不含 IP）
function getMachinePriceForDuration(duration: number): number | null {
  const v = priceMap.value[String(duration)];
  return v && !isNaN(Number(v)) ? Number(v) : null;
}

// 当前时长官方机器原价（含周期折扣）
function getOfficialPrice(duration: number): number | null {
  const v = upstreamPriceMap.value[String(duration)];
  return v && !isNaN(Number(v)) ? Number(v) : null;
}

// 当前订单节省金额 = (官方机器价 - 本站机器价) × 数量（仅机器部分）
const savedAmount = computed<number | null>(() => {
  const official = getOfficialPrice(form.duration);
  const sell = getMachinePriceForDuration(form.duration);
  if (official === null || sell === null) return null;
  const diff = official - sell;
  return diff > 0 ? diff * form.quantity : null;
});

// 当前时长单价（机器部分，不含 IP）— 兼容旧字段名
const currentUnitPrice = computed<number | null>(() => {
  return getMachinePriceForDuration(form.duration);
});

// ===== 总价计算：(机器月价 + IP月价 × IP数) × 时长 × 周期折扣 × 数量 =====
const machineSubtotal = computed<number>(() => {
  const m = machineMonthly.value;
  if (!m) return 0;
  const discount = DURATION_DISCOUNT_MAP[form.duration] ?? 1.0;
  return Math.round(m * form.duration * discount * form.quantity * 100) / 100;
});

const ipSubtotal = computed<number>(() => {
  const ipMonthly = currentIpMonthly.value;
  if (!ipMonthly) return 0;
  const discount = DURATION_DISCOUNT_MAP[form.duration] ?? 1.0;
  return (
    Math.round(ipMonthly * form.ipCount * form.duration * discount * form.quantity * 100) / 100
  );
});

// 系统盘扩容小计 = 扩容月价 × 时长 × 周期折扣 × 数量
const diskSubtotal = computed<number>(() => {
  if (!form.addDiskSize || !diskExpandMonthly.value) return 0;
  const discount = DURATION_DISCOUNT_MAP[form.duration] ?? 1.0;
  return (
    Math.round(diskExpandMonthly.value * form.duration * discount * form.quantity * 100) / 100
  );
});

const totalPrice = computed<number | null>(() => {
  if (machineSubtotal.value === 0 && currentUnitPrice.value === null) return null;
  return (
    Math.round((machineSubtotal.value + ipSubtotal.value + diskSubtotal.value) * 100) / 100
  );
});

// ===== 上游原价总额（机器 + IP + 磁盘，按上游原价计算，用于显示划线原价） =====
// 机器上游原价：upstreamPriceMap[duration] × 数量
// IP 上游原价：currentIpUpstreamMonthly × ipCount × 时长 × 周期折扣 × 数量
// 磁盘扩容上游原价：currentDiskTypeUpstreamMonthly × addDiskSize × 时长 × 周期折扣 × 数量
const upstreamTotalPrice = computed<number | null>(() => {
  const upstreamMachine = getOfficialPrice(form.duration);
  if (upstreamMachine === null) return null;
  const discount = DURATION_DISCOUNT_MAP[form.duration] ?? 1.0;
  const upstreamMachineSubtotal =
    Math.round(upstreamMachine * form.quantity * 100) / 100;
  const upstreamIpSubtotal =
    currentIpUpstreamMonthly.value > 0 && form.ipType !== null
      ? Math.round(
          currentIpUpstreamMonthly.value *
            form.ipCount *
            form.duration *
            discount *
            form.quantity *
            100,
        ) / 100
      : 0;
  // 磁盘扩容上游原价（按当前盘型的上游单价计算）
  const upstreamDiskSubtotal =
    form.addDiskSize > 0 && currentDiskTypeUpstreamMonthly.value > 0
      ? Math.round(
          currentDiskTypeUpstreamMonthly.value *
            form.addDiskSize *
            form.duration *
            discount *
            form.quantity *
            100,
        ) / 100
      : 0;
  return (
    Math.round((upstreamMachineSubtotal + upstreamIpSubtotal + upstreamDiskSubtotal) * 100) / 100
  );
});

// 表单校验规则
const rules: FormRules = {
  osId: [{ required: true, message: '请选择操作系统', trigger: 'change' }],
  quantity: [
    { required: true, message: '请输入数量', trigger: 'blur' },
    {
      type: 'number',
      min: 1,
      max: 10,
      message: '数量需在 1~10 之间',
      trigger: 'blur',
    },
  ],
  ipCount: [
    { required: true, message: '请输入 IP 数量', trigger: 'blur' },
    {
      type: 'number',
      min: 1,
      max: IP_MAX_COUNT,
      message: `IP 数量需在 1~${IP_MAX_COUNT} 之间`,
      trigger: 'blur',
    },
  ],
};

// 商品标签数组（兼容字符串、JSON 字符串、数组三种格式）
const tagList = computed<string[]>(() => {
  const tags = product.value?.tags;
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      if (typeof parsed === 'string') return parsed.split(',').map((s) => s.trim()).filter(Boolean);
    } catch {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
});

// 拉取商品详情
async function fetchProduct() {
  loading.value = true;
  try {
    const res = await productApi.detail(productId.value);
    if (res.success) {
      product.value = res.data;
      // 默认时长优先取最便宜的一档
      const durations = Object.keys(priceMap.value).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
      if (durations.length && !durations.includes(form.duration)) {
        form.duration = durations[0];
      }
      // 默认 IP 类型：
      //   NAT 商品 → null（不购买独立 IP，用户需手动选择）
      //   非 NAT 商品 → defaultIpType 或最便宜的 IP（通常是 IPv6 免费 或 默认 IPv4）
      const netMode = (product.value as any).netMode || 'normal';
      const defaultIpType = (product.value as any).defaultIpType;
      if (netMode === 'nat') {
        // NAT 共享 IP 商品：默认不购买独立 IP，用户需主动选择
        form.ipType = null;
      } else if (ipOptions.value.length) {
        if (defaultIpType && ipOptions.value.some((o) => o.type === defaultIpType)) {
          form.ipType = defaultIpType;
        } else {
          // 默认选第一个（最便宜的）
          form.ipType = ipOptions.value[0].type;
        }
      } else {
        form.ipType = null;
      }
      // 默认系统盘类型：优先 cloud-ssd（云端 SSD），其次第一个
      if (diskTypeOptions.value.length) {
        const preferred = diskTypeOptions.value.find((o) => o.type === 'cloud-ssd');
        form.diskType = (preferred || diskTypeOptions.value[0]).type;
      } else {
        form.diskType = '';
      }
      // 注：网络区域已改为只读展示商品 zone，无需设置 form.netZone
      // 商品加载后，确保 OS 默认值在可用列表中
      ensureDefaultOs();
    }
  } catch (e) {
    // 错误已提示
  } finally {
    loading.value = false;
  }
}

// 确保 form.osId 在 availableOsList 中，否则选第一个可用 OS
function ensureDefaultOs() {
  if (!availableOsList.value.length) return;
  const stillValid = availableOsList.value.some((o) => o.id === form.osId);
  if (!stillValid) {
    form.osId = availableOsList.value[0].id;
  }
}

// 拉取操作系统列表（按商品 region 过滤，雨云 OS 按 region 分组）
async function fetchOsList() {
  try {
    // 从商品 zone 取 region（如 cn-sq1），仅拉取该区域可用 OS
    const region = (product.value as any)?.zone || '';
    const res = await productApi.osList(region);
    if (res.success) {
      osList.value = res.data || [];
      ensureDefaultOs();
    }
  } catch {
    // 静默失败
  }
}

// 拉取预装软件模板列表
async function fetchAppTemplates() {
  try {
    const res = await productApi.appTemplates();
    if (res.success) {
      appTemplates.value = res.data || [];
    }
  } catch {
    // 静默失败
  }
}

// 注：网络区域已改为只读展示商品 zone，无需 fetchZones 拉取全量区域列表
// （雨云套餐已绑定特定 zone，跨区选择会被上游 API 拒绝）

// OS 切换时：清空已选预装软件（因应用列表按 OS 过滤，旧选择可能不再可选）
watch(
  () => form.osId,
  () => {
    // 清除已选但当前 OS 不支持的应用
    if (!filteredAppTemplates.value.length) {
      form.selectedAppIds = [];
      return;
    }
    const validIds = new Set(filteredAppTemplates.value.map((a) => a.app_id));
    form.selectedAppIds = form.selectedAppIds.filter((id) => validIds.has(id));
  },
);

// 监听 availableOsList 变化：OS 列表加载完成或商品内存已知后，确保默认 OS 被设置
// 解决 onMounted 中 fetchProduct/fetchOsList 并行导致的时序问题
watch(
  availableOsList,
  (list) => {
    if (!list.length) return;
    const stillValid = list.some((o) => o.id === form.osId);
    if (!stillValid) {
      form.osId = list[0].id;
    }
  },
  { immediate: true },
);

// 监听 product 变化：商品加载完成后，按 zone 拉取该区域可用 OS
// 必须在 product 就绪后再调用，否则 region 为空 → 拉取所有区域 OS（与商品不匹配）
watch(
  () => (product.value as any)?.zone,
  (newZone) => {
    if (newZone) {
      fetchOsList();
    }
  },
  { immediate: true },
);

// 监听系统盘扩容上限变化：若当前值超过新上限，重置
watch(
  diskExpandMax,
  (max) => {
    if (form.addDiskSize > max) {
      form.addDiskSize = Math.max(0, Math.floor(max / 5) * 5);
    }
  },
);

// 价格格式化
function formatPrice(price: number | null): string {
  if (price === null) return '—';
  return `¥${price.toFixed(2)}`;
}

// 选择时长
function selectDuration(duration: number) {
  form.duration = duration;
}

// 选择 IP 类型
function selectIpType(type: string | null) {
  form.ipType = type;
}

// 跳转登录
function goLogin() {
  router.push({ name: 'Login', query: { redirect: route.fullPath } });
}

// 提交购买
async function handleBuy() {
  if (!product.value) {
    ElMessage.warning('商品信息加载中，请稍后');
    return;
  }

  if (!auth.isLoggedIn) {
    ElMessage.info('请先登录后再购买');
    goLogin();
    return;
  }

  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      // 将选中的 app_id 数组转为 appVars 对象数组
      // 每个应用的 vars 从 form.appVars 中按 `${appId}:${varName}` 取值
      const appVars = form.selectedAppIds.map((appId) => {
        const vars: Record<string, string> = {};
        // 从应用模板中找到该应用的 vars 定义，取用户填写的值或默认值
        const app = appTemplates.value.find((a) => a.app_id === appId);
        if (app?.vars) {
          for (const v of app.vars) {
            const key = `${appId}:${v.name}`;
            const userVal = form.appVars[key];
            vars[v.name] = userVal ?? v.default ?? '';
          }
        }
        return { app_id: appId, vars };
      });

      const res = await orderApi.create({
        productId: product.value!.id,
        duration: form.duration,
        osId: form.osId!,
        quantity: form.quantity,
        couponCode: form.couponCode || undefined,
        // IP 类型：null = 不购买独立 IP（NAT 商品默认）
        // 提交时：null → 'none'（后端识别为不购买 IP）；'' → 默认 IPv4；其他 → 对应类型
        ipType: form.ipType === null ? 'none' : form.ipType,
        ipCount: form.ipCount,
        addDiskSize: form.addDiskSize > 0 ? form.addDiskSize : undefined,
        // 系统盘类型：仅当扩容 > 0 时传递（与 addDiskSize 联动）
        diskType: form.addDiskSize > 0 && form.diskType ? form.diskType : undefined,
        // 网络区域：套餐已绑定，透传商品 zone（后端 createRcs 用此值开通）
        netZone: (product.value as any).zone || undefined,
        appVars: appVars.length ? appVars : undefined,
      });
      if (res.success) {
        const orderData: any = res.data;
        const orderNo = orderData.orderNo || orderData.id;
        ElMessage.success('订单已创建，正在跳转支付');
        router.push({
          name: 'PaymentResult',
          query: { orderNo, status: 'pending' },
        });
      }
    } catch (e) {
      // 错误已由拦截器处理
    } finally {
      submitting.value = false;
    }
  });
}

// 跳转到「多套餐区域对比」页面（聚焦当前商品所在区域）
function goZoneCompare() {
  const z = (product.value as any).zone;
  if (z) {
    router.push({ name: 'ZoneDetail', params: { zone: z } });
  }
}

// 联系客服
function contactSupport() {
  if (auth.isLoggedIn) {
    router.push({ name: 'DashboardTicketNew' });
  } else {
    ElMessage.info('请先登录后提交工单');
    goLogin();
  }
}

// 监听路由 id 变化（同组件不同商品）
watch(
  () => route.params.id,
  (newId) => {
    if (newId && Number(newId) !== productId.value) {
      fetchProduct();
    }
  },
);

onMounted(() => {
  fetchProduct();
  // fetchOsList 改由 watch(product.zone) 触发，确保 product 就绪后再按 region 拉取
  fetchAppTemplates();
  // 注：网络区域已改为只读展示商品 zone，无需 fetchZones
});
</script>

<template>
  <div class="product-detail-page" v-loading="loading">
    <template v-if="product">
      <!-- 面包屑 -->
      <div class="breadcrumb-bar">
        <div class="container">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item :to="{ path: '/products' }">云服务器</el-breadcrumb-item>
            <el-breadcrumb-item>{{ product.name }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
      </div>

      <!-- 商品头部 -->
      <section class="product-header">
        <div class="container">
          <div class="header-eyebrow eyebrow">
            <span class="eyebrow-dot"></span>
            {{ product.category || '云服务器' }}
            <span v-if="(product as any).upstreamPlanId" class="eyebrow-id">
              · 官方ID #{{ (product as any).upstreamPlanId }}
            </span>
          </div>
          <div class="title-row">
            <h1 class="product-name font-display">{{ product.name }}</h1>
            <span v-if="discountLabel" class="discount-pill font-mono">{{ discountLabel }} 优惠</span>
          </div>
          <p class="product-desc">{{ product.description || '稳定、安全、高性能的云服务器方案，为您的业务保驾护航。' }}</p>

          <div class="header-cta" v-if="(product as any).zone">
            <button class="zone-compare-link" @click="goZoneCompare">
              <span class="zone-compare-icon">⇄</span>
              <span>对比 {{ product.zoneName || product.zone }} 区域全部套餐</span>
              <span class="arrow">→</span>
            </button>
          </div>

          <!-- 标签 + 快速信息（横向铺开，无卡片） -->
          <div class="header-meta">
            <div class="tag-list" v-if="tagList.length">
              <span v-for="tag in tagList" :key="tag" class="product-tag font-mono">{{ tag }}</span>
            </div>
            <div class="meta-divider" v-if="tagList.length"></div>
            <div class="quick-info">
              <div class="info-item">
                <span class="info-label eyebrow">地区</span>
                <span class="info-value">{{ product.zoneName || product.zone || '—' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label eyebrow">网络</span>
                <span class="info-value" :class="isNatProduct ? 'status-nat' : 'status-normal'">
                  {{ isNatProduct ? 'NAT 共享' : '独立 IP' }}
                </span>
              </div>
              <div class="info-item" v-if="(product as any).machine">
                <span class="info-label eyebrow">处理器</span>
                <span class="info-value font-mono">
                  {{ MACHINE_LABELS[(product as any).machine] || (product as any).machine }}
                </span>
              </div>
              <div class="info-item" v-if="(product as any).line">
                <span class="info-label eyebrow">线路</span>
                <span class="info-value font-mono">
                  {{ LINE_LABELS[(product as any).line] || (product as any).line }}
                </span>
              </div>
              <div class="info-item" v-if="(product as any).chargeType">
                <span class="info-label eyebrow">计费</span>
                <span class="info-value font-mono">
                  {{ CHARGE_TYPE_LABELS[(product as any).chargeType] || (product as any).chargeType }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label eyebrow">库存</span>
                <span class="info-value font-mono" :class="{ 'stock-low': isStockLow }">
                  {{ stockText }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label eyebrow">状态</span>
                <span class="info-value" :class="product.isOnSale ? 'status-on' : 'status-off'">
                  {{ product.isOnSale ? '在售' : '已售罄' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 主体：规格 + 配置（左） + 购买表单（右） -->
      <section class="product-body">
        <div class="container body-grid">
          <!-- 左侧：规格表 + 配置选项（OS / 预装软件 / 系统盘扩容） -->
          <div class="left-column">
            <!-- 规格表 -->
            <div class="specs-panel card">
              <div class="panel-head">
                <span class="panel-eyebrow eyebrow">Specs</span>
                <h2 class="panel-title">规格详情</h2>
              </div>
              <DecorLine variant="gradient" width="100%" />
              <table class="specs-table">
                <tbody>
                  <tr>
                    <th>CPU</th>
                    <td class="font-mono">{{ product.cpu }} 核</td>
                  </tr>
                  <tr>
                    <th>内存</th>
                    <td class="font-mono">{{ product.memory }} GB</td>
                  </tr>
                  <tr>
                    <th>系统盘</th>
                    <td class="font-mono">{{ product.disk }} GB SSD</td>
                  </tr>
                  <tr>
                    <th>带宽</th>
                    <td class="font-mono">{{ product.bandwidth }} Mbps</td>
                  </tr>
                  <tr>
                    <th>月流量</th>
                    <td class="font-mono">{{ product.traffic ? product.traffic + ' GB' : '不限' }}</td>
                  </tr>
                  <tr v-if="(product as any).machine">
                    <th>处理器</th>
                    <td class="font-mono">
                      {{ MACHINE_LABELS[(product as any).machine] || (product as any).machine }}
                    </td>
                  </tr>
                  <tr v-if="(product as any).line">
                    <th>网络线路</th>
                    <td class="font-mono">
                      {{ LINE_LABELS[(product as any).line] || (product as any).line }}
                    </td>
                  </tr>
                  <tr v-if="(product as any).chargeType">
                    <th>计费类型</th>
                    <td class="font-mono">
                      {{ CHARGE_TYPE_LABELS[(product as any).chargeType] || (product as any).chargeType }}
                    </td>
                  </tr>
                  <tr>
                    <th>机房地区</th>
                    <td>{{ product.zoneName || product.zone }}</td>
                  </tr>
                  <tr>
                    <th>套餐分组</th>
                    <td>{{ product.group || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 配置选项：OS / 预装软件 / 系统盘扩容 -->
            <div class="config-panel card">
              <div class="panel-head">
                <span class="panel-eyebrow eyebrow">Config</span>
                <h2 class="panel-title">实例配置</h2>
              </div>
              <DecorLine variant="gradient" width="100%" />

              <el-form
                :model="form"
                :rules="rules"
                label-position="top"
                class="config-form"
              >
                <!-- 操作系统：两层结构（发行版 tab + 版本 combobox） ===== -->
                <!-- 第一层：发行版 tab（Debian/Ubuntu/CentOS/Windows/RockyLinux/AlpineLinux/MacOS） -->
                <!-- 第二层：版本 combobox（仅显示该发行版下的版本） -->
                <el-form-item prop="osId">
                  <template #label>
                    <span class="form-label">操作系统</span>
                    <span class="form-label-hint" v-if="product.memory < 2">Windows 需 2GB+ 内存</span>
                  </template>
                  <!-- 发行版 tab -->
                  <div class="os-dist-tabs" v-if="groupedOsList.length">
                    <button
                      v-for="g in groupedOsList"
                      :key="g.dist"
                      type="button"
                      class="os-dist-tab"
                      :class="{ active: currentOsDist === g.dist }"
                      @click="selectOsDist(g.dist)"
                    >
                      {{ g.dist }}
                      <span class="os-dist-count font-mono">{{ g.items.length }}</span>
                    </button>
                  </div>
                  <!-- 版本 combobox（仅显示当前发行版下的版本） -->
                  <el-select
                    v-model="form.osId"
                    placeholder="请选择系统版本"
                    style="width: 100%; margin-top: 10px"
                  >
                    <el-option
                      v-for="os in (groupedOsList.find(g => g.dist === currentOsDist)?.items || [])"
                      :key="os.id"
                      :label="os.name + (os.is_eol ? '（已停止维护）' : '')"
                      :value="os.id"
                    >
                      <span style="float: left">{{ os.name }}</span>
                      <span
                        v-if="os.is_eol"
                        style="float: right; color: var(--warning, #e6a23c); font-size: 11px"
                      >EOL</span>
                      <span
                        v-else-if="os.is_with_bbr"
                        style="float: right; color: var(--success); font-size: 11px"
                      >BBR</span>
                    </el-option>
                  </el-select>
                </el-form-item>

                <!-- 系统盘类型选择（基于 upstreamDiskSelling） ===== -->
                <el-form-item v-if="diskTypeOptions.length">
                  <template #label>
                    <span class="form-label">系统盘类型</span>
                    <span class="form-label-hint">影响扩容单价</span>
                  </template>
                  <div class="disk-type-grid">
                    <button
                      v-for="opt in diskTypeOptions"
                      :key="opt.type"
                      type="button"
                      class="disk-type-card"
                      :class="{ active: form.diskType === opt.type }"
                      @click="form.diskType = opt.type"
                    >
                      <div class="disk-type-head">
                        <span class="disk-type-label">{{ opt.label }}</span>
                        <span v-if="opt.type === 'cloud-ssd'" class="disk-type-tag">推荐</span>
                      </div>
                      <div class="disk-type-price font-mono">
                        ¥{{ opt.price.toFixed(2) }}
                        <span class="disk-type-unit">/GB/月</span>
                      </div>
                    </button>
                  </div>
                </el-form-item>

                <!-- 系统盘扩容：最大 250GB（含套餐自带），单价随盘型变化 -->
                <el-form-item>
                  <template #label>
                    <span class="form-label">系统盘扩容</span>
                    <span class="form-label-hint" v-if="currentDiskTypeMonthly">
                      最大 {{ DISK_MAX_TOTAL }}GB · ¥{{ currentDiskTypeMonthly.toFixed(2) }}/GB/月
                    </span>
                    <span class="form-label-hint" v-else>
                      最大 {{ DISK_MAX_TOTAL }}GB
                    </span>
                  </template>
                  <div class="disk-expand-row">
                    <el-slider
                      v-model="form.addDiskSize"
                      :min="0"
                      :max="diskExpandMax"
                      :step="5"
                      :show-tooltip="false"
                      :disabled="!form.diskType"
                      class="disk-slider"
                    />
                    <div class="disk-value">
                      <span class="disk-num font-mono">{{ form.addDiskSize }}</span>
                      <span class="disk-unit">GB</span>
                    </div>
                  </div>
                  <div class="disk-info-row" v-if="form.addDiskSize > 0 && currentDiskTypeMonthly">
                    <span class="disk-info-text">
                      系统盘总容量：<strong class="font-mono">{{ productDiskSize + form.addDiskSize }}GB</strong>
                      / 扩容月价：<strong class="font-mono text-gold">+¥{{ diskExpandMonthly.toFixed(2) }}</strong>
                    </span>
                  </div>
                  <div class="disk-info-row" v-else>
                    <span class="disk-info-text muted">
                      套餐自带 {{ productDiskSize }}GB，可扩容至 {{ DISK_MAX_TOTAL }}GB
                      <span v-if="!form.diskType">（请先选择系统盘类型）</span>
                    </span>
                  </div>
                </el-form-item>

                <!-- 网络线路（雨云 line 字段：single/opt/3c/bgp/global/sb/iij） ===== -->
                <el-form-item v-if="(product as any).line">
                  <template #label>
                    <span class="form-label">网络线路</span>
                    <span class="form-label-hint">套餐已绑定线路类型</span>
                  </template>
                  <div class="zone-readonly">
                    <span class="zone-readonly-name">{{ LINE_LABELS[(product as any).line] || (product as any).line }}</span>
                    <span class="zone-readonly-code font-mono">{{ (product as any).line }}</span>
                    <span class="zone-readonly-hint">· 不可变更</span>
                  </div>
                </el-form-item>

                <!-- 预装软件：按所选 OS 过滤（os_requirement 正则匹配） ===== -->
                <el-form-item v-if="filteredAppTemplates.length">
                  <template #label>
                    <span class="form-label">预装软件</span>
                    <span class="form-label-hint">
                      兼容当前系统 · 多选
                    </span>
                  </template>
                  <el-checkbox-group v-model="form.selectedAppIds" class="app-checkbox-group">
                    <el-checkbox
                      v-for="app in filteredAppTemplates"
                      :key="app.app_id"
                      :label="app.app_id"
                      class="app-checkbox"
                    >
                      <div class="app-info">
                        <div class="app-name">
                          {{ app.chinese_name || app.name }}
                          <span class="app-name-en font-mono" v-if="app.chinese_name && app.name !== app.chinese_name">
                            {{ app.name }}
                          </span>
                        </div>
                        <div v-if="app.desc" class="app-desc">{{ app.desc }}</div>
                        <div v-if="app.tags && app.tags.length" class="app-tags">
                          <span v-for="t in app.tags" :key="t" class="app-tag font-mono">{{ t }}</span>
                        </div>
                      </div>
                    </el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
                <el-form-item v-else-if="!form.osId">
                  <template #label>
                    <span class="form-label">预装软件</span>
                  </template>
                  <div class="empty-hint">请先选择操作系统</div>
                </el-form-item>
                <el-form-item v-else>
                  <template #label>
                    <span class="form-label">预装软件</span>
                  </template>
                  <div class="empty-hint">当前所选操作系统暂无兼容的预装软件</div>
                </el-form-item>

                <!-- 预装软件的应用变量表单（仅显示已选且有 vars 定义的应用） ===== -->
                <el-form-item v-if="selectedAppsWithVars.length">
                  <template #label>
                    <span class="form-label">应用配置</span>
                    <span class="form-label-hint">已选应用的参数</span>
                  </template>
                  <div class="app-vars-wrap">
                    <div v-for="app in selectedAppsWithVars" :key="app.app_id" class="app-vars-block">
                      <div class="app-vars-title">
                        {{ app.chinese_name || app.name }}
                      </div>
                      <div
                        v-for="v in app.vars"
                        :key="`${app.app_id}:${v.name}`"
                        v-show="shouldShowVar(app, v)"
                        class="app-var-row"
                      >
                        <label class="app-var-label">
                          {{ v.chinese || v.name }}
                          <span v-if="v.desc" class="app-var-desc">{{ v.desc }}</span>
                        </label>
                        <el-select
                          v-if="v.enum && v.enum.length"
                          v-model="form.appVars[`${app.app_id}:${v.name}`]"
                          :placeholder="v.default || '请选择'"
                          clearable
                          style="width: 100%"
                        >
                          <el-option
                            v-for="opt in v.enum"
                            :key="opt"
                            :label="opt"
                            :value="opt"
                          />
                        </el-select>
                        <el-input
                          v-else
                          v-model="form.appVars[`${app.app_id}:${v.name}`]"
                          :placeholder="v.default || ''"
                          clearable
                        />
                      </div>
                    </div>
                  </div>
                </el-form-item>
              </el-form>
            </div>
          </div>

          <!-- 右侧：购买表单（时长 / IP / 数量 / 优惠券 / 价格汇总 / 购买） -->
          <div class="buy-panel card">
            <div class="panel-head">
              <span class="panel-eyebrow eyebrow">Order</span>
              <h2 class="panel-title">立即购买</h2>
            </div>
            <DecorLine variant="gradient" width="100%" />

            <el-form
              ref="formRef"
              :model="form"
              :rules="rules"
              label-position="top"
              class="buy-form"
            >
              <!-- 时长选择 -->
              <el-form-item>
                <template #label>
                  <span class="form-label">购买时长（机器价）</span>
                </template>
                <div class="duration-grid">
                  <button
                    v-for="opt in durationOptions"
                    :key="opt.value"
                    type="button"
                    class="duration-card"
                    :class="{ active: form.duration === opt.value }"
                    :disabled="!priceMap[String(opt.value)]"
                    @click="selectDuration(opt.value)"
                  >
                    <div class="duration-label">{{ opt.label }}</div>
                    <div v-if="getOfficialPrice(opt.value) !== null" class="duration-official font-mono">
                      ¥{{ getOfficialPrice(opt.value)!.toFixed(2) }}
                    </div>
                    <div class="duration-price font-display">
                      {{ formatPrice(priceMap[String(opt.value)] ? Number(priceMap[String(opt.value)]) : null) }}
                    </div>
                    <div v-if="discountLabel" class="duration-discount font-mono">{{ discountLabel }}</div>
                    <div v-else class="duration-discount font-mono">{{ opt.discount }}</div>
                  </button>
                </div>
              </el-form-item>

              <!-- IP 选项（基于上游 ip_prices，NAT 套餐 ip_selling=null 但 ip_prices 非空时也可购买独立 IP） -->
              <el-form-item v-if="ipOptions.length">
                <template #label>
                  <span class="form-label">IP 类型</span>
                  <span class="form-label-hint">机器价不含 IP，请按需选择</span>
                </template>
                <div class="ip-grid">
                  <!-- "不购买独立 IP" 选项卡（仅 NAT 商品显示，默认选中） -->
                  <button
                    v-if="isNatProduct"
                    type="button"
                    class="ip-card ip-card-none"
                    :class="{ active: form.ipType === null }"
                    @click="selectIpType(null)"
                  >
                    <div class="ip-card-head">
                      <span class="ip-label">不购买独立 IP</span>
                      <span class="ip-free-tag ip-tag-none">使用 NAT</span>
                    </div>
                    <div class="ip-price font-display">
                      <span class="ip-price-current">¥0.00</span>
                      <span class="ip-unit">使用共享 IP</span>
                    </div>
                  </button>
                  <button
                    v-for="opt in ipOptions"
                    :key="opt.type || 'default'"
                    type="button"
                    class="ip-card"
                    :class="{ active: form.ipType === opt.type }"
                    @click="selectIpType(opt.type)"
                  >
                    <div class="ip-card-head">
                      <span class="ip-label">{{ opt.label }}</span>
                      <span v-if="opt.isFree" class="ip-free-tag">免费</span>
                    </div>
                    <div class="ip-price font-display">
                      <span v-if="opt.isFree">¥0.00</span>
                      <template v-else>
                        <span class="ip-price-current">+¥{{ opt.price.toFixed(2) }}<span class="ip-unit">/月</span></span>
                        <span v-if="opt.hasDiscount" class="ip-price-original">
                          <span class="price-strike">¥{{ opt.originalPrice.toFixed(2) }}</span>
                          <span class="price-off-tag">{{ Math.round((1 - opt.price / opt.originalPrice) * 100) }}% OFF</span>
                        </span>
                      </template>
                    </div>
                  </button>
                </div>
              </el-form-item>

              <!-- NAT 共享 IP 提示 -->
              <el-form-item v-if="isNatProduct && form.ipType === null">
                <div class="nat-notice">
                  <span class="nat-notice-icon">i</span>
                  <div class="nat-notice-text">
                    <strong>NAT 共享 IP 商品</strong>
                    <p>本套餐为 NAT 共享 IP，默认使用共享 IP（无需额外购买独立 IP）。共享 IP 端口映射可在实例开通后于控制台配置。如需独立 IP，可在上方选择购买。</p>
                  </div>
                </div>
              </el-form-item>

              <!-- IP 数量（上限 5） -->
              <el-form-item v-if="ipOptions.length && currentIpMonthly > 0" prop="ipCount">
                <template #label>
                  <span class="form-label">IP 数量</span>
                  <span class="form-label-hint">最多 {{ IP_MAX_COUNT }} 个</span>
                </template>
                <el-input-number
                  v-model="form.ipCount"
                  :min="1"
                  :max="IP_MAX_COUNT"
                  :step="1"
                  style="width: 100%"
                />
              </el-form-item>

              <!-- 数量 -->
              <el-form-item prop="quantity">
                <template #label>
                  <span class="form-label">购买数量</span>
                </template>
                <el-input-number
                  v-model="form.quantity"
                  :min="1"
                  :max="10"
                  :step="1"
                  style="width: 100%"
                />
              </el-form-item>

              <!-- 优惠券 -->
              <el-form-item>
                <template #label>
                  <span class="form-label">优惠券码</span>
                </template>
                <el-input
                  v-model="form.couponCode"
                  placeholder="如有优惠券请输入，可抵扣订单金额"
                  clearable
                />
              </el-form-item>

              <!-- 价格汇总 -->
              <div class="price-summary">
                <!-- 官方原价（直接显示总价，去掉"机器"字样） -->
                <div class="summary-row">
                  <span class="summary-label">官方原价</span>
                  <span class="summary-value font-mono" v-if="getOfficialPrice(form.duration) !== null">
                    {{ formatPrice(getOfficialPrice(form.duration)!) }}
                    <span class="summary-sub">× {{ form.quantity }}</span>
                  </span>
                  <span class="summary-value font-mono" v-else>—</span>
                </div>
                <!-- 机器小计：与 IP 小计一致（上游原价划线 + 优惠后单价 × 时长 × 数量） -->
                <div class="summary-row">
                  <span class="summary-label">
                    机器小计
                    <span class="summary-sub-label">({{ form.duration }}月)</span>
                  </span>
                  <span class="summary-value font-mono">
                    <!-- 上游原价（划线） -->
                    <span
                      v-if="getOfficialPrice(form.duration) !== null
                        && getMachinePriceForDuration(form.duration) !== null
                        && getOfficialPrice(form.duration)! > getMachinePriceForDuration(form.duration)!"
                      class="summary-original"
                    >¥{{ getOfficialPrice(form.duration)!.toFixed(2) }}</span>
                    <!-- 优惠后单价 -->
                    <span class="summary-value-main">{{ formatPrice(getMachinePriceForDuration(form.duration)) }}</span>
                    <span class="summary-sub">× {{ form.quantity }}</span>
                  </span>
                </div>
                <div v-if="ipOptions.length && ipSubtotal > 0 && form.ipType !== null" class="summary-row">
                  <span class="summary-label">
                    IP 小计
                    <span class="summary-sub-label">({{ getIpTypeLabel(form.ipType) }} × {{ form.ipCount }})</span>
                  </span>
                  <span class="summary-value font-mono">
                    <!-- 上游原价（划线） -->
                    <span
                      v-if="currentIpUpstreamMonthly > 0 && currentIpUpstreamMonthly !== currentIpMonthly"
                      class="summary-original"
                    >¥{{ currentIpUpstreamMonthly.toFixed(2) }}</span>
                    <!-- 优惠后单价 -->
                    <span class="summary-value-main">¥{{ currentIpMonthly.toFixed(2) }}</span>
                    <span class="summary-sub">× {{ form.ipCount }} × {{ form.duration }}月</span>
                  </span>
                </div>
                <div v-if="ipOptions.length && ipSubtotal === 0 && form.ipType !== null" class="summary-row">
                  <span class="summary-label">
                    IP 小计
                    <span class="summary-sub-label">({{ getIpTypeLabel(form.ipType) }})</span>
                  </span>
                  <span class="summary-value font-mono text-free">免费</span>
                </div>
                <!-- NAT 商品默认不显示 IP 小计（共享 IP 免费，无需展示）；用户选购独立 IP 时上方会显示 -->
                <div v-if="diskSubtotal > 0" class="summary-row">
                  <span class="summary-label">
                    系统盘扩容
                    <span class="summary-sub-label">
                      (+{{ form.addDiskSize }}GB · {{ DISK_TYPE_LABELS[form.diskType] || form.diskType }})
                    </span>
                  </span>
                  <span class="summary-value font-mono">
                    <span
                      v-if="currentDiskTypeUpstreamMonthly > 0 && currentDiskTypeUpstreamMonthly !== currentDiskTypeMonthly"
                      class="summary-original"
                    >¥{{ currentDiskTypeUpstreamMonthly.toFixed(2) }}</span>
                    <span class="summary-value-main">¥{{ currentDiskTypeMonthly.toFixed(2) }}</span>
                    <span class="summary-sub">× {{ form.addDiskSize }}GB × {{ form.duration }}月</span>
                  </span>
                </div>
                <div v-if="savedAmount !== null" class="summary-row summary-saved">
                  <span class="summary-label">已为您优惠</span>
                  <span class="saved-value font-mono">- ¥{{ savedAmount.toFixed(2) }}</span>
                </div>
                <div class="divider-dashed"></div>
                <div class="summary-row summary-total">
                  <span class="summary-label">应付总额</span>
                  <div class="summary-total-wrap">
                    <!-- 上游原价总额（划线） -->
                    <span
                      v-if="upstreamTotalPrice !== null && totalPrice !== null && upstreamTotalPrice > totalPrice"
                      class="summary-total-original font-mono"
                    >¥{{ upstreamTotalPrice.toFixed(2) }}</span>
                    <span class="summary-total-value font-display">{{ formatPrice(totalPrice) }}</span>
                  </div>
                </div>
              </div>

              <!-- 购买按钮 -->
              <button
                type="button"
                class="btn-gold buy-button"
                :disabled="submitting || !product.isOnSale"
                @click="handleBuy"
              >
                {{ submitting ? '提交中…' : (auth.isLoggedIn ? '立即购买' : '登录后购买') }}
              </button>

              <div class="buy-tips">
                <span class="tips-dot"></span>
                <span>下单后请在 30 分钟内完成支付，超时订单自动取消</span>
              </div>
            </el-form>
          </div>
        </div>
      </section>

      <!-- 底部说明 Tab -->
      <section class="info-tabs">
        <div class="container">
          <el-tabs class="info-tabs-el">
            <el-tab-pane label="商品说明">
              <div class="tab-content">
                <h3 class="tab-title font-display">商品说明</h3>
                <p class="tab-paragraph">{{ product.description || '本套餐为 RainYun 上游资源，由本平台提供销售与售后服务支持。所有产品均使用企业级硬件，BGP 多线接入，确保您的业务稳定运行。' }}</p>
                <ul class="info-list">
                  <li>所有套餐均使用 NVMe SSD 系统盘，IOPS 表现优异</li>
                  <li>带宽为独享带宽，不与他人共享，保障传输速率</li>
                  <li>支持 IPv4/IPv6 双栈（部分机房），可在控制台切换</li>
                  <li>提供完整控制面板：开关机、重启、重装、快照、流量监控</li>
                </ul>
              </div>
            </el-tab-pane>

            <el-tab-pane label="退款政策">
              <div class="tab-content">
                <h3 class="tab-title font-display">退款政策</h3>
                <ul class="info-list">
                  <li>购买后 24 小时内可申请无理由退款，按已使用时长折算退还</li>
                  <li>超过 24 小时未申请退款，将不再支持无理由退款</li>
                  <li>因违反平台服务条款被下架的实例，不予退款</li>
                  <li>优惠活动套餐按活动规则执行退款政策</li>
                  <li>退款金额将原路返回至账户余额，可在用户中心查看</li>
                </ul>
              </div>
            </el-tab-pane>

            <el-tab-pane label="售后服务">
              <div class="tab-content">
                <h3 class="tab-title font-display">售后服务</h3>
                <ul class="info-list">
                  <li>7×24 小时工单响应，平均响应时间 30 分钟以内</li>
                  <li>提供使用咨询、故障排查、网络优化等技术服务</li>
                  <li>遇到问题可登录后在「用户中心 - 工单」提交工单</li>
                </ul>
                <button type="button" class="btn-outline" @click="contactSupport">提交工单</button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </section>
    </template>

    <!-- 商品不存在时的提示 -->
    <div v-else-if="!loading" class="empty-wrap">
      <el-empty description="商品不存在或已下架">
        <button type="button" class="btn-gold" @click="router.push('/products')">返回商品列表</button>
      </el-empty>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.product-detail-page {
  min-height: 60vh;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 容器 ============
.container {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px;

  @include mobile {
    padding: 0 16px;
  }
}

// ============ 面包屑 ============
.breadcrumb-bar {
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-base);

  .container {
    padding-top: 16px;
    padding-bottom: 16px;

    @include mobile {
      padding-top: 12px;
      padding-bottom: 12px;
    }
  }

  :deep(.el-breadcrumb__item) {
    font-size: 12px;
  }

  :deep(.el-breadcrumb__inner) {
    color: var(--text-tertiary);
    font-weight: 400;
  }

  :deep(.el-breadcrumb__inner.is-link:hover) {
    color: var(--text-gold);
  }
}

// ============ 商品头部 ============
.product-header {
  padding: 64px 0 56px;
  background: var(--bg-base);
  animation: fadeUp 0.6s var(--ease-out-expo) both;

  @include tablet-down {
    padding: 48px 0 40px;
  }

  @include mobile {
    padding: 32px 0 28px;
  }
}

.header-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;

  .eyebrow-dot {
    width: 6px;
    height: 6px;
    background: var(--gold-400);
    display: inline-block;
  }

  .eyebrow-id {
    font-size: 10px;
    color: var(--text-gold);
    letter-spacing: 1px;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
  }

  @include mobile {
    margin-bottom: 12px;
  }
}

.title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;

  @include mobile {
    gap: 10px;
    margin-bottom: 12px;
  }
}

.discount-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
  background: linear-gradient(135deg, var(--gold-400), var(--gold-600));
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(212, 121, 142, 0.35);
}

.product-name {
  font-size: clamp(32px, 4vw, 52px);
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  line-height: 1.15;
  letter-spacing: -0.5px;

  @include mobile {
    font-size: 28px;
  }
}

.product-desc {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0 0 28px;
  max-width: 640px;

  @include mobile {
    font-size: 13px;
    margin-bottom: 20px;
  }
}

// ============ 头部 CTA：区域对比入口 ============
.header-cta {
  margin: 0 0 28px;

  @include mobile {
    margin-bottom: 20px;
  }
}

.zone-compare-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  background: linear-gradient(135deg, rgba(212, 175, 55, 0.10), rgba(212, 175, 55, 0.02));
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 999px;
  color: var(--text-gold);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.3s var(--ease-out-expo, ease);

  .arrow {
    transition: transform 0.3s var(--ease-out-expo, ease);
  }

  &:hover {
    background: linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.06));
    border-color: rgba(212, 175, 55, 0.65);

    .arrow {
      transform: translateX(4px);
    }
  }

  @include mobile {
    padding: 9px 14px;
    font-size: 11px;
    gap: 8px;
  }
}

.zone-compare-icon {
  font-size: 14px;
  font-weight: 700;
}

// ============ 头部 meta：标签 + 快速信息 ============
.header-meta {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;

  @include mobile {
    gap: 14px;
  }
}

.tag-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.product-tag {
  font-size: 11px;
  color: var(--text-gold);
  border: 1px solid var(--border-gold);
  padding: 3px 8px;
  letter-spacing: 0.5px;
}

.meta-divider {
  width: 1px;
  height: 20px;
  background: var(--border-base);

  @include mobile {
    display: none;
  }
}

.quick-info {
  display: flex;
  align-items: center;
  gap: 24px;

  @include mobile {
    gap: 16px;
    flex-wrap: wrap;
  }
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .info-label {
    font-size: 10px;
  }

  .info-value {
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 500;
  }

  .status-on {
    color: var(--success);
  }

  .status-off {
    color: var(--text-tertiary);
  }

  // 网络模式标签
  .status-normal {
    color: var(--success);
  }

  .status-nat {
    color: var(--warning, #e6a23c);
  }

  // 库存紧张高亮
  .stock-low {
    color: var(--warning, #e6a23c);
    font-weight: 600;
  }
}

// NAT 共享 IP 提示框
.nat-notice {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  border-left: 3px solid var(--warning, #e6a23c);
  border-radius: 4px;
  width: 100%;

  .nat-notice-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--warning, #e6a23c);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-style: italic;
    font-family: 'Times New Roman', serif;
  }

  .nat-notice-text {
    flex: 1;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);

    strong {
      display: block;
      color: var(--text-primary);
      margin-bottom: 4px;
      font-size: 14px;
    }

    p {
      margin: 0;
      font-size: 12px;
      color: var(--text-tertiary);
    }
  }
}

// ============ 主体 ============
.product-body {
  padding: 16px 0 64px;
  background: var(--bg-base);

  @include tablet-down {
    padding: 8px 0 48px;
  }

  @include mobile {
    padding: 4px 0 32px;
  }
}

.body-grid {
  display: grid;
  // 左侧承载「规格表 + 配置面板」（内容较多），右侧仅「购买面板」（紧凑）
  // 故左侧给更宽空间，避免右侧空荡；右侧 sticky 跟随滚动
  grid-template-columns: 1.5fr 1fr;
  gap: 32px;
  align-items: start;

  @include tablet-down {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  @include mobile {
    gap: 16px;
  }
}

// 左列容器（规格 + 配置）纵向堆叠
.left-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;

  @include mobile {
    gap: 16px;
  }
}

// ============ 面板通用（规格 + 配置 + 购买） ============
.specs-panel,
.config-panel,
.buy-panel {
  padding: 28px 32px;
  animation: fadeUp 0.6s var(--ease-out-expo) both;

  &:nth-child(2) {
    animation-delay: 0.1s;
  }

  @include tablet-down {
    padding: 24px 28px;
  }

  @include mobile {
    padding: 20px 18px;
  }
}

.buy-panel {
  position: sticky;
  top: 88px;

  @include tablet-down {
    position: static;
  }
}

// 配置表单样式（与购买表单一致）
.config-form {
  margin-top: 20px;

  :deep(.el-form-item) {
    margin-bottom: 20px;
  }

  :deep(.el-form-item__label) {
    padding-bottom: 8px;
    line-height: 1.4;
  }

  :deep(.el-select .el-input__wrapper) {
    border-radius: 4px;
    background: var(--bg-base);
    box-shadow: 0 0 0 1px var(--border-base) inset;

    &:hover {
      box-shadow: 0 0 0 1px var(--gold-300) inset;
    }

    &.is-focus {
      box-shadow: 0 0 0 1px var(--gold-400) inset;
    }
  }
}

// 系统盘扩容信息行
.disk-info-row {
  margin-top: 10px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border-radius: 4px;
  border: 1px dashed var(--border-base);
}

.disk-info-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;

  &.muted {
    color: var(--text-tertiary);
  }

  .text-gold {
    color: var(--text-gold);
    margin-left: 6px;
  }
}

// 预装软件空提示
.empty-hint {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  border: 1px dashed var(--border-base);
  border-radius: 4px;
  background: var(--bg-elevated);
}

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.panel-eyebrow {
  font-size: 10px;
}

.panel-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.2px;

  @include mobile {
    font-size: 18px;
  }
}

// ============ 规格表 ============
.specs-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;

  tr {
    border-bottom: 1px dashed var(--border-base);

    &:last-child {
      border-bottom: none;
    }
  }

  th,
  td {
    padding: 14px 0;
    text-align: left;
    font-size: 14px;
  }

  th {
    color: var(--text-tertiary);
    width: 38%;
    font-weight: 400;
    letter-spacing: 0.3px;
  }

  td {
    color: var(--text-primary);
    font-weight: 500;
    text-align: right;
  }

  @include mobile {
    th,
    td {
      padding: 12px 0;
      font-size: 13px;
    }
  }
}

// ============ 购买表单 ============
.buy-form {
  margin-top: 20px;

  :deep(.el-form-item) {
    margin-bottom: 20px;
  }

  :deep(.el-form-item__label) {
    padding-bottom: 8px;
    line-height: 1.4;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select .el-input__wrapper),
  :deep(.el-input-number .el-input__wrapper) {
    border-radius: 4px;
    background: var(--bg-base);
    box-shadow: 0 0 0 1px var(--border-base) inset;

    &:hover {
      box-shadow: 0 0 0 1px var(--gold-300) inset;
    }

    &.is-focus {
      box-shadow: 0 0 0 1px var(--gold-400) inset;
    }
  }
}

.form-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 2px;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.form-label-hint {
  margin-left: 10px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  text-transform: none;
  opacity: 0.7;
}

// ============ 网络区域只读展示 ============
.zone-readonly {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border-soft, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  width: 100%;
}

.zone-readonly-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}

.zone-readonly-code {
  font-size: 11px;
  color: var(--text-gold);
  padding: 2px 8px;
  background: rgba(212, 175, 55, 0.1);
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.zone-readonly-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  opacity: 0.7;
  margin-left: auto;
}

// ============ 时长按钮组 ============
.duration-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: 100%;

  @include mobile {
    grid-template-columns: repeat(2, 1fr);
  }
}

.duration-card {
  border: 1px solid var(--border-base);
  background: var(--bg-base);
  border-radius: 4px;
  padding: 14px 6px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
  text-align: center;
  font-family: inherit;

  &:hover:not(:disabled) {
    border-color: var(--gold-300);
  }

  &.active {
    border-color: var(--gold-400);
    background: var(--gold-50);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .duration-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 6px;
  }

  .duration-official {
    font-size: 11px;
    color: var(--text-tertiary);
    text-decoration: line-through;
    margin-bottom: 4px;
    line-height: 1;
  }

  .duration-price {
    font-size: 17px;
    font-weight: 600;
    color: var(--text-gold);
    line-height: 1.1;
    margin-bottom: 2px;
  }

  .duration-discount {
    font-size: 10px;
    color: var(--success);
    letter-spacing: 0.5px;
    font-weight: 700;
  }

  @include mobile {
    padding: 12px 4px;

    .duration-label {
      font-size: 11px;
    }

    .duration-price {
      font-size: 15px;
    }
  }
}

// ============ IP 选项卡片组 ============
.ip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  width: 100%;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.ip-card {
  border: 1px solid var(--border-base);
  background: var(--bg-base);
  border-radius: 4px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
  font-family: inherit;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &:hover {
    border-color: var(--gold-300);
  }

  &.active {
    border-color: var(--gold-400);
    background: var(--gold-50);
  }

  .ip-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ip-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .ip-free-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #fff;
    background: var(--success);
    padding: 2px 6px;
    border-radius: 8px;
  }

  .ip-price {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-gold);
    line-height: 1.1;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .ip-unit {
      font-size: 11px;
      font-weight: 400;
      color: var(--text-tertiary);
      margin-left: 2px;
    }

    // 原价 + 折扣标签
    .ip-price-original {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 400;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-tertiary);

      .price-strike {
        text-decoration: line-through;
        text-decoration-color: rgba(244, 67, 54, 0.6);
        text-decoration-thickness: 1px;
      }

      .price-off-tag {
        padding: 1px 5px;
        background: rgba(244, 67, 54, 0.1);
        color: var(--danger);
        border-radius: 4px;
        font-weight: 600;
        font-size: 10px;
        letter-spacing: 0.3px;
      }
    }
  }

  @include mobile {
    padding: 10px 12px;

    .ip-label {
      font-size: 12px;
    }

    .ip-price {
      font-size: 13px;
    }
  }
}

// ============ 价格汇总 ============
.price-summary {
  margin: 8px 0 20px;
  padding: 16px 0;
}

// ============ 系统盘扩容 ============
.disk-expand-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.disk-slider {
  flex: 1;
  min-width: 0;
}

.disk-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--border-base);
  border-radius: 4px;
  background: var(--bg-elevated);
  min-width: 78px;
  justify-content: center;
}

.disk-num {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-gold);
}

.disk-unit {
  font-size: 11px;
  color: var(--text-tertiary);
}

// ============ 预装软件多选 ============
.app-checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  width: 100%;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.app-checkbox {
  display: flex;
  align-items: flex-start;
  margin: 0 !important;
  padding: 10px 12px;
  border: 1px solid var(--border-base);
  border-radius: 6px;
  height: auto;
  transition: border-color 0.2s var(--ease-out-expo), background 0.2s var(--ease-out-expo);

  &:hover {
    border-color: var(--gold-300);
  }

  :deep(.el-checkbox__label) {
    padding-left: 8px;
    line-height: 1.4;
  }
}

.app-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);

  .app-name-en {
    margin-left: 6px;
    font-size: 11px;
    color: var(--text-tertiary);
    font-weight: 400;
  }
}

.app-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

.app-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.app-tag {
  font-size: 10px;
  color: var(--text-gold);
  border: 1px solid var(--border-gold);
  padding: 1px 5px;
  letter-spacing: 0.3px;
}

// ===== OS 发行版 tab =====
.os-dist-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
}

.os-dist-tab {
  border: 1px solid var(--border-base);
  background: var(--bg-base);
  border-radius: 4px;
  padding: 8px 14px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover {
    border-color: var(--gold-300);
    color: var(--text-primary);
  }

  &.active {
    border-color: var(--gold-400);
    background: var(--gold-50);
    color: var(--text-gold);
  }

  .os-dist-count {
    font-size: 10px;
    color: var(--text-tertiary);
    background: var(--bg-elevated);
    padding: 1px 5px;
    border-radius: 8px;
    line-height: 1.4;
  }

  &.active .os-dist-count {
    color: var(--text-gold);
    background: rgba(212, 121, 142, 0.1);
  }
}

// ===== 系统盘类型卡片 =====
.disk-type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  width: 100%;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.disk-type-card {
  border: 1px solid var(--border-base);
  background: var(--bg-base);
  border-radius: 4px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
  font-family: inherit;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &:hover {
    border-color: var(--gold-300);
  }

  &.active {
    border-color: var(--gold-400);
    background: var(--gold-50);
  }

  .disk-type-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .disk-type-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .disk-type-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, var(--gold-400), var(--gold-600));
    padding: 1px 6px;
    border-radius: 8px;
  }

  .disk-type-price {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-gold);
    line-height: 1.1;
  }

  .disk-type-unit {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-tertiary);
  }

  @include mobile {
    padding: 8px 10px;
  }
}

// ===== 预装软件应用变量表单 =====
.app-vars-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.app-vars-block {
  border: 1px dashed var(--border-base);
  border-radius: 6px;
  padding: 12px 14px;
  background: var(--bg-elevated);
}

.app-vars-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--border-base);
}

.app-var-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;

  &:last-child {
    margin-bottom: 0;
  }
}

.app-var-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-var-desc {
  font-size: 10px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  padding: 6px 0;

  .summary-label {
    color: var(--text-secondary);
  }

  .summary-sub-label {
    margin-left: 6px;
    font-size: 11px;
    color: var(--text-tertiary);
    font-weight: 400;
  }

  .summary-value {
    color: var(--text-primary);
    font-weight: 500;
  }

  // IP 小计中的上游原价（划线）
  .summary-original {
    color: var(--text-tertiary);
    text-decoration: line-through;
    text-decoration-color: rgba(244, 67, 54, 0.5);
    text-decoration-thickness: 1px;
    font-weight: 400;
    font-size: 11px;
    margin-right: 6px;
  }

  .summary-value-main {
    color: var(--text-gold);
    font-weight: 600;
  }

  .summary-sub {
    font-size: 11px;
    color: var(--text-tertiary);
    font-weight: 400;
    margin-left: 4px;
  }

  .official-value {
    color: var(--text-tertiary);
    text-decoration: line-through;
    font-weight: 400;
  }

  .text-free {
    color: var(--success);
    font-weight: 700;
  }

  &.summary-saved {
    .summary-label {
      color: var(--success);
      font-weight: 500;
    }

    .saved-value {
      color: var(--success);
      font-weight: 700;
      font-size: 14px;
    }
  }
}

.price-summary .divider-dashed {
  margin: 8px 0;
}

.summary-total {
  padding-top: 4px;

  .summary-label {
    color: var(--text-primary);
    font-weight: 500;
  }

  .summary-total-wrap {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    line-height: 1.1;
  }

  // 上游原价总额（划线）
  .summary-total-original {
    color: var(--text-tertiary);
    text-decoration: line-through;
    text-decoration-color: rgba(244, 67, 54, 0.5);
    text-decoration-thickness: 1px;
    font-weight: 400;
    font-size: 13px;
  }

  .summary-total-value {
    font-size: 26px;
    font-weight: 600;
    color: var(--text-gold);
    letter-spacing: -0.5px;

    @include mobile {
      font-size: 22px;
    }
  }
}

// ============ 购买按钮 ============
.buy-button {
  width: 100%;
  height: 48px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;

  @include mobile {
    height: 44px;
    font-size: 13px;
  }
}

.buy-tips {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.3px;

  .tips-dot {
    width: 4px;
    height: 4px;
    background: var(--gold-400);
    flex-shrink: 0;
  }
}

// ============ 底部 Tab ============
.info-tabs {
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-base);
  padding: 48px 0 80px;

  @include tablet-down {
    padding: 36px 0 64px;
  }

  @include mobile {
    padding: 24px 0 48px;
  }
}

.info-tabs-el {
  :deep(.el-tabs__header) {
    margin-bottom: 32px;
  }

  :deep(.el-tabs__nav-wrap::after) {
    background: var(--border-base);
    height: 1px;
  }

  :deep(.el-tabs__item) {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-tertiary);
    padding: 0 24px 16px;
    height: auto;

    &.is-active {
      color: var(--text-primary);
    }

    &:hover {
      color: var(--text-gold);
    }
  }

  :deep(.el-tabs__active-bar) {
    background: var(--gold-400);
    height: 2px;
  }

  @include mobile {
    :deep(.el-tabs__item) {
      padding: 0 16px 12px;
      font-size: 13px;
    }
  }
}

.tab-content {
  padding: 8px 0;
  line-height: 1.8;
  max-width: 760px;

  .tab-title {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 20px;
    letter-spacing: -0.3px;

    @include mobile {
      font-size: 18px;
      margin-bottom: 16px;
    }
  }

  .tab-paragraph {
    color: var(--text-secondary);
    margin: 0 0 20px;
    font-size: 14px;

    @include mobile {
      font-size: 13px;
    }
  }
}

.info-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;

  li {
    position: relative;
    padding-left: 20px;
    margin-bottom: 10px;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.7;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 11px;
      width: 8px;
      height: 1px;
      background: var(--gold-400);
    }

    @include mobile {
      font-size: 13px;
      padding-left: 16px;
      margin-bottom: 8px;
    }
  }
}

// ============ 空状态 ============
.empty-wrap {
  padding: 120px 24px;
  display: flex;
  justify-content: center;

  @include mobile {
    padding: 60px 16px;
  }
}

// ============ 入场动画 ============
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .product-header,
  .specs-panel,
  .config-panel,
  .buy-panel {
    animation: none;
  }
}

// ============ 小桌面：保留双栏，缩小容器 ============
@include lg-only {
  .container {
    max-width: 1000px;
  }
}
</style>
