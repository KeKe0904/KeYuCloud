/**
 * 商品价格/规格计算工具函数
 * 统一 IP_TYPE_LABELS / DURATION_DISCOUNT / getStartingPrice 等常量与函数，
 * 避免在 portal/Home.vue、portal/Products.vue、portal/ProductDetail.vue、
 * admin/Products.vue 之间重复定义导致行为不一致。
 */

// ============ IP 类型中文映射 ============
export const IP_TYPE_LABELS: Record<string, string> = {
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

// ============ 周期折扣映射 ============
// 实测雨云上游周期折扣：1月=原价, 3月=9折, 6月=8折, 12月=7折
export const DURATION_DISCOUNT: Record<string, number> = {
  '1': 1.0,
  '3': 0.9,
  '6': 0.8,
  '12': 0.7,
};

// 时长选项（供前端下拉使用）
export const DURATION_OPTIONS = [
  { value: 1, label: '1 个月', discount: '原价' },
  { value: 3, label: '3 个月', discount: '9 折' },
  { value: 6, label: '6 个月', discount: '8 折' },
  { value: 12, label: '12 个月', discount: '7 折' },
];

// ============ 通用解析函数 ============

/**
 * 安全解析 JSON 字段（prices / spec / ipSelling 等可能是对象或字符串）
 */
export function parseJsonField<T = any>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val || 'null') ?? fallback; } catch { return fallback; }
  }
  return val as T;
}

/**
 * 获取 IP 类型中文名
 */
export function getIpTypeLabel(ipType: string): string {
  return IP_TYPE_LABELS[ipType] ?? (ipType || '默认 IPv4');
}

/**
 * 取本站机器月价（已优惠后售价，周期=1月）
 */
export function getSellPrice(product: any, cycle: string = '1'): number {
  if (!product) return 0;
  const prices = parseJsonField<any>(product.prices, {});
  return Number(prices?.[cycle] ?? 0);
}

/**
 * 取上游机器月价（原价，周期=1月）
 */
export function getUpstreamMonthlyPrice(product: any): number {
  if (!product) return 0;
  const upstreamPrices = parseJsonField<any>(product.upstreamPrices, {});
  return Number(upstreamPrices?.['1'] ?? 0);
}

/**
 * 取本站 IP 月价（已优惠后售价，按 IP 类型）
 */
export function getSellIpPrice(product: any, ipType: string = ''): number {
  if (!product) return 0;
  const prices = parseJsonField<any>(product.ipPrices, {});
  return Number(prices?.[ipType] ?? 0);
}

/**
 * 取上游 IP 月价（原价，按 IP 类型）
 */
export function getUpstreamIpPrice(product: any, ipType: string = ''): number {
  if (!product) return 0;
  const prices = parseJsonField<any>(product.upstreamIpPrices, {});
  return Number(prices?.[ipType] ?? 0);
}

/**
 * 默认 IP（空串）的售价
 */
export function getDefaultIpPrice(product: any): number {
  return getSellIpPrice(product, '');
}

/**
 * 起售价 = 机器月价 + 默认 IP 月价（最准确的起售价计算）
 * 与 admin/Products.vue 保持一致，避免列表页与详情页价格不同。
 */
export function getStartingPrice(product: any): number | null {
  if (!product) return null;
  const machine = getSellPrice(product, '1');
  const ip = getDefaultIpPrice(product);
  const total = machine + ip;
  return total > 0 ? total : null;
}

/**
 * 获取在售 IP 选项列表（按价格升序）
 */
export function getIpOptions(product: any): { type: string; label: string; price: number }[] {
  if (!product) return [];
  const selling = parseJsonField<string[]>(product.upstreamIpSelling, []);
  if (!Array.isArray(selling) || !selling.length) return [];
  return selling
    .map((t: string) => ({
      type: t,
      label: getIpTypeLabel(t),
      price: getSellIpPrice(product, t),
    }))
    .sort((a, b) => a.price - b.price);
}

/**
 * IP 选项数量
 */
export function getIpOptionsCount(product: any): number {
  const selling = parseJsonField<string[]>(product.upstreamIpSelling, []);
  return Array.isArray(selling) ? selling.length : 0;
}

/**
 * 获取周期折扣价（机器月价 × 折扣 × 月数）
 */
export function getCyclePrice(product: any, cycle: number): number {
  const monthly = getSellPrice(product, '1');
  const discount = DURATION_DISCOUNT[String(cycle)] ?? 1.0;
  return monthly * discount * cycle;
}

/**
 * 获取优惠标签（如 "9折" / "8折"）
 */
export function getDiscountLabel(cycle: number): string {
  return DURATION_OPTIONS.find((o) => o.value === cycle)?.discount || '';
}

/**
 * 节省金额（1月周期，上游原价 - 本站售价）
 */
export function getSavedAmount(product: any): number {
  const up = getUpstreamMonthlyPrice(product);
  const sell = getSellPrice(product, '1');
  if (!up || !sell) return 0;
  return Math.max(0, up - sell);
}
