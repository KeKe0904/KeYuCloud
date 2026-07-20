import { request } from './http';

export interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  zone: string;
  zoneName: string;
  cpu: number;
  memory: number; // GB（业务层统一使用 GB）
  disk: number;
  bandwidth: number;
  traffic: number;
  trafficType?: string; // unlimited / stacked
  markupRate: number;
  prices: string; // JSON
  upstreamPrices: string; // JSON
  // IP 选项
  upstreamIpPrices?: string; // JSON: {"":5,"hk_ddosip":30}
  upstreamIpSelling?: string; // JSON: ["","hk_ddosip","ipv6"]
  ipPrices?: string; // JSON: 按优惠率重算后的 IP 售价
  defaultIpType?: string;
  // 磁盘选项
  upstreamDiskPrices?: string;
  upstreamDiskSizes?: string;
  upstreamDiskSelling?: string;
  // 网络模式 + 库存
  netMode?: string; // 'normal'=独立IP（可购买独立IP） / 'nat'=NAT共享IP（不可购买独立IP）
  availableStock?: number; // 可用库存：0=无限 / >0=剩余可开数量
  // 服务器代数 / 网络线路 / 计费类型（前端"代数 tab"和"网络区域"用）
  machine?: string; // G6v2 / EPYCv2 / EPYCv3 等
  line?: string; // single / bgp / 3c / opt 等
  chargeType?: string; // package=不限流量 / package_traffic=流量叠加型
  // 通用
  group: string;
  tags: string;
  sortWeight: number;
  isRecommended: boolean;
  isOnSale: boolean;
  salesCount: number;
}

// ===== 预装软件应用变量定义（雨云 user_vars_define） =====
// 支持联动（depend_var / depend_regex）和枚举（enum）
export interface AppVarDefine {
  name: string; // 变量 key
  chinese: string; // 中文标签
  regex?: string; // 校验正则
  desc?: string; // 描述
  default?: string; // 默认值
  depend_var?: string; // 联动变量名（依赖另一变量的值）
  depend_regex?: string; // 联动正则（当 depend_var 的值匹配此正则时，本变量才显示）
  enum?: string[] | null; // 枚举可选项
}

export interface AppTemplate {
  app_id: number;
  name: string;
  chinese_name?: string;
  order?: number;
  tags?: string[];
  // os_requirement 是正则字符串，匹配 OS 的 name 字段
  // 例如 '^(?!bt)(?!win)(?!alpine).*' 表示排除 bt/win/alpine 系统
  //     '^win.*' 表示仅 Windows
  os_requirement?: string;
  icon_url?: string;
  desc?: string;
  detail_desc?: string;
  // 应用变量定义（用于动态渲染表单 + 联动）
  vars?: AppVarDefine[];
}

export interface OsTemplate {
  id: number;
  name: string;
  code?: string;
  version?: string;
  os_type?: 'linux' | 'windows' | string;
  chinese_name?: string;
  icon?: string;
  is_eol?: boolean;
  is_available?: boolean;
  is_with_bbr?: boolean;
  region?: string;
  // order 字段分段：200=Debian / 300=Ubuntu / 400=CentOS / 500=Windows
  //                600=RockyLinux / 700=AlpineLinux / 800=MacOS
  order?: number;
}

// ===== 区域（region/zone）中文映射 =====
// 雨云 region 字段 = 区域代码（如 cn-hk1），套餐已绑定，不可跨区选择
// 数据来源：雨云 /product/rcs/plans 实测 13 个在售区域（2026-07）
//         /product/rcs/os-templates 出现 18 个区域（含即将上线的 5 个）
// 注：cn-hk1/2/3/4 是四个独立节点，雨云官网区分「香港1/2/3/4区」
// 注：cn-sz1/2 是两个独立节点；jp-tk1/2 是两个独立节点
export const NET_ZONE_LABELS: Record<string, string> = {
  // 大陆区域
  'cn-sq1': '江苏宿迁',
  'cn-sy1': '湖北十堰',
  'cn-nb1': '浙江宁波',
  'cn-xy1': '湖北襄阳',
  'cn-cq1': '重庆',
  'cn-gz1': '广东广州',
  'cn-sz1': '广东深圳',
  'cn-sz2': '广东深圳2区',  // OS 列表已出现，plans 暂未售卖
  'cn-sx1': '浙江绍兴',  // 官方购买页：华东浙江 → 绍兴三线BGP
  'cn-wz1': '浙江温州',
  // 香港区域（4 个独立节点）
  'cn-hk1': '香港1区',
  'cn-hk2': '香港2区',
  'cn-hk3': '香港3区',
  'cn-hk4': '香港4区',  // OS 列表已出现，plans 暂未售卖
  // 美国
  'us-la1': '美国洛杉矶1区',
  'us-la2': '美国洛杉矶2区',
  // 亚洲其他
  'jp-tk1': '日本东京',
  'jp-tk2': '日本东京2区',  // OS 列表已出现，plans 暂未售卖
  'kr-se1': '韩国首尔',
  'sg-sg1': '新加坡',
};

// ===== 服务器处理器型号映射 =====
// 雨云 machine 字段：E5v2 / E5v3 / E5v4 / G6v1 / G6v2 / P8v2 / EPYCv2 / EPYCv3
// 数据来源：雨云 /product/rcs/plans 实测 8 种型号（2026-07）
export const MACHINE_LABELS: Record<string, string> = {
  'E5v2': 'Intel Xeon E5 v2',
  'E5v3': 'Intel Xeon E5 v3',
  'E5v4': 'Intel Xeon E5 v4',
  'G6v1': 'Intel Xeon G6 v1（Granite Rapids）',
  'G6v2': 'Intel Xeon G6 v2',
  'P8v2': 'AMD EPYC 8004（Siena）',
  'EPYCv2': 'AMD EPYC 7002（Rome）',
  'EPYCv3': 'AMD EPYC 7003（Milan）',
};

// ===== 网络线路中文映射（雨云 line 字段：single/opt/3c/bgp/global/sb/iij/空） =====
// 数据来源：雨云 /product/rcs/plans 实测 8 种取值（2026-07，含空字符串 121 个套餐）
export const LINE_LABELS: Record<string, string> = {
  'single': '单线（电信）',
  'opt': '优化线路（CN2 GIA）',
  '3c': '三线（电信+联通+移动）',
  'bgp': 'BGP 多线',
  'global': '全球网络',
  'sb': '双线（电信+联通）',
  'iij': '日本 IIJ 线路',
  '': '默认线路',
};

// ===== 系统盘类型映射（雨云 disk_selling 字段：chdd/cloud-hdd/cloud-ssd/hdd/ssd） =====
// 数据来源：雨云 /product/rcs/plans 实测 6 种组合（2026-07）
// chdd = 旧式 Cloud HDD 命名，cloud-hdd = 新式命名（含义相同）
export const DISK_TYPE_LABELS: Record<string, string> = {
  'chdd': '云硬盘 HDD（旧）',
  'cloud-hdd': '云硬盘 HDD',
  'cloud-ssd': '云硬盘 SSD',
  'hdd': '本地 HDD',
  'ssd': '本地 SSD',
};

// ===== 计费类型中文映射 =====
// 雨云 charge_type 实测 3 种取值（2026-07）：
//   package(237 个) / package_old(19 个) / package_traffic(187 个)
export const CHARGE_TYPE_LABELS: Record<string, string> = {
  'package': '不限流量',
  'package_old': '不限流量（旧版）',
  'package_traffic': '流量叠加',
};

export const productApi = {
  list(params?: {
    category?: string;
    zone?: string;
    group?: string;
    trafficType?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    return request.get('/products', params);
  },
  detail(id: number) {
    return request.get(`/products/${id}`);
  },
  osList(region?: string) {
    // 雨云 OS 按 region 分组，不同区域可用 OS 不同
    // 用法：osList() → 所有区域；osList('cn-sq1') → 仅该区域
    const params = region ? { region } : undefined;
    return request.get('/products/meta/os', params);
  },
  zones() {
    return request.get('/products/meta/zones');
  },
  trafficTypes() {
    return request.get('/products/meta/traffic-types');
  },
  appTemplates() {
    return request.get('/products/meta/app-templates');
  },
};
