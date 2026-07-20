import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../common/prisma.service';
import { firstValueFrom } from 'rxjs';
import { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { CryptoUtil } from '../../common/crypto.util';

/**
 * 雨云 V2 API 适配层
 *
 * 双模式：
 * - LIVE: 真实调用 https://api.v2.rainyun.com （需提供 RAINYUN_API_KEY）
 * - MOCK: 本地模拟，无需 API Key，用于开发/测试
 *
 * 所有方法签名统一，业务层无感知。
 */
@Injectable()
export class RainyunService implements OnModuleInit {
  private readonly logger = new Logger('Rainyun');
  // 注：去掉 readonly 以支持后台热更新 API Key
  private apiKey: string;
  private baseUrl: string;
  private mock: boolean;
  private readonly http: AxiosInstance;

  // ===== 雨云 region code → 区域中文名映射 =====
  // 雨云官方 API 不返回区域中文名（仅 region code 如 us-la1），需本地映射
  // 数据来源：雨云官网 https://app.rainyun.com 当前在售区域（13 个，2026-07 实测）
  //          /product/rcs/os-templates 出现 18 个区域（含即将上线的 5 个）
  // 注：cn-hk1/2/3/4 是四个独立节点，雨云官网区分「香港1/2/3/4区」
  // 注：cn-sz1/2 是两个独立节点；jp-tk1/2 是两个独立节点
  // 注：与前端 NET_ZONE_LABELS 保持一致（单一来源真相）
  private static readonly REGION_NAME_MAP: Record<string, string> = {
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
  };

  // ===== MOCK 数据（懒加载，LIVE 模式下不占用内存） =====
  // 优化：原实现将 mockState/mockPlans/mockOs 作为类属性直接初始化，
  //       LIVE 模式下也分配内存（mockState 的 Map 会一直常驻）。
  //       改为 getter 懒加载，仅在首次进入 MOCK 模式时才初始化。
  private _mockState: any = null;
  private _mockPlans: any[] | null = null;
  private _mockOs: any[] | null = null;

  private get mockState(): {
    panelUsers: Map<string, any>;
    rcsInstances: Map<number, any>;
    workorders: Map<number, any>;
    nextRcsId: number;
    nextWorkorderId: number;
    nextTaskId: number;
    panelConfig: any;
    balance: number;
    points: number;
  } {
    if (!this._mockState) {
      this._mockState = {
        panelUsers: new Map<string, any>(),
        rcsInstances: new Map<number, any>(),
        workorders: new Map<number, any>(),
        nextRcsId: 10000,
        nextWorkorderId: 20000,
        nextTaskId: 30000,
        panelConfig: {
          domain: '',
          bg_url: '',
          web_url: '',
          logo: '',
          icon: '',
          title: '云服分销平台',
          panel_name: '产品管理',
          css: '',
          broadcast: '',
        },
        balance: 1000.5,
        points: 200,
      };
    }
    return this._mockState;
  }

  // mock 套餐数据（memory 单位为 MB，syncUpstreamPlans 时会自动换算为 GB）
  // net_mode: 'normal'=独立IP（可购买独立IP）/ 'nat'=NAT共享IP（不可购买独立IP）
  // available_stock: 0=无限库存 / >0=剩余可开数量
  // ip_selling: 在售 IP 类型数组（""=默认IPv4 / "ipv6"=IPv6 / "hk_ddosip"=香港高防IP 等）
  // ip_prices: 各 IP 类型月价（""=默认IPv4月价，与机器价分开计费）
  private get mockPlans(): any[] {
    if (!this._mockPlans) {
      this._mockPlans = [
        {
          id: 1, name: '轻量云 1H1G', zone: 'CN-ZJ', zone_name: '浙江',
          cpu: 1, memory: 1024, disk: 20, bandwidth: 5, traffic: 500,
          prices: { '1': 10, '3': 28, '6': 55, '12': 100 },
          net_mode: 'normal', available_stock: 0,
          ip_selling: ['', 'ipv6'], ip_prices: { '': 5, 'ipv6': 0 },
        },
        {
          id: 2, name: '标准云 2H2G', zone: 'CN-ZJ', zone_name: '浙江',
          cpu: 2, memory: 2048, disk: 40, bandwidth: 10, traffic: 1000,
          prices: { '1': 20, '3': 56, '6': 110, '12': 200 },
          net_mode: 'normal', available_stock: 50,
          ip_selling: ['', 'ipv6'], ip_prices: { '': 5, 'ipv6': 0 },
        },
        {
          id: 3, name: '增强云 4H4G', zone: 'CN-GZ', zone_name: '广东',
          cpu: 4, memory: 4096, disk: 80, bandwidth: 20, traffic: 2000,
          prices: { '1': 40, '3': 112, '6': 220, '12': 400 },
          net_mode: 'normal', available_stock: 30,
          ip_selling: ['', 'ipv6'], ip_prices: { '': 5, 'ipv6': 0 },
        },
        {
          id: 4, name: '高配云 8H8G', zone: 'CN-GZ', zone_name: '广东',
          cpu: 8, memory: 8192, disk: 160, bandwidth: 50, traffic: 5000,
          prices: { '1': 80, '3': 224, '6': 440, '12': 800 },
          net_mode: 'normal', available_stock: 10,
          ip_selling: ['', 'ipv6'], ip_prices: { '': 5, 'ipv6': 0 },
        },
        {
          id: 5, name: '香港轻量 1H1G', zone: 'HK', zone_name: '香港',
          cpu: 1, memory: 1024, disk: 20, bandwidth: 30, traffic: 1000,
          prices: { '1': 25, '3': 70, '6': 138, '12': 250 },
          net_mode: 'normal', available_stock: 0,
          ip_selling: ['', 'ipv6', 'hk_ddosip'], ip_prices: { '': 8, 'ipv6': 0, 'hk_ddosip': 30 },
        },
        {
          id: 6, name: '香港CN2 2H2G', zone: 'HK', zone_name: '香港CN2',
          cpu: 2, memory: 2048, disk: 40, bandwidth: 30, traffic: 0,
          prices: { '1': 35, '3': 98, '6': 192, '12': 350 },
          net_mode: 'normal', available_stock: 0,
          ip_selling: ['', 'ipv6', 'hk_ddosip'], ip_prices: { '': 8, 'ipv6': 0, 'hk_ddosip': 30 },
        },
        {
          id: 7, name: '宁波NAT 2H2G', zone: 'CN-NB', zone_name: '宁波',
          cpu: 2, memory: 2048, disk: 40, bandwidth: 10, traffic: 500,
          prices: { '1': 18, '3': 50, '6': 100, '12': 180 },
          // NAT 共享 IP：无法购买独立 IP，ip_selling 为空数组
          net_mode: 'nat', available_stock: 100,
          ip_selling: [], ip_prices: {},
        },
        {
          id: 8, name: '宁波叠加 4H4G', zone: 'CN-NB', zone_name: '宁波',
          cpu: 4, memory: 4096, disk: 80, bandwidth: 20, traffic: 1000,
          prices: { '1': 35, '3': 98, '6': 192, '12': 350 },
          // 流量叠加型 + NAT 共享 IP
          net_mode: 'nat', available_stock: 80,
          ip_selling: [], ip_prices: {},
        },
      ];
    }
    return this._mockPlans;
  }

  // 雨云官方 RCS OS 模板（基于 /product/rcs/os-templates 返回整理）
  // os_type: linux / windows
  // 注：is_with_bbr 表示系统自带 BBR 拥塞控制（适合大带宽机型）
  private get mockOs(): any[] {
    if (!this._mockOs) {
      this._mockOs = [
        // ===== Linux 系列 =====
        { id: 4, name: 'Debian 12', os_type: 'linux', is_with_bbr: true, is_available: true, is_eol: false },
        { id: 3, name: 'Debian 11', os_type: 'linux', is_with_bbr: true, is_available: true, is_eol: false },
        { id: 31, name: 'Ubuntu 22.04', os_type: 'linux', is_with_bbr: true, is_available: true, is_eol: false },
        { id: 32, name: 'Ubuntu 20.04', os_type: 'linux', is_with_bbr: true, is_available: true, is_eol: false },
        { id: 1, name: 'CentOS 7.9', os_type: 'linux', is_with_bbr: false, is_available: true, is_eol: false },
        { id: 71, name: 'CentOS 7.9 (宝塔面板)', os_type: 'linux', is_with_bbr: false, is_available: true, is_eol: false },
        { id: 33, name: 'AlmaLinux 9', os_type: 'linux', is_with_bbr: true, is_available: true, is_eol: false },
        { id: 34, name: 'Rocky Linux 9', os_type: 'linux', is_with_bbr: true, is_available: true, is_eol: false },
        // ===== Windows 系列（仅 2G+ 内存套餐可选）=====
        { id: 81, name: 'Windows Server 2022', os_type: 'windows', is_with_bbr: false, is_available: true, is_eol: false },
        { id: 82, name: 'Windows Server 2019', os_type: 'windows', is_with_bbr: false, is_available: true, is_eol: false },
        { id: 83, name: 'Windows Server 2016', os_type: 'windows', is_with_bbr: false, is_available: true, is_eol: false },
      ];
    }
    return this._mockOs;
  }

  constructor(
    private config: ConfigService,
    private httpService: HttpService,
    private prisma: PrismaService,
  ) {
    // 构造函数仅用环境变量做初始值（同步，避免阻塞 DI 容器）
    // OnModuleInit 会尝试从数据库加载覆盖（数据库优先级 > 环境变量）
    this.apiKey = this.config.get('RAINYUN_API_KEY', '');
    this.baseUrl = this.config.get('RAINYUN_API_BASE', 'https://api.v2.rainyun.com');
    this.mock = this.config.get('RAINYUN_MOCK') === 'true' || !this.apiKey;
    this.http = this.httpService.axiosRef;
  }

  // 模块初始化时从数据库加载雨云配置（若数据库已配置则覆盖环境变量）
  async onModuleInit() {
    await this.refreshRuntime();
  }

  // ===== 从数据库重新加载雨云配置（运行时热更新入口） =====
  // 优先级：数据库 > 环境变量
  //   - 数据库 RainyunConfig 表存在且 apiKeyEnc 非空 → 用数据库配置
  //   - 数据库为空或不存在 → 回退到环境变量（构造函数已设置的值）
  //   - mockMode=true 强制 MOCK；mockMode=false 且 apiKey 非空 → LIVE 模式
  async refreshRuntime() {
    try {
      const dbConfig = await this.prisma.rainyunConfig.findUnique({ where: { id: 1 } });
      if (dbConfig) {
        // apiBase：数据库非空则用数据库
        if (dbConfig.apiBase) {
          this.baseUrl = dbConfig.apiBase;
        }
        // apiKey：数据库非空则解密使用，否则保留环境变量的值
        if (dbConfig.apiKeyEnc) {
          try {
            this.apiKey = CryptoUtil.decrypt(dbConfig.apiKeyEnc);
          } catch {
            this.logger.warn('数据库中的雨云 API Key 解密失败，保留环境变量值');
          }
        }
        // mockMode：数据库的强制 MOCK 优先；否则按 apiKey 是否为空判断
        if (dbConfig.mockMode) {
          this.mock = true;
        } else {
          this.mock = !this.apiKey;
        }
      }
    } catch (e: any) {
      // 数据库未就绪或表不存在时，静默回退到环境变量
      this.logger.debug(`从数据库加载雨云配置失败，使用环境变量: ${e.message}`);
    }

    if (this.mock) {
      this.logger.warn('🟡 雨云 SDK 运行在 MOCK 模式，所有上游操作均为本地模拟');
    } else {
      this.logger.log('🟢 雨云 SDK 运行在 LIVE 模式');
    }
  }

  // ===== 后台更新 API Key（运行时热更新） =====
  // 由 AdminService 调用：先写入数据库（加密），再调用此方法刷新内存
  async updateApiKey(newApiKey: string, options?: { apiBase?: string; mockMode?: boolean }) {
    this.apiKey = newApiKey || '';
    if (options?.apiBase) {
      this.baseUrl = options.apiBase;
    }
    if (options?.mockMode !== undefined) {
      this.mock = options.mockMode;
    } else {
      // 未显式指定 mockMode 时，按 apiKey 是否为空判断
      this.mock = !this.apiKey;
    }
    this.logger.log(`雨云 API Key 已更新，当前模式: ${this.mock ? 'MOCK' : 'LIVE'}`);
  }

  // ===== 获取当前运行时配置（用于后台展示，apiKey 脱敏） =====
  getRuntimeConfig() {
    return {
      apiKey: this.apiKey
        ? this.apiKey.slice(0, 4) + '****' + this.apiKey.slice(-4)
        : '',
      hasApiKey: !!this.apiKey,
      apiBase: this.baseUrl,
      mockMode: this.mock,
    };
  }

  private get isMock() {
    return this.mock;
  }

  // ============ 通用请求 ============

  private async request<T = any>(
    method: string,
    path: string,
    body?: any,
    params?: any,
    category = 'unknown',
    triggeredBy?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const startedAt = Date.now();

    if (this.isMock) {
      return this.mockDispatch(method, path, body, params);
    }

    try {
      // 列表类接口需要 options 参数（标准 Query JSON），如果未传则补默认值
      const finalParams: any = { ...params };
      const isListPath =
        (path === '/product/rcs/' || path === '/product/rcs') && method === 'GET';
      const isPanelUsersList =
        path === '/product/panel_users/' && method === 'GET';
      if ((isListPath || isPanelUsersList) && !finalParams.options) {
        finalParams.options = JSON.stringify({
          columnFilters: {},
          sort: [],
          page: 1,
          perPage: 50,
        });
      }

      const res = await this.http.request<T>({
        method,
        url,
        data: body,
        params: finalParams,
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      // 记录上游调用日志
      await this.logUpstream(method, url, body, res.status, res.data, Date.now() - startedAt, null, null, category, triggeredBy);

      // 雨云返回结构: { code: 200, data, message }
      const rdata: any = res.data;
      if (rdata && typeof rdata.code === 'number' && rdata.code !== 200) {
        throw new BadRequestException(rdata.message || `雨云 API 错误: ${rdata.code}`);
      }
      return rdata?.data ?? rdata;
    } catch (err: any) {
      const status = err.response?.status || 500;
      const errMsg = err.response?.data?.message || err.response?.data?.msg || err.message;
      await this.logUpstream(method, url, body, status, err.response?.data, Date.now() - startedAt, err.code, errMsg, category, triggeredBy);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`雨云 API 调用失败: ${errMsg}`);
    }
  }

  // ============ 字段映射：把雨云 PascalCase 响应统一转成业务层使用的 snake_case ============

  /** 把 RCS 实例对象（雨云原始 PascalCase）映射为业务层使用的 snake_case 格式 */
  private mapRcsInstance(rcs: any): any {
    if (!rcs || typeof rcs !== 'object') return rcs;
    const plan = rcs.Plan || {};
    const osInfo = rcs.OsInfo || {};
    const node = rcs.Node || {};
    return {
      id: rcs.ID,
      uid: rcs.UID,
      plan_id: rcs.PlanID,
      plan_name: plan.plan_name || '',
      plan_chinese: plan.chinese || '',
      region: plan.region || node.Region || '',
      node_uuid: rcs.NodeUUID,
      node_name: node.ChineseName || node.NodeName || '',
      status: rcs.Status,
      stop_reason: rcs.StopReason,
      os_id: rcs.OsID,
      os_name: rcs.OsName || osInfo.name || '',
      os_chinese_name: osInfo.chinese_name || '',
      os_type: osInfo.os_type || '',
      host_name: rcs.HostName,
      // 注：default_pass（初始 root 密码）不通过 API 暴露
      // 用户需通过雨云官方面板或工单获取/重置密码
      default_pass: undefined,
      ipv4: rcs.MainIPv4 || '',
      int_ipv4: rcs.IntIPv4 || '',
      ipv6: '', // 雨云未直接返回主 IPv6，可通过 EIPList 获取
      zone: rcs.Zone || '',
      zone_name: rcs.Zone || '',
      nat_public_ip: rcs.NatPublicIP || '',
      nat_public_domain: rcs.NatPublicDomain || '',
      net_mode: rcs.NetMode || '',
      vnet_id: rcs.VnetID,
      fw_mode: rcs.FwMode || '',
      traffic_bytes: rcs.TrafficBytes || 0,
      traffic_reset_date: rcs.TrafficResetDate || 0,
      traffic_bytes_day_limit: rcs.TrafficBytesDayLimit || 0,
      traffic_on_limit: rcs.TrafficOnLimit || 0,
      cpu: rcs.CPU ?? plan.cpu ?? 0,
      memory: rcs.Memory ?? plan.memory ?? 0,
      disk: rcs.Disk ?? plan.disk_size?.ssd ?? 0,
      bandwidth: plan.net_out ?? 0,
      net_in: plan.net_in ?? rcs.NetIn ?? 0,
      net_out: plan.net_out ?? rcs.NetOut ?? 0,
      traffic_base_gb: plan.traffic_base_gb ?? 0,
      expire_at: rcs.ExpDate ? new Date(rcs.ExpDate * 1000).toISOString() : null,
      create_date: rcs.CreateDate ? new Date(rcs.CreateDate * 1000).toISOString() : null,
      auto_renew: rcs.AutoRenew || false,
      try: rcs.Try || false,
      tag: rcs.Tag || '',
      unsubscribe_able: rcs.UnsubscribeAble ?? false,
      // 嵌套列表
      nat_list: rcs.NatList || [],
      eip_list: rcs.EIPList || [],
      edisk_list: rcs.EDiskList || [],
      rbs_list: rcs.RBSList || [],
      upgradeable_plans: rcs.UpgradeablePlans || [],
      usage_data: rcs.UsageData || null,
      // ===== 解析后的资源使用率（百分比，0-100）=====
      // 雨云 UsageData 结构：{CPU, MaxMem, FreeMem, UsedMem, Disks:{"/":{Total,Used}}, NetIn, NetOut, DiskRead, DiskWrite}
      // CPU 已是百分比；内存需 (Max-Free)/Max*100；磁盘需 Used/Total*100
      usage_percent: this.parseUsagePercent(rcs.UsageData),
      // 原始字段保留（便于调试）
      _raw: rcs,
    };
  }

  /** 把雨云 UsageData 解析为前端可直接使用的百分比结构 */
  private parseUsagePercent(u: any): any {
    if (!u || typeof u !== 'object') return null;
    const cpuPercent = typeof u.CPU === 'number' ? u.CPU : null;
    let memPercent: number | null = null;
    if (typeof u.MaxMem === 'number' && u.MaxMem > 0) {
      // 雨云返回 FreeMem（可用字节），UsedMem 可能为 0
      const used = typeof u.UsedMem === 'number' && u.UsedMem > 0
        ? u.UsedMem
        : (u.MaxMem - (u.FreeMem || 0));
      memPercent = (used / u.MaxMem) * 100;
    }
    const disks: Record<string, number> = {};
    if (u.Disks && typeof u.Disks === 'object') {
      for (const [mount, d] of Object.entries(u.Disks)) {
        const dd: any = d;
        if (dd && typeof dd.Total === 'number' && dd.Total > 0) {
          disks[mount] = (dd.Used / dd.Total) * 100;
        }
      }
    }
    const diskPercent = Object.values(disks)[0] ?? null;
    return {
      cpu: cpuPercent != null ? Math.round(cpuPercent * 100) / 100 : null,
      memory: memPercent != null ? Math.round(memPercent * 100) / 100 : null,
      disk: diskPercent != null ? Math.round(diskPercent * 100) / 100 : null,
      disks,
      // 网络速率（KB/s）
      net_in_kb: typeof u.NetIn === 'number' ? Math.round(u.NetIn * 100) / 100 : null,
      net_out_kb: typeof u.NetOut === 'number' ? Math.round(u.NetOut * 100) / 100 : null,
      // 磁盘 IO（KB/s）
      disk_read_kb: typeof u.DiskRead === 'number' ? Math.round(u.DiskRead * 100) / 100 : null,
      disk_write_kb: typeof u.DiskWrite === 'number' ? Math.round(u.DiskWrite * 100) / 100 : null,
      // 内存原始字节
      memory_max_bytes: u.MaxMem || null,
      memory_free_bytes: u.FreeMem || null,
      memory_used_bytes: u.UsedMem || null,
      // 磁盘原始字节
      disk_total_bytes: u.Disks?.['/']?.Total || null,
      disk_used_bytes: u.Disks?.['/']?.Used || null,
      // 更新时间（Unix 时间戳）
      update_time: u.UpdateTime || null,
    };
  }

  /** 把 panel_user 对象映射为业务层使用的字段 */
  private mapPanelUser(u: any): any {
    if (!u || typeof u !== 'object') return u;
    return {
      name: u.name,
      password: u.password,
      user_id: u.user_id,
      create_date: u.create_date
        ? new Date(u.create_date * 1000).toISOString()
        : null,
      products: (u.products || []).map((p: any) => ({
        name: p.name,
        product_type: p.product_type,
        product_id: p.product_id,
      })),
      status: 'ACTIVE', // 雨云未返回状态字段，默认 ACTIVE
      localUserId: null,
      localUsername: null,
    };
  }

  /** 把套餐对象映射为业务层使用的字段
   *  兼容两种字段命名：
   *    - LIVE 模式：雨云官方返回 PascalCase（ID/Name/Region/Cpu/Memory/NetMode/AvailableStock/...）
   *    - MOCK 模式：本地 mockPlans 使用 snake_case
   */
  private mapPlan(p: any): any {
    if (!p || typeof p !== 'object') return p;
    // 雨云套餐价格为单一 price（月价，裸机价不含 IP），构造 1/3/6/12 月阶梯
    // 实测雨云上游周期折扣：3月9折, 6月8折, 12月7折（基于 /product/rcs/price 接口实测）
    const monthPrice = Number(p.price ?? p.Price ?? 0);
    const prices: Record<string, number> = {
      '1': monthPrice,
      '3': Math.round(monthPrice * 3 * 0.9 * 100) / 100,
      '6': Math.round(monthPrice * 6 * 0.8 * 100) / 100,
      '12': Math.round(monthPrice * 12 * 0.7 * 100) / 100,
    };
    // 兼容 PascalCase / snake_case 字段读取
    const planName = p.plan_name ?? p.PlanName ?? p.name ?? p.Name ?? '';
    const chinese = p.chinese ?? p.Chinese ?? '';
    const region = p.region ?? p.Region ?? '';
    // 友好的区域中文名：基于雨云 region code 映射（雨云 API 不返回区域中文名）
    // chinese 字段是套餐中文名（如「KVM 入门版」），不是区域名，不能用作 zone_name
    const friendlyZoneName = RainyunService.REGION_NAME_MAP[region] ||
      RainyunService.REGION_NAME_MAP[region.toLowerCase()] || region;
    const diskSize = p.disk_size ?? p.DiskSize ?? {};
    // 系统盘容量：雨云 disk_size 可能含多种盘型键，按优先级取系统盘容量
    // 实测分布（2026-07）：
    //   - ssd(283 个) / cloud-hdd,cloud-ssd,ssd(72 个) / cloud-hdd,cloud-ssd(68 个) / chdd(20 个)
    // 优先级：ssd > cloud-ssd > chdd > hdd > cloud-hdd > 第一个值（兜底）
    // 注：MOCK 模式下若 disk_size 是数字（如 {disk: 20}），则 diskSize 为 {} → 取 p.disk 兜底
    const diskSizeValue =
      diskSize.ssd ?? diskSize.Ssd ??
      diskSize['cloud-ssd'] ?? diskSize.CloudSsd ??
      diskSize.chdd ?? diskSize.Chdd ??
      diskSize.hdd ?? diskSize.Hdd ??
      diskSize['cloud-hdd'] ?? diskSize.CloudHdd ??
      (typeof diskSize === 'object' && Object.keys(diskSize).length > 0
        ? Object.values(diskSize)[0]
        : (p.disk ?? p.Disk ?? 0));
    // 网络模式：normal=独立IP / nat=NAT共享IP
    // 雨云官方 API 无 net_mode 字段，根据 ip_selling 推断：
    //   - ip_selling 为 null/undefined/空数组 → NAT 共享 IP（无法购买独立 IP）
    //   - ip_selling 为非空数组 → 独立 IP 套餐（可购买独立 IP）
    // MOCK 模式下若显式提供 net_mode 字段则优先使用
    const ipSelling = p.ip_selling ?? p.IpSelling ?? null;
    let netMode: string;
    if (p.net_mode ?? p.NetMode) {
      netMode = p.net_mode ?? p.NetMode;
    } else if (!ipSelling || (Array.isArray(ipSelling) && ipSelling.length === 0)) {
      // ip_selling 为 null/undefined/空数组 → NAT 共享 IP
      netMode = 'nat';
    } else {
      netMode = 'normal';
    }
    // 可用库存（雨云官方 available_stock 字段，0 表示无限）
    const availableStock = p.available_stock ?? p.AvailableStock ?? 0;
    return {
      id: p.id ?? p.ID,
      name: planName,
      chinese,
      region,
      zone: region, // 业务层用 zone 字段
      zone_name: friendlyZoneName, // 区域中文名（如「美国洛杉矶1区」），非套餐名
      subtype: (p.subtype ?? p.Subtype) || '',
      // machine: G6v2 / EPYCv2 / EPYCv3 等，前端用作「服务器代数 tab」
      machine: (p.machine ?? p.Machine) || '',
      // line: single / bgp / 3c / opt 等，标识网络线路
      line: (p.line ?? p.Line) || '',
      // charge_type: package=不限流量 / package_traffic=流量叠加型
      charge_type: (p.charge_type ?? p.ChargeType) || '',
      is_free: p.is_free ?? p.IsFree ?? false,
      is_selling: p.is_selling ?? p.IsSelling ?? true,
      cpu: p.cpu ?? p.Cpu ?? 0,
      memory: p.memory ?? p.Memory ?? 0,
      disk: diskSizeValue,
      bandwidth: p.net_out ?? p.NetOut ?? 0,
      net_in: p.net_in ?? p.NetIn ?? 0,
      net_out: p.net_out ?? p.NetOut ?? 0,
      traffic: p.traffic_base_gb ?? p.TrafficBaseGb ?? 0,
      traffic_base_gb: p.traffic_base_gb ?? p.TrafficBaseGb ?? 0,
      price: monthPrice,
      prices,
      // 网络模式：normal=独立IP / nat=NAT共享IP（用于前端判断是否可购买独立IP）
      net_mode: netMode,
      // IP 选项：key=IP类型(""/ipv6/hk_ddosip/...), value=月价
      ip_prices: p.ip_prices ?? p.IpPrices ?? null,
      ip_selling: ipSelling,
      // 磁盘选项：disk_price/disk_size/disk_selling
      // - disk_price: {"cloud-hdd":0.1,"cloud-ssd":0.4,"ssd":0.4,"hdd":0.1} 每种盘型每 GB 月价
      // - disk_size: {"cloud-hdd":100,"cloud-ssd":30,"ssd":30} 每种盘型默认容量
      // - disk_selling: ["ssd","hdd","cloud-ssd","cloud-hdd"] 在售盘型数组
      disk_price: p.disk_price ?? p.DiskPrice ?? null,
      disk_size: diskSize,
      disk_selling: p.disk_selling ?? p.DiskSelling ?? null,
      available_stock: availableStock,
      no_backup: p.no_backup ?? p.NoBackup ?? false,
    };
  }

  /** 把 OS 模板对象映射为业务层使用的字段
   *  兼容两种字段命名：
   *    - LIVE 模式：雨云官方返回 PascalCase（ID/Name/OsType/IsEOL/IsAvailable/ChineseName/...）
   *    - MOCK 模式：本地 mockOs 使用 snake_case（id/name/os_type/is_eol/is_available/chinese_name/...）
   */
  private mapOs(o: any): any {
    if (!o || typeof o !== 'object') return o;
    // 优先 snake_case（MOCK），其次 PascalCase（LIVE）
    const id = o.id ?? o.ID;
    const name = o.name ?? o.Name;
    const chineseName = o.chinese_name ?? o.ChineseName;
    const osType = o.os_type ?? o.OsType ?? '';
    // os_type 兜底推断：根据 name 关键字判断（避免上游未返回 os_type 时前端分组失效）
    const inferredOsType =
      osType ||
      (/windows/i.test(name) || /windows/i.test(chineseName) ? 'windows' : 'linux');
    return {
      id,
      name: chineseName || name,
      code: name,
      version: (o.version ?? o.Version) || '',
      // order 字段分段：200=Debian, 300=Ubuntu, 400=CentOS, 500=Windows,
      //                600=RockyLinux, 700=AlpineLinux, 800=MacOS
      order: o.order ?? o.Order ?? 0,
      os_type: inferredOsType,
      chinese_name: chineseName || '',
      icon: (o.icon ?? o.Icon) || '',
      is_eol: o.is_eol ?? o.IsEOL ?? false,
      is_available: o.is_available ?? o.IsAvailable ?? true,
      is_with_bbr: o.is_with_bbr ?? o.IsWithBbr ?? o.WithBbr ?? false,
      region: (o.region ?? o.Region) || '',
    };
  }

  /** 把账号对象映射为业务层使用的字段 */
  private mapAccount(u: any): any {
    if (!u || typeof u !== 'object') return u;
    return {
      id: u.ID,
      username: u.Name,
      email: u.Email,
      phone: u.Phone,
      balance: u.Money ?? 0,
      points: u.Points ?? 0,
      vip_level: u.VipLevel ?? 0,
      is_agent: u.IsAgent ?? false,
      valid: u.Valid ?? true,
      certify_status: u.CertifyStatus || '',
      register_time: u.RegisterTime
        ? new Date(u.RegisterTime * 1000).toISOString()
        : null,
      last_login: u.LastLogin
        ? new Date(u.LastLogin * 1000).toISOString()
        : null,
      last_login_area: u.LastLoginArea || '',
      login_count: u.LoginCount ?? 0,
      api_key: u.APIKey ? u.APIKey.slice(0, 4) + '****' + u.APIKey.slice(-4) : '',
      _raw: u,
    };
  }

  // 敏感字段脱敏：写入 UpstreamApiLog 前剥离密码/密钥等
  // 注：响应体可能含 DefaultPass（RCS 初始密码）、password（panel_user 创建）、APIKey 等
  private redactSensitive(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const SENSITIVE_KEYS = ['password', 'newPassword', 'oldPassword', 'default_pass', 'defaultPass', 'apiKey', 'api_key', 'secret', 'token', 'cookie'];
    if (Array.isArray(obj)) {
      return obj.map((v) => this.redactSensitive(v));
    }
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      const lk = k.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lk === s || lk.includes(s.toLowerCase()))) {
        out[k] = '***';
      } else if (v && typeof v === 'object') {
        out[k] = this.redactSensitive(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private async logUpstream(method: string, url: string, body: any, status: number | null, response: any, duration: number, code: string | null, msg: string | null, category: string, triggeredBy: string | null) {
    try {
      // 脱敏：避免明文密码/密钥写入审计日志
      const safeBody = body ? this.redactSensitive(body) : null;
      const safeResp = response ? this.redactSensitive(response) : null;
      await this.prisma.upstreamApiLog.create({
        data: {
          method,
          url,
          requestBody: safeBody ? JSON.stringify(safeBody).slice(0, 4000) : null,
          statusCode: status,
          responseBody: safeResp ? JSON.stringify(safeResp).slice(0, 4000) : null,
          durationMs: duration,
          errorCode: code,
          errorMessage: msg,
          category,
          triggeredBy,
        },
      });
    } catch {
      // 日志失败不影响主流程
    }
  }

  // ============ MOCK 路由 ============

  private async mockDispatch(method: string, path: string, body: any, params: any): Promise<any> {
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200)); // 模拟网络延迟

    // GET /user/ - 账号信息
    if (path === '/user/' && method === 'GET') {
      return { username: 'mock_admin', balance: this.mockState.balance, points: this.mockState.points };
    }

    // ============ RCS plans ============
    if (path === '/product/rcs/plans' && method === 'GET') {
      return { plans: this.mockPlans, zones: this.getZones() };
    }

    // RCS OS（统一返回 { os: [...] }，含 os_type 字段）
    if ((path === '/product/rcs/os' || path === '/product/rcs/os-templates') && method === 'GET') {
      return { os: this.mockOs };
    }

    // RCS price
    if (path === '/product/rcs/price' && method === 'GET') {
      const plan = this.mockPlans.find((p) => p.id === Number(params?.plan_id));
      if (!plan) throw new BadRequestException('套餐不存在');
      return { prices: plan.prices, plan: { id: plan.id, name: plan.name } };
    }

    // RCS create
    if (path === '/product/rcs/' && method === 'POST') {
      const id = ++this.mockState.nextRcsId;
      const plan = this.mockPlans.find((p) => p.id === body?.plan_id) || this.mockPlans[0];
      const os = this.mockOs.find((o) => o.id === body?.os_id) || this.mockOs[0];
      const duration = body?.duration || 1;
      const expire = new Date();
      expire.setMonth(expire.getMonth() + duration);
      const instance = {
        id,
        name: `mock-rcs-${id}`,
        plan_id: plan.id,
        plan_name: plan.name,
        zone: plan.zone,
        zone_name: plan.zone_name,
        os_id: os.id,
        os_name: os.name,
        cpu: plan.cpu,
        memory: plan.memory,
        disk: plan.disk,
        bandwidth: plan.bandwidth,
        traffic: plan.traffic,
        state: 'running',
        expire_at: expire.toISOString(),
        ipv4: `10.${Math.floor(id / 100) % 255}.${id % 255}.1`,
        ipv6: `2001:db8::${id}`,
        created_at: new Date().toISOString(),
      };
      this.mockState.rcsInstances.set(id, instance);
      this.mockState.balance -= plan.prices[String(duration)] || 10;
      return { id, task_id: ++this.mockState.nextTaskId, state: 'running', expire_at: instance.expire_at };
    }

    // RCS list
    if (path === '/product/rcs/' && method === 'GET') {
      const list = Array.from(this.mockState.rcsInstances.values());
      return { list, total: list.length };
    }

    // RCS get one
    const rcsMatch = path.match(/^\/product\/rcs\/(\d+)$/);
    if (rcsMatch && method === 'GET') {
      const id = Number(rcsMatch[1]);
      const inst = this.mockState.rcsInstances.get(id);
      if (!inst) throw new BadRequestException('RCS 不存在');
      return inst;
    }

    // RCS actions (start/stop/restart/renew/...)
    // 注：renew 端点带尾部斜杠（/renew/），其他操作不带
    const rcsActionMatch = path.match(/^\/product\/rcs\/(\d+)\/(start|stop|restart|renew|free|reset_password|reinstall)\/?$/);
    if (rcsActionMatch) {
      const id = Number(rcsActionMatch[1]);
      const action = rcsActionMatch[2];
      const inst = this.mockState.rcsInstances.get(id);
      if (!inst) throw new BadRequestException('RCS 不存在');
      if (action === 'start') inst.state = 'running';
      if (action === 'stop') inst.state = 'stopped';
      if (action === 'restart') inst.state = 'running';
      if (action === 'free') {
        this.mockState.rcsInstances.delete(id);
        return { success: true };
      }
      if (action === 'renew') {
        const months = body?.duration || 1;
        const expire = new Date(inst.expire_at);
        expire.setMonth(expire.getMonth() + months);
        inst.expire_at = expire.toISOString();
        return { expire_at: inst.expire_at };
      }
      if (action === 'reset_password' || action === 'reinstall') {
        return { task_id: ++this.mockState.nextTaskId };
      }
      return { success: true };
    }

    // RCS 续费价格查询（GET /product/rcs/{id}/renew/）
    const rcsRenewPriceMatch = path.match(/^\/product\/rcs\/(\d+)\/renew\/?$/);
    if (rcsRenewPriceMatch && method === 'GET') {
      const id = Number(rcsRenewPriceMatch[1]);
      const inst = this.mockState.rcsInstances.get(id);
      if (!inst) throw new BadRequestException('RCS 不存在');
      // Mock：返回各时长续费价格（基于 plan 价格 + 周期折扣）
      const basePrice = inst.plan?.price || 10;
      return {
        prices: {
          '1': basePrice,
          '3': Math.round(basePrice * 3 * 0.9 * 100) / 100,
          '6': Math.round(basePrice * 6 * 0.8 * 100) / 100,
          '12': Math.round(basePrice * 12 * 0.7 * 100) / 100,
        },
      };
    }

    // ============ panel_users ============
    if (path === '/product/panel_users/' && method === 'POST') {
      const name = body?.name;
      const password = body?.password;
      if (!name || !password) throw new BadRequestException('name/password 必填');
      if (this.mockState.panelUsers.has(name)) throw new BadRequestException('panel_user 已存在');
      this.mockState.panelUsers.set(name, { name, password, products: [] });
      return { name, id: Math.floor(Math.random() * 100000) };
    }

    if (path === '/product/panel_users/' && method === 'GET') {
      const list = Array.from(this.mockState.panelUsers.values()).map((u) => ({ name: u.name, products: u.products }));
      return { list, total: list.length };
    }

    if (path === '/product/panel_users/' && method === 'PATCH') {
      const name = body?.name;
      const newPassword = body?.password;
      if (!name) throw new BadRequestException('name 必填');
      const u = this.mockState.panelUsers.get(name);
      if (!u) throw new BadRequestException('panel_user 不存在');
      if (newPassword) u.password = newPassword;
      return { success: true };
    }

    if (path === '/product/panel_users/' && method === 'PUT') {
      // 分配/移除产品
      const name = body?.name;
      const productId = body?.product_id;
      const type = body?.type || 'rcs';
      const action = body?.action || 'add';
      if (!name || !productId) throw new BadRequestException('name/product_id 必填');
      const u = this.mockState.panelUsers.get(name);
      if (!u) throw new BadRequestException('panel_user 不存在');
      if (action === 'add') {
        if (!u.products.find((p: any) => p.id === productId && p.type === type)) {
          u.products.push({ id: productId, type });
        }
      } else {
        u.products = u.products.filter((p: any) => !(p.id === productId && p.type === type));
      }
      return { success: true, products: u.products };
    }

    if (path === '/product/panel_users/' && method === 'DELETE') {
      const name = body?.name;
      this.mockState.panelUsers.delete(name);
      return { success: true };
    }

    // ============ panel_config ============
    if (path === '/product/panel_config' && method === 'GET') {
      return this.mockState.panelConfig;
    }

    if (path === '/product/panel_config' && method === 'PATCH') {
      this.mockState.panelConfig = { ...this.mockState.panelConfig, ...body };
      return this.mockState.panelConfig;
    }

    // ============ workorder ============
    if (path === '/workorder/' && method === 'POST') {
      const id = ++this.mockState.nextWorkorderId;
      const wo = {
        id,
        type: body?.type || 'tech',
        title: body?.title || '',
        content: body?.content || '',
        related_product_id: body?.related_product_id || 0,
        related_product_type: body?.related_product_type || 'rcs',
        is_urgent: body?.is_urgent || false,
        is_authed: body?.is_authed || false,
        status: 'waiting',
        discuss: [{ ID: 1, IsAssist: false, Content: body?.content || '', CreatedAt: new Date().toISOString() }],
        created_at: new Date().toISOString(),
      };
      this.mockState.workorders.set(id, wo);
      // 模拟客服 30 秒后回复
      setTimeout(() => {
        const w = this.mockState.workorders.get(id);
        if (w) {
          w.status = 'answered';
          w.discuss.push({
            ID: w.discuss.length + 1,
            IsAssist: true,
            Content: `您好，已收到您的工单"${w.title}"。Mock 模式自动回复：问题已记录，请稍候。`,
            CreatedAt: new Date().toISOString(),
          });
        }
      }, 30000);
      return wo;
    }

    const woMatch = path.match(/^\/workorder\/(\d+)$/);
    if (woMatch && method === 'GET') {
      const id = Number(woMatch[1]);
      const wo = this.mockState.workorders.get(id);
      if (!wo) throw new BadRequestException('工单不存在');
      return wo;
    }

    if (path === '/workorder/' && method === 'GET') {
      const list = Array.from(this.mockState.workorders.values());
      return { list, total: list.length };
    }

    const woReplyMatch = path.match(/^\/workorder\/(\d+)\/reply_order$/);
    if (woReplyMatch && method === 'POST') {
      const id = Number(woReplyMatch[1]);
      const wo = this.mockState.workorders.get(id);
      if (!wo) throw new BadRequestException('工单不存在');
      wo.discuss.push({
        ID: wo.discuss.length + 1,
        IsAssist: false,
        Content: body?.content || '',
        CreatedAt: new Date().toISOString(),
      });
      return { success: true };
    }

    const woStatusMatch = path.match(/^\/workorder\/(\d+)\/status$/);
    if (woStatusMatch && method === 'PATCH') {
      const id = Number(woStatusMatch[1]);
      const wo = this.mockState.workorders.get(id);
      if (!wo) throw new BadRequestException('工单不存在');
      wo.status = body?.status || wo.status;
      return { success: true, status: wo.status };
    }

    const woRateMatch = path.match(/^\/workorder\/(\d+)\/rate$/);
    if (woRateMatch && method === 'POST') {
      return { success: true };
    }

    this.logger.warn(`MOCK 未匹配: ${method} ${path}`);
    return { success: true, mock: true, path, method };
  }

  private getZones() {
    return [
      { code: 'CN-ZJ', name: '浙江' },
      { code: 'CN-GZ', name: '广东' },
      { code: 'HK', name: '香港' },
    ];
  }

  // ============ 业务方法（业务层调用） ============

  // 上游账号信息（字段统一映射为 snake_case）
  async getAccount() {
    const raw = await this.request('GET', '/user/', null, null, 'user', 'system');
    if (this.isMock) return raw;
    return this.mapAccount(raw);
  }

  // RCS plans（字段统一映射为业务层使用格式）
  async getRcsPlans() {
    const raw = await this.request('GET', '/product/rcs/plans', null, null, 'rcs', 'system');
    if (this.isMock) return raw;
    // 真实接口返回数组；MOCK 返回 { plans, zones }
    const arr: any[] = Array.isArray(raw) ? raw : raw?.plans || [];
    const plans = arr.map((p) => this.mapPlan(p));
    // 过滤掉已停售套餐，避免误同步
    const sellingPlans = plans.filter((p) => p.is_selling);
    return { plans: sellingPlans, zones: this.getZones() };
  }

  // RCS OS（统一返回 { os: [...] }）
  // 注：雨云官方端点为 /product/rcs/os-templates，业务层始终走此端点
  // 雨云 OS 按 region 分组（cn-sq1/cn-wz1/cn-hk1...），不同区域可用 OS 不同
  //   - region 为空：返回所有区域的 OS（兼容旧调用）
  //   - region 非空：仅返回该区域的 OS
  async getRcsOs(region?: string) {
    if (this.isMock) {
      // MOCK 模式：mockOs 不区分 region，直接返回全部（已带 os_type 字段）
      return { os: this.mockOs.map((o) => this.mapOs(o)) };
    }
    const raw = await this.request('GET', '/product/rcs/os-templates', null, null, 'rcs', 'system');
    const arr: any[] = Array.isArray(raw) ? raw : raw?.os || [];
    // 按 region 过滤（雨云 OS 对象含 region 字段，如 "cn-sq1"）
    const targetRegion = (region || '').toLowerCase();
    const filtered = targetRegion
      ? arr.filter((o) => String(o.region || o.Region || '').toLowerCase() === targetRegion)
      : arr;
    // 仅返回可用的 OS（is_eol 仍可返回，前端加 EOL 警告标签）
    const os = filtered
      .filter((o) => o.is_available !== false)
      .map((o) => this.mapOs(o));
    return { os };
  }

  // RCS 价格（真实接口必须传 scene）
  async getRcsPrice(planId: number, duration = 1, scene: 'create' | 'renew' | 'upgrade' = 'create') {
    if (this.isMock) {
      return this.request('GET', '/product/rcs/price', null, { plan_id: planId }, 'rcs', 'system');
    }
    // 真实接口：scene=create 时需 plan_id+duration+os_id+with_eip_num；
    //          scene=renew 时需 product_id+duration+is_old
    const params: any = { scene, duration };
    if (scene === 'create') {
      params.plan_id = planId;
      params.with_eip_num = 0;
    } else {
      params.product_id = planId;
      params.is_old = 'true';
    }
    const raw = await this.request('GET', '/product/rcs/price', null, params, 'rcs', 'system');
    // raw 形如 { detail: { price, agent_price, stock_price, per_scene }, price }
    const detail = raw?.detail || {};
    const perScene = detail.per_scene || {};
    const scenePrice = perScene[scene] ?? detail.price ?? raw?.price ?? 0;
    // 构造 1/3/6/12 月阶梯价
    const monthPrice = Number(scenePrice);
    return {
      prices: {
        '1': monthPrice,
        '3': Math.round(monthPrice * 3 * 0.95 * 100) / 100,
        '6': Math.round(monthPrice * 6 * 0.9 * 100) / 100,
        '12': Math.round(monthPrice * 12 * 0.8 * 100) / 100,
      },
      plan: { id: planId, name: '' },
      detail,
    };
  }

  // 创建 RCS（统一返回 { id, task_id, state, expire_at }）
  // 雨云官方 API 参数：
  //   plan_id        套餐 ID（可选，但业务层必填）
  //   os_id          系统 ID（必需）
  //   duration       时长 1/3/6/12（必需）
  //   add_disk_size  额外硬盘容量 GB（可选，默认 0）
  //   app_vars       预装软件数组 [{app_id, vars}]（可选，空数组=不预装）
  //   zone           内网可用区（可选）
  //   with_eip_num   IP 数量（可选，默认 0）
  //   with_eip_type  IPv4(默认)/IPv6（可选）
  //   with_eip_flags 高防标识，如 us_ddosip/nb_ddosip（可选）
  //   try            是否试用（可选）
  //   with_coupon_id 优惠券 ID（可选，由业务层处理，不直接透传）
  // 注意：雨云 API 不接受 name/password，hostname 与默认密码由雨云自动生成
  async createRcs(params: {
    plan_id: number;
    os_id: number;
    duration: number;
    add_disk_size?: number;
    app_vars?: Array<{ app_id: number; vars: Record<string, string>; retry?: boolean }>;
    zone?: string;
    with_eip_num?: number;
    with_eip_type?: string;
    with_eip_flags?: string;
    try?: boolean;
  }, triggeredBy?: string) {
    // 仅透传雨云 API 接受的字段，过滤掉业务层多余字段
    const body: any = {
      plan_id: params.plan_id,
      os_id: params.os_id,
      duration: params.duration,
    };
    if (params.add_disk_size && params.add_disk_size > 0) {
      body.add_disk_size = params.add_disk_size;
    }
    if (Array.isArray(params.app_vars) && params.app_vars.length) {
      body.app_vars = params.app_vars;
    }
    if (params.zone) body.zone = params.zone;
    if (params.with_eip_num !== undefined) body.with_eip_num = params.with_eip_num;
    if (params.with_eip_type) body.with_eip_type = params.with_eip_type;
    if (params.with_eip_flags) body.with_eip_flags = params.with_eip_flags;
    if (params.try !== undefined) body.try = params.try;

    const raw = await this.request('POST', '/product/rcs/', body, null, 'rcs', triggeredBy);
    if (this.isMock) return raw;
    // 真实接口返回新建 RCS 对象（PascalCase），映射之
    const inst = this.mapRcsInstance(raw);
    return {
      id: inst.id,
      task_id: null, // 创建接口不返回 task_id，需轮询详情状态
      state: inst.status,
      expire_at: inst.expire_at,
    };
  }

  // 获取 RCS 预装软件模板列表
  // 公开端点：GET /product/fast-install-app?product_type=rcs
  // 返回结构：{ code:200, data:[{ID,name,chinese_name,order,hidden,tags,os_requirement,user_vars_define,icon_url,desc,detail_desc,preselect_product}] }
  // 业务层字段映射：
  //   - 过滤 hidden=true（不应展示给用户）
  //   - 过滤 preselect_product 非空（如 Java for rgs 是配套 RGS 产品的应用）
  //   - os_requirement 是匹配 OS name 的正则（如 ^(?!win)(?!alpine).* / ^win.* / (btpanel10|debian12|...) ）
  //   - 同名应用多 OS 变体（如 baota 有 ID=8/9/21 三个），前端按当前 OS name 自动匹配
  //   - user_vars_define 含联动变量（depend_var + depend_regex）
  async getRcsAppTemplates() {
    if (this.isMock) {
      // MOCK 模式：保留少量样本应用，便于开发/测试
      return {
        apps: [
          {
            app_id: 8,
            name: 'baota',
            chinese_name: '宝塔面板（最新版）',
            order: 201,
            tags: ['常用', '面板'],
            os_requirement: '^(?!bt)(?!win)(?!alpine).*',
            icon_url: '',
            desc: '国内火爆服务器运维面板，建站常用',
            detail_desc: '',
            vars: [
              {
                name: 'version',
                chinese: '版本',
                regex: '',
                desc: '',
                default: '11.x',
                depend_var: '',
                depend_regex: '',
                enum: [
                  { text: '9.0 LTS稳定版', value: '9.0 lts' },
                  { text: '10.0 LTS纯净版', value: '10.x' },
                  { text: '11.x 最新版', value: '11.x' },
                ],
              },
            ],
          },
          {
            app_id: 7,
            name: 'docker',
            chinese_name: 'Docker环境',
            order: 401,
            tags: ['常用', '环境'],
            os_requirement: '^(?!win)(?!alpine).*',
            icon_url: '',
            desc: '经典容器运行环境，国内可安装',
            detail_desc: '',
            vars: [],
          },
          {
            app_id: 12,
            name: '1panel',
            chinese_name: '1Panel',
            order: 202,
            tags: ['常用', '面板'],
            os_requirement: '^(?!win)(?!alpine).*',
            icon_url: '',
            desc: '新一代 Linux 服务器运维面板',
            detail_desc: '',
            vars: [],
          },
          {
            app_id: 22,
            name: 'openclaw',
            chinese_name: 'OpenClaw（龙虾）',
            order: 101,
            tags: ['常用', '面板'],
            os_requirement: '^(?!win)(?!alpine).*',
            icon_url: '',
            desc: 'AI 运维助手框架',
            detail_desc: '',
            vars: [],
          },
          {
            app_id: 21,
            name: 'baota',
            chinese_name: '宝塔面板（win版）',
            order: 201,
            tags: ['常用', '面板'],
            os_requirement: '^win.*',
            icon_url: '',
            desc: 'Windows 服务器运维面板',
            detail_desc: '',
            vars: [],
          },
        ],
      };
    }
    const raw = await this.request(
      'GET',
      '/product/fast-install-app',
      null,
      { product_type: 'rcs' },
      'rcs',
      'system',
    );
    const arr: any[] = Array.isArray(raw) ? raw : raw?.data || raw?.apps || [];
    const apps = arr
      .filter((a: any) => !a.hidden)
      .filter((a: any) => !a.preselect_product)
      .map((a: any) => ({
        app_id: a.ID ?? a.id,
        name: a.name,
        chinese_name: a.chinese_name,
        order: a.order ?? 0,
        tags: a.tags ? String(a.tags).split(',').filter(Boolean) : [],
        os_requirement: a.os_requirement || '',
        icon_url: a.icon_url || '',
        desc: a.desc || '',
        detail_desc: a.detail_desc || '',
        vars: (a.user_vars_define || []).map((v: any) => ({
          name: v.name,
          chinese: v.chinese,
          regex: v.regex || '',
          desc: v.desc || '',
          default: v.default || '',
          depend_var: v.depend_var || '',
          depend_regex: v.depend_regex || '',
          enum: Array.isArray(v.enum) ? v.enum : null,
        })),
      }))
      .sort((x: any, y: any) => (x.order || 0) - (y.order || 0));
    return { apps };
  }

  // 获取 RCS 详情（字段统一映射）
  async getRcs(id: number, triggeredBy?: string) {
    const raw = await this.request('GET', `/product/rcs/${id}/`, null, null, 'rcs', triggeredBy);
    if (this.isMock) return raw;
    // 真实接口返回 { Data: {RCS对象}, UpgradeablePlans, RBSList, ... }
    const dataObj = raw?.Data ?? raw;
    return this.mapRcsInstance(dataObj);
  }

  // RCS 操作（start/stop/reboot/changeos/reset-password/free 等）
  // 注：雨云 API 的 renew 端点需要尾部斜杠（POST /product/rcs/{id}/renew/），
  //     其他操作（start/stop/reboot 等）不需要尾部斜杠。
  //     实测：不带尾部斜杠调用 renew 会返回 404 或 500 错误。
  async rcsAction(id: number, action: string, body?: any, triggeredBy?: string) {
    // renew 端点需要尾部斜杠
    const path = action === 'renew'
      ? `/product/rcs/${id}/renew/`
      : `/product/rcs/${id}/${action}`;
    return this.request('POST', path, body, null, 'rcs', triggeredBy);
  }

  // 获取 RCS 续费价格
  // 雨云 API：GET /product/rcs/{id}/renew/（带尾部斜杠）
  // 返回各时长的续费价格（含 1/3/6/12 月）
  async getRcsRenewPrice(id: number, triggeredBy?: string) {
    return this.request('GET', `/product/rcs/${id}/renew/`, null, null, 'rcs', triggeredBy);
  }

  // 重装系统：雨云 POST /product/rcs/{id}/reinstall
  // 请求体：{ os_id, password?, app_vars? }
  //   - os_id: 必填，操作系统 ID（来自 GET /product/rcs/os-templates）
  //   - password: 可选，不传则雨云自动随机生成
  //   - app_vars: 可选，预装软件数组 [{ app_id, vars }]，与创建 RCS 接口格式一致
  async reinstallRcs(
    id: number,
    osId: number,
    password: string | undefined,
    triggeredBy?: string,
    appVars?: Array<{ app_id: number; vars?: Record<string, string> }>,
  ) {
    const body: any = { os_id: osId };
    if (password) body.password = password;
    if (Array.isArray(appVars) && appVars.length) {
      body.app_vars = appVars.map((a) => ({
        app_id: a.app_id,
        vars: a.vars || {},
      }));
    }
    return this.request('POST', `/product/rcs/${id}/reinstall`, body, null, 'rcs', triggeredBy);
  }

  // 获取 OS 模板列表（用于重装系统选择）
  // 返回 [{id, name, chinese_name, os_type, is_with_bbr, is_available, is_eol, region, ...}]
  async listOsTemplates(triggeredBy?: string) {
    const raw = await this.request('GET', '/product/rcs/os-templates', null, null, 'rcs', triggeredBy);
    if (this.isMock) return raw;
    // 真实接口返回 { code:200, data:[{id, name, chinese_name, ...}] }
    return Array.isArray(raw) ? raw : (raw?.Data || raw?.data || []);
  }

  // 创建 panel_user
  async createPanelUser(name: string, password: string, triggeredBy?: string) {
    return this.request('POST', '/product/panel_users/', { name, password }, null, 'panel_user', triggeredBy);
  }

  // 修改 panel_user 密码
  async updatePanelUserPassword(name: string, password: string, triggeredBy?: string) {
    return this.request('PATCH', '/product/panel_users/', { name, password }, null, 'panel_user', triggeredBy);
  }

  // 分配产品给 panel_user
  // 注：雨云实际接受的字段名为 product_type（非 type），实测 type 会返回 10002 输入参数无效
  async assignProductToPanelUser(name: string, productId: number, type = 'rcs', action: 'add' | 'remove' = 'add', triggeredBy?: string) {
    return this.request('PUT', '/product/panel_users/', { name, product_id: productId, product_type: type, action }, null, 'panel_user', triggeredBy);
  }

  // 列出 panel_users（字段统一映射，返回 { list, total }）
  async listPanelUsers() {
    const raw = await this.request('GET', '/product/panel_users/', null, null, 'panel_user', 'system');
    if (this.isMock) return raw;
    // 真实接口返回 { TotalRecords, Records: [...] }
    const records: any[] = raw?.Records || [];
    const list = records.map((u) => this.mapPanelUser(u));
    return { list, total: raw?.TotalRecords ?? list.length };
  }

  // 列出主账号下所有 RCS 服务器（用于后台同步面板设备）
  // 返回标准化的 RCS 实例数组（已 mapRcsInstance 映射）
  async listRcs(triggeredBy?: string) {
    const raw = await this.request('GET', '/product/rcs/', null, null, 'rcs', triggeredBy);
    if (this.isMock) return raw;
    // 真实接口返回 { TotalRecords, Records: [...] }（在 data 字段中）
    const dataObj: any = (raw as any)?.data ?? raw;
    const records: any[] = dataObj?.Records || [];
    return records.map((r) => this.mapRcsInstance(r));
  }

  // 获取指定 panel_user 的产品列表（含产品详情）
  // 返回 [{ product_id, product_type, detail: RCS详情 }]
  async listPanelUserProducts(name: string, triggeredBy?: string) {
    const raw = await this.request('GET', '/product/panel_users/', null, null, 'panel_user', triggeredBy);
    if (this.isMock) return raw;
    const dataObj: any = (raw as any)?.data ?? raw;
    const records: any[] = dataObj?.Records || [];
    const user = records.find((r) => r.name === name);
    if (!user) return [];
    return user.products || [];
  }

  // 获取 panel_config
  async getPanelConfig() {
    return this.request('GET', '/product/panel_config', null, null, 'panel_user', 'system');
  }

  // 更新 panel_config
  async updatePanelConfig(config: any, triggeredBy?: string) {
    return this.request('PATCH', '/product/panel_config', config, null, 'panel_user', triggeredBy);
  }

  // 创建工单
  // 注：雨云官方 API 字段为 snake_case；is_urgent 是 integer (0/1) 不是 boolean
  // 文档：https://apifox.com/apidoc/shared/a4595cc8-44c5-4678-a2a3-eed7738dab03/api-69943087
  async createWorkorder(params: {
    type: string;
    title: string;
    content: string;
    related_product_id?: number;
    related_product_type?: string;
    is_urgent?: number;  // 0=不紧急 / 1=紧急
    is_authed?: boolean;
  }, triggeredBy?: string) {
    return this.request('POST', '/workorder/', params, null, 'workorder', triggeredBy);
  }

  // 获取工单详情
  async getWorkorder(id: number, triggeredBy?: string) {
    return this.request('GET', `/workorder/${id}`, null, null, 'workorder', triggeredBy);
  }

  // 工单回复
  async replyWorkorder(id: number, content: string, triggeredBy?: string) {
    return this.request('POST', `/workorder/${id}/reply_order`, { content }, null, 'workorder', triggeredBy);
  }

  // 更新工单状态
  async updateWorkorderStatus(id: number, status: string, triggeredBy?: string) {
    return this.request('PATCH', `/workorder/${id}/status`, { status }, null, 'workorder', triggeredBy);
  }

  // 评分工单
  async rateWorkorder(id: number, rating: number, triggeredBy?: string) {
    return this.request('POST', `/workorder/${id}/rate`, { rating }, null, 'workorder', triggeredBy);
  }

  isMockMode() {
    return this.isMock;
  }
}
