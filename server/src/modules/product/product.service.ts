// 商品服务 — 上游同步 / 前台列表 / 管理后台 CRUD
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { RainyunService } from '../rainyun/rainyun.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { parsePaging } from '../../common/api-response';

// 默认优惠率：-0.10 表示比上游便宜 10%（即 9 折）
// 注：字段名仍叫 markupRate 是历史命名，负数=优惠、正数=加价、0=原价
const DEFAULT_MARKUP_RATE = -0.10;

@Injectable()
export class ProductService {
  private readonly logger = new Logger('Product');

  constructor(
    private prisma: PrismaService,
    private rainyun: RainyunService,
  ) {}

  // ===== 工具方法：售价 = 上游价 × (1 + markupRate)，四舍五入到 0.01 =====
  // 适用于机器月价、IP 月价、磁盘月价等所有"按月计费"的价格
  recalcPrice(
    upstreamPrices: Record<string, number>,
    markupRate: number,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [duration, price] of Object.entries(upstreamPrices)) {
      const sell = Number(price) * (1 + markupRate);
      result[duration] = sell.toFixed(2);
    }
    return result;
  }

  // ===== IP 价格重算：ip_prices 是 {ipType: 月价}，按优惠率重算 =====
  recalcIpPrices(
    upstreamIpPrices: Record<string, number>,
    markupRate: number,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [ipType, price] of Object.entries(upstreamIpPrices)) {
      // 0 元的（如 IPv6 免费）保持 0，不应用优惠（避免出现 -0.00）
      if (Number(price) === 0) {
        result[ipType] = '0.00';
        continue;
      }
      const sell = Number(price) * (1 + markupRate);
      result[ipType] = sell.toFixed(2);
    }
    return result;
  }

  // ===== 计算订单总价：机器月价 + IP 月价 × IP数，乘周期 =====
  // 入参：machineMonthly = 机器月价（已优惠）, ipMonthly = IP 月价（已优惠）
  //      ipCount = IP 数量, duration = 1/3/6/12 月
  // 出参：{ totalAmount, machineSubtotal, ipSubtotal, durationDiscount }
  calcTotalPrice(
    machineMonthly: number,
    ipMonthly: number,
    ipCount: number,
    duration: number,
  ): {
    totalAmount: number;
    machineSubtotal: number;
    ipSubtotal: number;
    durationDiscount: number;
  } {
    // 周期折扣（实测雨云上游）：1月=1.0, 3月=0.9, 6月=0.8, 12月=0.7
    const discountMap: Record<number, number> = {
      1: 1.0,
      3: 0.9,
      6: 0.8,
      12: 0.7,
    };
    const durationDiscount = discountMap[duration] ?? 1.0;
    const machineSubtotal = machineMonthly * duration * durationDiscount;
    const ipSubtotal = ipMonthly * Math.max(1, ipCount) * duration * durationDiscount;
    const totalAmount = machineSubtotal + ipSubtotal;
    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      machineSubtotal: Math.round(machineSubtotal * 100) / 100,
      ipSubtotal: Math.round(ipSubtotal * 100) / 100,
      durationDiscount,
    };
  }

  // ===== 1. 同步上游套餐 =====
  // 调度策略：每小时检查一次系统配置
  //   - auto_sync_upstream = false → 跳过
  //   - auto_sync_upstream = true 且当前小时 = auto_sync_hour → 执行同步
  //   - 同一天只同步一次（lastSyncDate 防重复）
  private lastSyncDate: string = ''; // YYYY-MM-DD 格式，避免同一天多次同步
  @Cron('0 * * * *')
  async scheduledSyncUpstreamPlans() {
    // 读取系统配置
    const autoSyncRow = await this.prisma.systemConfig.findUnique({
      where: { key: 'auto_sync_upstream' },
    });
    const autoSyncHourRow = await this.prisma.systemConfig.findUnique({
      where: { key: 'auto_sync_hour' },
    });

    const autoSync = autoSyncRow?.value === 'true';
    if (!autoSync) return;

    const configuredHour = autoSyncHourRow ? parseInt(autoSyncHourRow.value, 10) : 3;
    const currentHour = new Date().getHours();
    if (Number.isNaN(configuredHour) || currentHour !== configuredHour) return;

    // 同一天只同步一次
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastSyncDate === today) return;
    this.lastSyncDate = today;

    this.logger.log(
      `触发自动同步（配置时间 ${String(configuredHour).padStart(2, '0')}:00）`,
    );
    await this.syncUpstreamPlans();
  }

  // 实际同步逻辑（可被 scheduledSyncUpstreamPlans / 手动 syncUpstreamPlans 调用）
  async syncUpstreamPlans() {
    this.logger.log('开始同步上游套餐...');
    try {
      const { plans } = await this.rainyun.getRcsPlans();
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let migrated = 0; // 一次性迁移：把老加价率改为优惠率

      // ===== 一次性迁移逻辑（按需执行，无数据时只查一次 count 不全表扫描） =====
      // 优化：原实现每次同步都 findMany 全表 + 逐行 update，对几百条商品的库压力很大
      //       改为：先用 count 判断是否有需要迁移的数据，无则跳过；有则批量处理

      // 1) markupRate > 0 的老商品迁移（仅当存在时才执行）
      const staleCount = await this.prisma.product.count({
        where: { markupRate: { gt: 0 } },
      });
      if (staleCount > 0) {
        const staleProducts = await this.prisma.product.findMany({
          where: { markupRate: { gt: 0 } },
          select: { id: true, upstreamPrices: true, upstreamIpPrices: true },
        });
        for (const p of staleProducts) {
          const upstreamPrices: Record<string, number> = p.upstreamPrices
            ? JSON.parse(p.upstreamPrices)
            : {};
          const newPrices = JSON.stringify(
            this.recalcPrice(upstreamPrices, DEFAULT_MARKUP_RATE),
          );
          const updateData: any = {
            markupRate: DEFAULT_MARKUP_RATE,
            prices: newPrices,
            upstreamChanged: false,
          };
          if (p.upstreamIpPrices) {
            try {
              const upstreamIpPrices: Record<string, number> = JSON.parse(p.upstreamIpPrices);
              updateData.ipPrices = JSON.stringify(
                this.recalcIpPrices(upstreamIpPrices, DEFAULT_MARKUP_RATE),
              );
            } catch {}
          }
          await this.prisma.product.update({
            where: { id: p.id },
            data: updateData,
          });
          migrated++;
        }
        this.logger.log(`迁移完成：${migrated} 个商品由加价模式切换为 9 折优惠模式`);
      }

      // 2) memory > 128 的老商品 MB→GB 迁移（仅当存在时才执行）
      const mbCount = await this.prisma.product.count({
        where: { memory: { gt: 128 } },
      });
      if (mbCount > 0) {
        const mbProducts = await this.prisma.product.findMany({
          where: { memory: { gt: 128 } },
          select: { id: true, memory: true },
        });
        for (const p of mbProducts) {
          const gb = Math.ceil((p.memory as number) / 1024);
          await this.prisma.product.update({
            where: { id: p.id },
            data: { memory: gb },
          });
        }
        this.logger.log(`内存单位迁移完成：${mbCount} 个商品由 MB 换算为 GB`);
      }

      // 3) trafficType 推断迁移（仅扫描字段为空或默认值的商品，不全表）
      // 优化：原实现 findMany() 全表扫描，对每条记录做 inferTrafficType
      //       改为：只扫描 trafficType 为空或 'standard'（默认值）的商品
      const trafficPending = await this.prisma.product.count({
        where: {
          OR: [
            { trafficType: null },
            { trafficType: '' },
            { trafficType: 'standard' },
          ],
        },
      });
      if (trafficPending > 0) {
        const pendingProducts = await this.prisma.product.findMany({
          where: {
            OR: [
              { trafficType: null },
              { trafficType: '' },
              { trafficType: 'standard' },
            ],
          },
          select: { id: true, zone: true, zoneName: true, name: true },
        });
        let trafficMigrated = 0;
        for (const p of pendingProducts) {
          const inferred = this.inferTrafficType({
            zone: p.zone,
            zoneName: p.zoneName,
            name: p.name,
          });
          if (inferred && inferred !== 'standard') {
            await this.prisma.product.update({
              where: { id: p.id },
              data: { trafficType: inferred },
            });
            trafficMigrated++;
          }
        }
        if (trafficMigrated > 0) {
          this.logger.log(`流量类型迁移完成：${trafficMigrated} 个商品 trafficType 被重新推断`);
        }
      }

      for (const plan of plans) {
        // 构建上游机器价格 JSON（不含 IP）
        const upstreamPrices: Record<string, number> = {};
        if (plan.prices) {
          for (const [k, v] of Object.entries(plan.prices)) {
            upstreamPrices[k] = Number(v);
          }
        }
        const upstreamPricesJson = JSON.stringify(upstreamPrices);

        // 上游 IP 价格 JSON（如 {"":5,"hk_ddosip":30,"ipv6":0}）
        const upstreamIpPrices: Record<string, number> = {};
        if (plan.ip_prices && typeof plan.ip_prices === 'object') {
          for (const [k, v] of Object.entries(plan.ip_prices)) {
            upstreamIpPrices[k] = Number(v);
          }
        }
        const upstreamIpPricesJson = JSON.stringify(upstreamIpPrices);
        const upstreamIpSellingJson = JSON.stringify(plan.ip_selling || []);

        // 上游磁盘价格 JSON
        const upstreamDiskPricesJson = JSON.stringify(plan.disk_price || {});
        const upstreamDiskSizesJson = JSON.stringify(plan.disk_size || {});
        const upstreamDiskSellingJson = JSON.stringify(plan.disk_selling || []);

        const existing = await this.prisma.product.findFirst({
          where: { upstreamPlanId: plan.id },
        });

        if (existing) {
          // 对比上游机器价或 IP 价是否变化
          const changed =
            existing.upstreamPrices !== upstreamPricesJson ||
            existing.upstreamIpPrices !== upstreamIpPricesJson;
          const data: any = {
            upstreamPlanName: plan.name,
            // 同步官方名称到本地 name 字段（确保和官方一致）
            name: plan.name,
            zone: plan.zone,
            zoneName: plan.zone_name,
            cpu: plan.cpu,
            memory: this.normalizeMemory(plan.memory),
            disk: plan.disk,
            bandwidth: plan.bandwidth,
            traffic: plan.traffic,
            trafficType: this.inferTrafficType(plan),
            upstreamPrices: upstreamPricesJson,
            upstreamIpPrices: upstreamIpPricesJson,
            upstreamIpSelling: upstreamIpSellingJson,
            upstreamDiskPrices: upstreamDiskPricesJson,
            upstreamDiskSizes: upstreamDiskSizesJson,
            upstreamDiskSelling: upstreamDiskSellingJson,
            // 网络模式 + 库存同步
            netMode: plan.net_mode || 'normal',
            availableStock: Number(plan.available_stock ?? 0),
            // 服务器代数 / 网络线路 / 计费类型（前端"代数 tab"用）
            machine: plan.machine || '',
            line: plan.line || '',
            chargeType: plan.charge_type || '',
          };
          if (changed) {
            // 上游价格变化 → 按当前优惠率重算机器售价 + IP 售价 + 标记待复核
            const markupRate = Number(existing.markupRate);
            data.prices = JSON.stringify(this.recalcPrice(upstreamPrices, markupRate));
            data.ipPrices = JSON.stringify(this.recalcIpPrices(upstreamIpPrices, markupRate));
            data.upstreamChanged = true;
            updated++;
          } else {
            unchanged++;
          }
          await this.prisma.product.update({ where: { id: existing.id }, data });
        } else {
          // 新建商品，使用默认优惠率（9 折）
          const pricesJson = JSON.stringify(
            this.recalcPrice(upstreamPrices, DEFAULT_MARKUP_RATE),
          );
          const ipPricesJson = JSON.stringify(
            this.recalcIpPrices(upstreamIpPrices, DEFAULT_MARKUP_RATE),
          );
          await this.prisma.product.create({
            data: {
              name: plan.name,
              upstreamPlanId: plan.id,
              upstreamPlanName: plan.name,
              category: 'RCS',
              zone: plan.zone,
              zoneName: plan.zone_name,
              cpu: plan.cpu,
              memory: this.normalizeMemory(plan.memory),
              disk: plan.disk,
              bandwidth: plan.bandwidth,
              traffic: plan.traffic,
              trafficType: this.inferTrafficType(plan),
              upstreamPrices: upstreamPricesJson,
              markupRate: DEFAULT_MARKUP_RATE,
              prices: pricesJson,
              upstreamIpPrices: upstreamIpPricesJson,
              upstreamIpSelling: upstreamIpSellingJson,
              ipPrices: ipPricesJson,
              defaultIpType: '',
              upstreamDiskPrices: upstreamDiskPricesJson,
              upstreamDiskSizes: upstreamDiskSizesJson,
              upstreamDiskSelling: upstreamDiskSellingJson,
              // 网络模式 + 库存同步
              netMode: plan.net_mode || 'normal',
              availableStock: Number(plan.available_stock ?? 0),
              // 服务器代数 / 网络线路 / 计费类型
              machine: plan.machine || '',
              line: plan.line || '',
              chargeType: plan.charge_type || '',
              isOnSale: true,
            },
          });
          created++;
        }
      }

      this.logger.log(
        `同步完成: 共 ${plans.length} 个套餐，新建 ${created}，更新 ${updated}，未变 ${unchanged}，迁移 ${migrated}`,
      );
      return { total: plans.length, created, updated, unchanged, migrated };
    } catch (e: any) {
      this.logger.error(`同步上游套餐失败: ${e.message}`);
      throw e;
    }
  }

  // ===== 2. 前台列表：只返回 isOnSale=true =====
  async listProducts(query: any) {
    const where: any = { isOnSale: true };
    if (query.category) where.category = query.category;
    if (query.zone) where.zone = query.zone;
    if (query.group) where.group = query.group;
    if (query.trafficType) where.trafficType = query.trafficType;
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { description: { contains: query.keyword } },
      ];
    }
    const list = await this.prisma.product.findMany({
      where,
      orderBy: [{ sortWeight: 'desc' }, { id: 'desc' }],
    });
    return list.map((p) => this.formatProduct(p));
  }

  // ===== 推断流量类型：基于 zone / zoneName / 套餐名 =====
  // 雨云官方说明：所有 RCS 区域都是无限流量，其中宁波区域为流量叠加型（每月不清零无限叠加）
  // 业务层只保留两种流量类型：
  //   - stacked：流量叠加型（宁波区域，每月不清零无限叠加）
  //   - unlimited：无限流量型（其它所有区域）
  private inferTrafficType(plan: any): string {
    const zone = String(plan.zone || plan.region || '').toLowerCase();
    const zoneName = String(plan.zone_name || plan.zoneName || plan.chinese || '').toLowerCase();
    const name = String(plan.name || plan.plan_name || '').toLowerCase();

    // 关键词命中：流量叠加型（仅宁波区域）
    if (
      zone.includes('nb') || // cn-nb1 / CN-NB
      zoneName.includes('宁波') ||
      name.includes('叠加')
    ) {
      return 'stacked';
    }

    // 其它所有区域（含香港、美国、日本、宿迁、十堰、襄阳、重庆、深圳、陕西等）→ 无限流量
    return 'unlimited';
  }

  // ===== 内存单位换算：雨云上游返回 MB，业务层统一存储为 GB =====
  // - 1024 MB → 1 GB（向上取整避免 768MB 被 floor 成 0）
  // - 已是 GB 的（值 ≤ 16 视为 GB，因为 MB 换算前通常 ≥ 512）
  // 注：syncUpstreamPlans 同步时调用
  private normalizeMemory(mb: number | null | undefined): number | null {
    if (mb === null || mb === undefined || isNaN(mb)) return null;
    if (mb <= 0) return 0;
    // 上游 memory 通常为 512/1024/2048/4096/8192 等 MB 值
    // 若值 ≤ 128，认为已经是 GB，原样返回
    if (mb <= 128) return Math.round(mb);
    // 否则视为 MB，换算为 GB（向上取整）
    return Math.ceil(mb / 1024);
  }

  // ===== 3. 商品详情 =====
  async getProduct(id: number) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('商品不存在');
    return this.formatProduct(p);
  }

  // ===== 4. 管理后台列表（全部商品，分页） =====
  async listProductsAdmin(query: any) {
    const { page, pageSize, skip } = parsePaging(query);
    const where: any = {};
    if (query.category) where.category = query.category;
    if (query.zone) where.zone = query.zone;
    if (query.group) where.group = query.group;
    if (query.isOnSale !== undefined && query.isOnSale !== '') {
      where.isOnSale = query.isOnSale === 'true' || query.isOnSale === true;
    }
    if (query.upstreamChanged !== undefined && query.upstreamChanged !== '') {
      where.upstreamChanged =
        query.upstreamChanged === 'true' || query.upstreamChanged === true;
    }
    // 兼容 status=online/offline（=isOnSale）
    if (query.status) {
      where.isOnSale = query.status === 'online' || query.status === 'active';
    }
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { upstreamPlanName: { contains: query.keyword } },
      ];
    }
    // 排序：默认按 ID 倒序（最新同步的在前）；前端可传 sortBy / sortOrder 切换
    const allowedSortFields: Record<string, string> = {
      id: 'id',
      name: 'name',
      zone: 'zone',
      cpu: 'cpu',
      memory: 'memory',
      disk: 'disk',
      bandwidth: 'bandwidth',
      markupRate: 'markupRate',
      sortWeight: 'sortWeight',
      upstreamPlanId: 'upstreamPlanId',
      isOnSale: 'isOnSale',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    };
    const sortField = allowedSortFields[query.sortBy as string] || 'id';
    const sortOrder: 'asc' | 'desc' =
      String(query.sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const orderBy: any[] = [{ [sortField]: sortOrder }];
    // 二级排序：sortWeight > id（避免同字段时乱序）
    if (sortField !== 'sortWeight' && sortField !== 'id') {
      orderBy.push({ id: 'desc' });
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      list: rows.map((p) => this.formatProduct(p)),
      total,
      page,
      pageSize,
    };
  }

  // ===== 5. 管理后台更新商品 =====
  async updateProduct(id: number, dto: UpdateProductDto) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('商品不存在');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isOnSale !== undefined) data.isOnSale = dto.isOnSale;
    if (dto.group !== undefined) data.group = dto.group;
    if (dto.tags !== undefined) data.tags = JSON.stringify(dto.tags);
    if (dto.sortWeight !== undefined) data.sortWeight = dto.sortWeight;
    if (dto.isRecommended !== undefined) data.isRecommended = dto.isRecommended;
    if (dto.perUserLimit !== undefined) data.perUserLimit = dto.perUserLimit;

    // 改 markupRate 时自动重算 prices + ipPrices
    if (dto.markupRate !== undefined) {
      data.markupRate = dto.markupRate;
      const upstreamPrices = p.upstreamPrices
        ? JSON.parse(p.upstreamPrices)
        : {};
      data.prices = JSON.stringify(
        this.recalcPrice(upstreamPrices, dto.markupRate),
      );
      // 同步重算 IP 价格
      if (p.upstreamIpPrices) {
        try {
          const upstreamIpPrices = JSON.parse(p.upstreamIpPrices);
          data.ipPrices = JSON.stringify(
            this.recalcIpPrices(upstreamIpPrices, dto.markupRate),
          );
        } catch {}
      }
    }

    // 改 defaultIpType 时直接更新
    if (dto.defaultIpType !== undefined) {
      data.defaultIpType = dto.defaultIpType;
    }

    const updated = await this.prisma.product.update({ where: { id }, data });
    return this.formatProduct(updated);
  }

  // ===== 6. 管理后台手动创建商品（基于上游套餐） =====
  async createProduct(dto: CreateProductDto) {
    const { plans } = await this.rainyun.getRcsPlans();
    const plan = plans.find((p: any) => p.id === dto.upstreamPlanId);
    if (!plan) throw new BadRequestException('上游套餐不存在');

    const markupRate = dto.markupRate ?? DEFAULT_MARKUP_RATE;
    const upstreamPrices: Record<string, number> = {};
    if (plan.prices) {
      for (const [k, v] of Object.entries(plan.prices)) {
        upstreamPrices[k] = Number(v);
      }
    }
    const pricesJson = JSON.stringify(
      this.recalcPrice(upstreamPrices, markupRate),
    );

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        upstreamPlanId: dto.upstreamPlanId,
        upstreamPlanName: plan.name,
        category: 'RCS',
        zone: plan.zone,
        zoneName: plan.zone_name,
        cpu: plan.cpu,
        memory: this.normalizeMemory(plan.memory),
        disk: plan.disk,
        bandwidth: plan.bandwidth,
        traffic: plan.traffic,
        trafficType: this.inferTrafficType(plan),
        upstreamPrices: JSON.stringify(upstreamPrices),
        markupRate: markupRate,
        prices: pricesJson,
        group: dto.group || null,
        isRecommended: dto.isRecommended ?? false,
        isOnSale: true,
      },
    });
    return this.formatProduct(product);
  }

  // ===== 7. 管理后台下架商品（不真删） =====
  async deleteProduct(id: number) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('商品不存在');
    const updated = await this.prisma.product.update({
      where: { id },
      data: { isOnSale: false },
    });
    return this.formatProduct(updated);
  }

  // ===== 7.5 删除所有商品（管理后台批量操作） =====
  // mode: 'soft' = 全部下架（isOnSale=false）/ 'hard' = 物理删除所有商品记录
  // 物理删除会级联删除关联订单/续费记录等，请谨慎使用
  async deleteAllProducts(mode: 'soft' | 'hard' = 'soft') {
    const total = await this.prisma.product.count();
    if (total === 0) {
      return { total: 0, mode, deleted: 0 };
    }
    if (mode === 'hard') {
      // 物理删除：直接 deleteMany（Prisma 会按 schema 的 onDelete 策略级联处理关联记录）
      await this.prisma.product.deleteMany({});
      this.logger.warn(`已物理删除全部 ${total} 个商品（含关联数据）`);
      return { total, mode, deleted: total };
    }
    // 软删除：全部下架
    const result = await this.prisma.product.updateMany({
      where: { isOnSale: true },
      data: { isOnSale: false },
    });
    this.logger.log(`已下架 ${result.count} 个商品（共 ${total} 个）`);
    return { total, mode, deleted: result.count };
  }

  // ===== 8. OS 列表（可按 region 过滤，雨云 OS 按 region 分组） =====
  async getOsList(region?: string) {
    const { os } = await this.rainyun.getRcsOs(region);
    return os;
  }

  // ===== 8.5 预装软件列表（业务层维护的常见模板清单） =====
  async getAppTemplates() {
    const { apps } = await this.rainyun.getRcsAppTemplates();
    return apps;
  }

  // ===== 9. 区域列表（从数据库按 zone 去重） =====
  // 雨云官方 RCS 区域码 → 中文显示名映射（基于官方控制台 2025-09 公开区域整理）
  // 官方区域中文名映射（与雨云官网显示一致）
  // 数据来源：雨云 /product/rcs/plans 实测 13 个区域（2026-07）
  // 注：cn-sy1 是十堰（湖北）不是沈阳；cn-sq1 是宿迁（江苏）不是四川
  // 注：cn-hk1/2/3 是三个不同节点，官网区分「香港1区/2区/3区」
  private static readonly ZONE_NAME_MAP: Record<string, string> = {
    // 香港区域（3 个独立节点，官网区分 1/2/3 区）
    HK: '香港1区',
    'cn-hk1': '香港1区',
    'cn-hk2': '香港2区',
    'cn-hk3': '香港3区',
    // 美国洛杉矶
    'us-la1': '美国洛杉矶1区',
    'us-la2': '美国洛杉矶2区',
    // 日本东京
    'jp-tk1': '日本东京',
    // 韩国首尔
    'kr-se1': '韩国首尔',
    // 新加坡
    'sg-sg1': '新加坡',
    // 大陆区域
    'cn-sq1': '江苏宿迁',
    'cn-sy1': '湖北十堰',
    'cn-nb1': '浙江宁波',
    'cn-xy1': '湖北襄阳',
    'cn-cq1': '重庆',
    'cn-sz1': '广东深圳',
    'cn-sx1': '浙江绍兴',  // 官方购买页：华东浙江 → 绍兴三线BGP
    'cn-wz1': '浙江温州',
    'cn-gz1': '广东广州',
    // 兼容历史/mock 区域码
    'CN-NB': '浙江宁波',
    'CN-ZJ': '浙江',
    'CN-GZ': '广东',
  };

  async getZones() {
    // 从数据库查询所有在售商品的区域（去重），避免依赖上游 mock 数据
    const rows = await this.prisma.product.findMany({
      where: { isOnSale: true, zone: { not: null } },
      select: { zone: true, zoneName: true },
      distinct: ['zone'],
    });
    const zoneMap = new Map<string, string>();
    for (const r of rows) {
      if (r.zone && !zoneMap.has(r.zone)) {
        // 优先用映射表的中文名，其次用数据库 zoneName，最后用 zone 原码
        const friendlyName =
          ProductService.ZONE_NAME_MAP[r.zone] ||
          ProductService.ZONE_NAME_MAP[r.zone.toLowerCase()] ||
          r.zoneName ||
          r.zone;
        zoneMap.set(r.zone, friendlyName);
      }
    }
    return Array.from(zoneMap.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  // ===== 格式化输出：JSON 字段反序列化 + Decimal 转数字 =====
  // 注：暴露为 public 以便 PublicService 等模块复用，避免重复实现
  publicFormat(p: any) {
    return this.formatProduct(p);
  }

  private formatProduct(p: any) {
    // 用映射表覆盖 zoneName，让前端显示友好区域名（如"香港"而非"KVM 入门版"）
    const friendlyZoneName =
      ProductService.ZONE_NAME_MAP[p.zone] ||
      ProductService.ZONE_NAME_MAP[String(p.zone || '').toLowerCase()] ||
      p.zoneName ||
      p.zone;
    // 用映射表覆盖 name 字段：商品显示名 = 友好区域名 + 空格 + 上游套餐官方名
    // 例如 zone=cn-hk1, name=medium → "香港 KVM 标准版"
    // 这样保证所有商品命名统一可识别
    const officialName = p.upstreamPlanName || p.name || '';
    const displayName = friendlyZoneName && officialName
      ? `${friendlyZoneName} ${officialName}`
      : (officialName || p.name || '');
    return {
      ...p,
      // 显示名 = 友好区域名 + 空格 + 上游套餐官方名（如「香港 KVM 标准版」）
      name: displayName,
      zoneName: friendlyZoneName,
      markupRate: Number(p.markupRate),
      upstreamPrices: p.upstreamPrices ? JSON.parse(p.upstreamPrices) : {},
      prices: p.prices ? JSON.parse(p.prices) : {},
      // IP 选项
      upstreamIpPrices: p.upstreamIpPrices ? JSON.parse(p.upstreamIpPrices) : {},
      upstreamIpSelling: p.upstreamIpSelling ? JSON.parse(p.upstreamIpSelling) : [],
      ipPrices: p.ipPrices ? JSON.parse(p.ipPrices) : {},
      defaultIpType: p.defaultIpType ?? '',
      // 磁盘选项
      upstreamDiskPrices: p.upstreamDiskPrices ? JSON.parse(p.upstreamDiskPrices) : {},
      upstreamDiskSizes: p.upstreamDiskSizes ? JSON.parse(p.upstreamDiskSizes) : {},
      upstreamDiskSelling: p.upstreamDiskSelling ? JSON.parse(p.upstreamDiskSelling) : [],
      // 服务器代数 / 网络线路 / 计费类型
      machine: p.machine ?? '',
      line: p.line ?? '',
      chargeType: p.chargeType ?? '',
      tags: p.tags ? JSON.parse(p.tags) : [],
    };
  }
}
