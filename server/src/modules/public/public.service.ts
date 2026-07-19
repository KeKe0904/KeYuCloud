import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { RainyunService } from '../rainyun/rainyun.service';
import { ProductService } from '../product/product.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class PublicService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private rainyun: RainyunService,
    private product: ProductService,
    private mailer: MailerService,
  ) {}

  // 站点信息
  async getSiteInfo() {
    const smtpEnabled = await this.mailer.isSmtpEnabled();
    return {
      siteName: this.config.get('SITE_NAME', '云服分销平台'),
      siteUrl: this.config.get('SITE_URL', 'http://localhost:5173'),
      upstreamMode: this.rainyun.isMockMode() ? 'MOCK' : 'LIVE',
      // 暴露 SMTP 状态：前端注册页据此决定是否强制要求邮箱
      smtpEnabled,
    };
  }

  // 公告列表（前台）
  async getAnnouncements() {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        position: 'portal',
        status: 'ACTIVE',
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
  }

  // 系统配置（公开项）
  async getPublicConfigs() {
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            'icp',
            'company_name',
            'contact_email',
            'contact_qq',
            'tos_url',
            'privacy_url',
            // 主题相关：前端初次加载时根据 default_theme 应用主题
            'default_theme',
            'allow_theme_switch',
          ],
        },
      },
    });
    const map: Record<string, string> = {};
    for (const c of configs) map[c.key] = c.value;
    return map;
  }

  // 首页精选套餐推荐：
  // (a) 管理员未设置推荐时：每次随机展示 6 个
  // (b) 管理员已设置推荐时：展示管理员设置的（最多 6 个）
  // (c) 设置未满 6 个时：已设置的按 sortWeight 顺序展示，缺几个随机补几个
  async getRecommendedProducts(limit = 6) {
    // 先取所有在售商品（推荐商品在前），take 较大值用于挑选
    const all = await this.prisma.product.findMany({
      where: { isOnSale: true },
      orderBy: [{ sortWeight: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    // 推荐商品：按 sortWeight DESC, createdAt DESC 排序（已由 SQL 保证）
    const recommended = all.filter((p: any) => p.isRecommended);
    // 非推荐商品池：用于随机补充
    const others = all.filter((p: any) => !p.isRecommended);

    // 已设置推荐按 sortWeight 顺序展示（最多 limit 个）
    const selected = recommended.slice(0, limit);
    const need = limit - selected.length;

    // 不足 limit 时从非推荐中随机补足
    if (need > 0 && others.length > 0) {
      // Fisher-Yates 洗牌
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      selected.push(...others.slice(0, need));
    }

    // 用 ProductService.formatProduct 格式化输出（处理 JSON 字段、 Decimal 转换、友好区域名）
    // 注：formatProduct 是 ProductService 私有方法，这里通过新暴露的 publicFormat 方法访问
    return selected.map((p: any) => this.product.publicFormat(p));
  }
}
