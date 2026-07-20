<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { type Product } from '@/api/product';
import { publicApi } from '@/api/public';
import dayjs from 'dayjs';

const router = useRouter();

// 数据状态
const loadingProducts = ref(false);
const loadingAnnouncements = ref(false);
const products = ref<Product[]>([]);
const announcements = ref<any[]>([]);

// 特性卡片配置
const features = [
  {
    iconType: 'cpu' as const,
    title: '强劲性能',
    desc: 'NVMe 高速固态硬盘，企业级 CPU 与高频内存，承载业务高峰毫无压力。',
  },
  {
    iconType: 'network' as const,
    title: '稳定可靠',
    desc: '多线 BGP 接入，99.95% 可用性 SLA，故障秒级切换，业务永不停摆。',
  },
  {
    iconType: 'billing' as const,
    title: '灵活计费',
    desc: '支持 1/3/6/12 月时长自由组合，按需扩容，退款政策透明无忧。',
  },
  {
    iconType: 'service' as const,
    title: '专属服务',
    desc: '7×24 工单响应，技术专家护航，新手亦可轻松上手云服务。',
  },
];

// 解析商品 prices JSON，返回最低价
function getStartingPrice(product: Product): number | null {
  try {
    const prices = JSON.parse(product.prices || '{}');
    const values = Object.values(prices).map((v) => Number(v)).filter((v) => !isNaN(v) && v > 0);
    if (!values.length) return null;
    return Math.min(...values);
  } catch {
    return null;
  }
}

// 价格展示
function formatPrice(price: number | null): string {
  if (price === null) return '咨询客服';
  return `¥${price.toFixed(2)}`;
}

// 跳转商品详情
function goProduct(id: number) {
  router.push({ name: 'ProductDetail', params: { id } });
}

// 跳转商品列表
function goProducts() {
  router.push('/products');
}

// 跳转用户中心
function goDashboard() {
  router.push('/dashboard');
}

// 时间格式化
function formatTime(time: string): string {
  return dayjs(time).format('YYYY-MM-DD');
}

// 拉取推荐商品
// 逻辑：后端 /public/products/recommended 实现
// (a) 管理员未设置推荐时：随机 6 个
// (b) 管理员已设置时：展示管理员设置的（最多 6 个）
// (c) 设置未满 6 个时：已设置的按 sortWeight 顺序展示，缺几个随机补几个
async function fetchProducts() {
  loadingProducts.value = true;
  try {
    const res = await publicApi.recommendedProducts();
    if (res.success) {
      const list = (res.data?.list || res.data || []) as Product[];
      products.value = list.slice(0, 6);
    }
  } catch (e) {
    // 静默失败，列表会显示空状态
  } finally {
    loadingProducts.value = false;
  }
}

// 拉取公告
async function fetchAnnouncements() {
  loadingAnnouncements.value = true;
  try {
    const res = await publicApi.announcements();
    if (res.success) {
      announcements.value = (res.data || []).slice(0, 3);
    }
  } catch {
    // 静默失败
  } finally {
    loadingAnnouncements.value = false;
  }
}

onMounted(() => {
  fetchProducts();
  fetchAnnouncements();
});
</script>

<template>
  <div class="home-page">
    <!-- Hero 区 -->
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-eyebrow eyebrow"><span>RAINYUN · CLOUD</span></div>
        <h1 class="hero-title font-display">极致性能 · 白金品质</h1>
        <p class="hero-subtitle">
          基于 RainYun 上游资源打造的二次分销平台，以更亲民的价格、更贴心的服务，让每一位开发者、创业者都能拥有稳定可靠的云上基础设施。
        </p>
        <div class="hero-actions">
          <button type="button" class="btn-gold hero-cta" @click="goProducts">立即购买</button>
          <button type="button" class="btn-outline hero-cta" @click="goDashboard">用户中心</button>
        </div>
        <div class="hero-stats">
          <div class="stat">
            <div class="stat-num font-display">99.95<span>%</span></div>
            <div class="stat-label eyebrow">可用性 SLA</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <div class="stat-num font-display">7×24<span>h</span></div>
            <div class="stat-label eyebrow">技术支持</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <div class="stat-num font-display">4<span>线</span></div>
            <div class="stat-label eyebrow">BGP 接入</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 特性卡片区 -->
    <section class="section features-section">
      <div class="section-inner">
        <div class="section-header">
          <div class="section-eyebrow eyebrow">FEATURES</div>
          <h2 class="section-title font-display">为何选择我们</h2>
          <div class="divider-gold section-divider"></div>
        </div>
        <div class="features-grid">
          <div
            v-for="(feature, idx) in features"
            :key="feature.title"
            class="feature-card"
            :style="{ '--reveal-delay': `${0.6 + idx * 0.08}s` }"
          >
            <div class="feature-icon-wrap">
              <AnimatedFeatureIcon :type="feature.iconType" :size="40" />
            </div>
            <div class="feature-body">
              <h3 class="feature-title font-display">{{ feature.title }}</h3>
              <p class="feature-desc">{{ feature.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 推荐套餐区 -->
    <section class="section products-section">
      <div class="section-inner">
        <div class="section-header section-header-row">
          <div>
            <div class="section-eyebrow eyebrow">RECOMMENDED</div>
            <h2 class="section-title font-display">精选套餐推荐</h2>
          </div>
          <button type="button" class="view-all-btn" @click="goProducts">
            查看全部
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
        <div class="divider-gold section-divider"></div>

        <div v-loading="loadingProducts" class="products-grid">
          <template v-if="products.length">
            <div
              v-for="(product, idx) in products"
              :key="product.id"
              class="product-card card"
              :class="{ 'is-recommended': product.isRecommended }"
              :style="{ '--reveal-delay': `${0.6 + idx * 0.08}s` }"
              @click="goProduct(product.id)"
            >
              <div v-if="product.isRecommended" class="recommend-badge">
                <span class="badge-text font-mono">推荐</span>
              </div>
              <h3 class="product-name font-display">{{ product.name }}</h3>
              <div class="product-specs">
                <div class="spec-item">
                  <div class="spec-label eyebrow">CPU</div>
                  <div class="spec-value">{{ product.cpu }} 核</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label eyebrow">内存</div>
                  <div class="spec-value">{{ product.memory }} GB</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label eyebrow">磁盘</div>
                  <div class="spec-value">{{ product.disk }} GB</div>
                </div>
                <div class="spec-item">
                  <div class="spec-label eyebrow">带宽</div>
                  <div class="spec-value">{{ product.bandwidth }} Mbps</div>
                </div>
              </div>
              <div class="product-card-footer">
                <div class="price-block">
                  <span class="price-value font-display">{{ formatPrice(getStartingPrice(product)) }}</span>
                  <span class="price-suffix">/月起</span>
                </div>
                <button type="button" class="btn-gold" @click.stop="goProduct(product.id)">立即购买</button>
              </div>
            </div>
          </template>
          <el-empty v-else-if="!loadingProducts" description="暂无推荐套餐" />
        </div>
      </div>
    </section>

    <!-- 公告区 -->
    <section class="section announcements-section">
      <div class="section-inner">
        <div class="section-header">
          <div class="section-eyebrow eyebrow">NOTICE</div>
          <h2 class="section-title font-display">平台公告</h2>
          <div class="divider-gold section-divider"></div>
        </div>
        <div v-loading="loadingAnnouncements" class="announcements-list">
          <template v-if="announcements.length">
            <div
              v-for="(item, idx) in announcements"
              :key="item.id || idx"
              class="announcement-item"
            >
              <div class="announcement-content">
                <h4 class="announcement-title">{{ item.title }}</h4>
                <p class="announcement-text">{{ item.content }}</p>
              </div>
              <div class="announcement-time font-mono">{{ formatTime(item.createdAt || item.publishAt || item.updatedAt) }}</div>
            </div>
          </template>
          <el-empty v-else-if="!loadingAnnouncements" description="暂无公告" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.home-page {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ Hero 区 ============
.hero {
  position: relative;
  padding: 120px 24px 100px;
  background: var(--bg-base);

  @include tablet-down {
    padding: 80px 20px;
  }

  @include mobile {
    padding: 56px 16px;
  }
}

.hero-inner {
  position: relative;
  z-index: 1;
  max-width: 1180px;
  margin: 0 auto;
  text-align: center;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 28px;
  animation: fadeUp 0.7s var(--ease-out-expo) 0.1s backwards;

  &::before,
  &::after {
    content: '';
    width: 24px;
    height: 1px;
    background: var(--gold-400);
    opacity: 0.7;
  }

  @include mobile {
    gap: 10px;
    margin-bottom: 20px;

    &::before,
    &::after {
      width: 16px;
    }
  }
}

.hero-title {
  font-size: clamp(44px, 6vw, 80px);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -1px;
  margin: 0 0 24px;
  color: var(--text-primary);
  animation: fadeUp 0.7s var(--ease-out-expo) 0.2s backwards;

  @include mobile {
    font-size: clamp(36px, 11vw, 56px);
    margin-bottom: 20px;
    letter-spacing: -0.5px;
  }
}

.hero-subtitle {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-tertiary);
  max-width: 640px;
  margin: 0 auto 40px;
  animation: fadeUp 0.7s var(--ease-out-expo) 0.3s backwards;

  @include mobile {
    font-size: 14px;
    line-height: 1.7;
    margin-bottom: 32px;
  }
}

.hero-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 64px;
  animation: fadeUp 0.7s var(--ease-out-expo) 0.4s backwards;

  @include mobile {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 40px;
    gap: 12px;
    max-width: 320px;
    margin-left: auto;
    margin-right: auto;
  }
}

.hero-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 28px;
  font-size: 14px;

  @include mobile {
    width: 100%;
    padding: 11px 24px;
  }
}

.hero-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 48px;
  flex-wrap: wrap;
  animation: fadeUp 0.7s var(--ease-out-expo) 0.5s backwards;

  @include tablet-down {
    gap: 32px;
  }

  @include mobile {
    gap: 20px;
  }
}

.stat {
  text-align: center;

  .stat-num {
    font-size: 32px;
    font-weight: 500;
    line-height: 1;
    color: var(--text-primary);
    margin-bottom: 8px;

    @include mobile {
      font-size: 26px;
    }

    span {
      font-size: 16px;
      margin-left: 2px;
      color: var(--text-tertiary);

      @include mobile {
        font-size: 13px;
      }
    }
  }

  .stat-label {
    color: var(--text-tertiary);

    @include mobile {
      font-size: 10px;
    }
  }
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: var(--border-base);

  @include mobile {
    display: none;
  }
}

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
  .hero-eyebrow,
  .hero-title,
  .hero-subtitle,
  .hero-actions,
  .hero-stats,
  .feature-card,
  .product-card,
  .announcement-item {
    animation: none;
  }
}

// ============ 通用 Section ============
.section {
  padding: 80px 24px;

  @include tablet-down {
    padding: 64px 20px;
  }

  @include mobile {
    padding: 48px 16px;
  }
}

.section-inner {
  max-width: 1180px;
  margin: 0 auto;
}

.section-header {
  text-align: center;
  margin-bottom: 12px;
}

.section-header-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  text-align: left;
  flex-wrap: wrap;
  gap: 16px;

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}

.section-eyebrow {
  color: var(--text-gold);
  margin-bottom: 12px;

  @include mobile {
    margin-bottom: 8px;
  }
}

.section-title {
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
  color: var(--text-primary);

  @include tablet-down {
    font-size: 24px;
  }

  @include mobile {
    font-size: 22px;
  }
}

.section-divider {
  max-width: 80px;
  margin: 24px auto;

  @include mobile {
    margin: 16px auto;
  }
}

.section-header-row + .section-divider {
  margin: 24px 0 0;

  @include mobile {
    margin: 16px 0 0;
  }
}

.view-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--border-base);
  color: var(--text-secondary);
  padding: 8px 18px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.2s var(--ease-out-expo), color 0.2s var(--ease-out-expo);

  &:hover {
    border-color: var(--gold-400);
    color: var(--text-gold);
  }
}

// ============ 特性卡片 ============
.features-section {
  background: var(--bg-elevated);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 32px;
  margin-top: 48px;

  // 桌面小屏：2 列
  @include lg-only {
    grid-template-columns: repeat(2, 1fr);
  }

  // 平板：2 列
  @include tablet {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }

  // 手机：1 列，横向布局
  @include mobile {
    grid-template-columns: 1fr;
    gap: 20px;
    margin-top: 32px;
  }
}

.feature-card {
  padding: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fadeUp 0.7s var(--ease-out-expo) var(--reveal-delay, 0.6s) backwards;

  @include mobile {
    flex-direction: row;
    align-items: flex-start;
    gap: 16px;
  }
}

.feature-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--gold-500);
  flex-shrink: 0;
}

.feature-body {
  flex: 1;
}

.feature-title {
  font-size: 18px;
  margin: 0 0 8px;
  color: var(--text-primary);
  font-weight: 600;
  transition: color 0.2s var(--ease-out-expo);

  @include mobile {
    font-size: 16px;
    margin: 0 0 4px;
  }

  .feature-card:hover & {
    color: var(--text-gold);
  }
}

.feature-desc {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-tertiary);
  margin: 0;

  @include mobile {
    font-size: 13px;
    line-height: 1.6;
  }
}

// ============ 推荐套餐 ============
.products-section {
  background: var(--bg-base);
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-top: 40px;
  min-height: 200px;

  @include lg-only {
    grid-template-columns: repeat(2, 1fr);
  }

  @include tablet {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }

  @include mobile {
    grid-template-columns: 1fr;
    gap: 16px;
    margin-top: 28px;
  }
}

.product-card {
  padding: 24px;
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fadeUp 0.7s var(--ease-out-expo) var(--reveal-delay, 0.6s) backwards;
  transition: border-color 0.2s var(--ease-out-expo);

  &:hover {
    border-color: var(--gold-300);
  }

  @include mobile {
    padding: 20px 16px;
    gap: 12px;
  }

  &.is-recommended {
    border-color: var(--gold-300);
  }
}

// 顶部 2px 金线 + 角标文字
.recommend-badge {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--gold-400);
  pointer-events: none;

  .badge-text {
    position: absolute;
    top: 6px;
    right: 12px;
    font-size: 10px;
    letter-spacing: 2px;
    color: var(--text-gold);
    background: var(--bg-elevated);
    padding: 0 6px;
    text-transform: uppercase;
  }

  @include mobile {
    .badge-text {
      top: 4px;
      right: 10px;
      font-size: 9px;
    }
  }
}

.product-name {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  line-height: 1.3;

  @include mobile {
    font-size: 18px;
  }
}

.product-specs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 16px;
  padding: 16px 0;
  border-top: 1px solid var(--border-base);
  border-bottom: 1px solid var(--border-base);

  @include mobile {
    padding: 12px 0;
    gap: 10px 12px;
  }

  .spec-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .spec-label {
    color: var(--text-tertiary);

    @include mobile {
      font-size: 10px;
    }
  }

  .spec-value {
    color: var(--text-primary);
    font-weight: 500;
    font-size: 14px;
    font-family: 'JetBrains Mono', monospace;

    @include mobile {
      font-size: 13px;
    }
  }
}

.product-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;

  @include mobile {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}

.price-block {
  display: flex;
  align-items: baseline;
  gap: 4px;

  @include mobile {
    justify-content: center;
  }

  .price-value {
    font-size: 28px;
    font-weight: 600;
    color: var(--text-gold);
    line-height: 1;

    @include mobile {
      font-size: 24px;
    }
  }

  .price-suffix {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

// 移动端按钮全宽
.product-card-footer .btn-gold {
  @include mobile {
    width: 100%;
    text-align: center;
  }
}

// ============ 公告区 ============
.announcements-section {
  background: var(--bg-elevated);
}

.announcements-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 40px;

  @include mobile {
    margin-top: 28px;
    gap: 20px;
  }
}

.announcement-item {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  padding-left: 16px;
  border-left: 2px solid var(--gold-400);
  flex-wrap: wrap;
  animation: fadeUp 0.7s var(--ease-out-expo) backwards;

  &:nth-child(1) { animation-delay: 0.6s; }
  &:nth-child(2) { animation-delay: 0.7s; }
  &:nth-child(3) { animation-delay: 0.8s; }

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
    padding-left: 14px;
    gap: 8px;
  }
}

.announcement-content {
  flex: 1;
  min-width: 240px;

  @include mobile {
    min-width: 0;
    width: 100%;
  }

  .announcement-title {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);

    @include mobile {
      font-size: 15px;
    }
  }

  .announcement-text {
    margin: 0;
    font-size: 13px;
    color: var(--text-tertiary);
    line-height: 1.7;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.announcement-time {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  flex-shrink: 0;

  @include mobile {
    font-size: 11px;
  }
}
</style>
