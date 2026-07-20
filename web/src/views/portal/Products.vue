<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { productApi, type Product } from '@/api/product';

const router = useRouter();
const route = useRoute();

// 筛选条件
const filters = reactive({
  category: '',
  zone: '',
  trafficType: '',
  keyword: '',
});

// 数据状态
const loading = ref(false);
const products = ref<Product[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(9);

// 筛选选项
const categoryOptions = ref<{ label: string; value: string }[]>([]);
const zoneOptions = ref<{ label: string; value: string }[]>([]);
// 雨云所有 RCS 区域均为无限流量，仅宁波为叠加流量（不再有"标准月流量"）
const trafficTypeOptions = ref<{ label: string; value: string }[]>([
  { label: '无限流量', value: 'unlimited' },
  { label: '叠加流量', value: 'stacked' },
]);

// 流量类型标签
function getTrafficTypeLabel(t: string | undefined): string {
  if (!t) return '';
  if (t === 'unlimited') return '无限流量';
  if (t === 'stacked') return '叠加流量';
  return '';
}

// 库存显示：0=充足（无限）/ >0=剩余 N 台
function getStockLabel(product: Product): string {
  const stock = Number((product as any).availableStock ?? 0);
  if (!stock || stock <= 0) return '库存充足';
  return `剩 ${stock} 台`;
}

// 库存是否紧张（<= 10 台）
function isStockLow(product: Product): boolean {
  const stock = Number((product as any).availableStock ?? 0);
  return stock > 0 && stock <= 10;
}

// 解析 prices JSON，返回起售价
// NAT 共享 IP 商品（netMode=nat）：起售价 = 机器月价（IP 共享免费，不显示 IP 价）
// 非 NAT 商品：起售价 = 机器月价 + 最便宜 IP 月价（兼容老逻辑）
function getStartingPrice(product: Product): number | null {
  try {
    const prices = typeof product.prices === 'string'
      ? JSON.parse(product.prices || '{}')
      : (product.prices || {});
    // 机器月价（不含 IP，已优惠率，1 月价 = 月价 × 1.0 折扣）
    const machineMonthly = Number(prices?.['1'] ?? 0);
    if (!machineMonthly || isNaN(machineMonthly)) return null;

    // NAT 共享 IP 商品：默认使用共享 IP（免费），起售价仅机器月价
    const isNat = (product as any).netMode === 'nat';
    if (isNat) return machineMonthly;

    // 非 NAT 商品：取 IP 月价（从 ipPrices 找最便宜的）
    let ipMin = 0;
    const ipPrices: any = (product as any).ipPrices;
    if (ipPrices) {
      try {
        const obj = typeof ipPrices === 'string' ? JSON.parse(ipPrices) : ipPrices;
        const vals = Object.values(obj || {})
          .map((v) => Number(v))
          .filter((v) => !isNaN(v) && v >= 0);
        if (vals.length) {
          // 优先选 0 元的（如 IPv6），否则取最小
          ipMin = vals.some((v) => v === 0) ? 0 : Math.min(...vals);
        }
      } catch {}
    }

    return machineMonthly + ipMin;
  } catch {
    return null;
  }
}

// 取官方原价（1月价格 = 机器价 + 默认 IP 价）
// 修复：原实现仅取机器价，导致很多商品的"官方原价"比本站售价还便宜
//       （因为本站售价已含 IP，而原价只含机器）
// 正确逻辑：
//   - NAT 商品（无独立 IP）：官方原价 = 上游机器月价
//   - 非 NAT 商品：官方原价 = 上游机器月价 + 上游默认 IPv4 月价（ip_prices[""]）
function getOfficialMonthlyPrice(product: Product): number | null {
  try {
    const up: any = typeof product.upstreamPrices === 'string'
      ? JSON.parse(product.upstreamPrices || '{}')
      : (product.upstreamPrices || {});
    const machineMonthly = Number(up?.['1'] ?? 0);
    if (!machineMonthly || isNaN(machineMonthly)) return null;

    // NAT 共享 IP 商品：官方原价仅机器价
    const isNat = (product as any).netMode === 'nat';
    if (isNat) return machineMonthly;

    // 非 NAT 商品：加上游默认 IPv4 月价（key 为 ""）
    let ipUpstream: any = (product as any).upstreamIpPrices;
    if (typeof ipUpstream === 'string') {
      try { ipUpstream = JSON.parse(ipUpstream || '{}'); } catch { ipUpstream = {}; }
    }
    if (!ipUpstream || typeof ipUpstream !== 'object') ipUpstream = {};
    const defaultIpPrice = Number(ipUpstream?.[''] ?? 0);
    return machineMonthly + (isNaN(defaultIpPrice) ? 0 : defaultIpPrice);
  } catch {
    return null;
  }
}

// 优惠率（小数 → 折扣标签）
function getDiscountLabel(product: Product): string | null {
  const m = Number((product as any).markupRate ?? 0);
  if (!m || m >= 0 || isNaN(m)) return null;
  const rate = m > 1 ? m : m * 100;
  const off = 100 + rate; // m 是负数
  return `${(off / 10).toFixed(off % 10 === 0 ? 0 : 1)}折`;
}

// 价格格式化
function formatPrice(price: number | null): string {
  if (price === null || price <= 0) return '待定价';
  return `¥${price.toFixed(2)}`;
}

// 跳转商品详情
function goProduct(id: number) {
  router.push({ name: 'ProductDetail', params: { id } });
}

// 应用筛选（重置页码）
function applyFilters() {
  page.value = 1;
  fetchProducts();
}

// 重置筛选
function resetFilters() {
  filters.category = '';
  filters.zone = '';
  filters.trafficType = '';
  filters.keyword = '';
  page.value = 1;
  fetchProducts();
}

// 拉取商品列表
async function fetchProducts() {
  loading.value = true;
  try {
    const res = await productApi.list({
      category: filters.category || undefined,
      zone: filters.zone || undefined,
      trafficType: filters.trafficType || undefined,
      keyword: filters.keyword || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    if (res.success) {
      const data: any = res.data;
      // 兼容 {list, total} 与数组两种结构
      if (Array.isArray(data)) {
        products.value = data;
        total.value = data.length;
      } else {
        products.value = data.list || data.items || data.records || [];
        total.value = data.total || data.totalCount || products.value.length;
      }
    }
  } catch (e) {
    // 错误已由拦截器提示
  } finally {
    loading.value = false;
  }
}

// 拉取筛选项（分类、地区）
async function fetchFilterOptions() {
  try {
    const zonesRes = await productApi.zones();
    if (zonesRes.success) {
      const zones: any[] = zonesRes.data || [];
      zoneOptions.value = zones.map((z: any) => ({
        label: z.name || z.zoneName || z.label || z.code,
        value: z.code || z.zone || z.value || z.id?.toString(),
      }));
    }
  } catch {
    // 静默失败
  }
  // 分类从已有商品列表中推断（也可由后端单独提供，这里使用通用方案）
  try {
    const res = await productApi.list({ page: 1, pageSize: 200 });
    if (res.success) {
      const data: any = res.data;
      const list: Product[] = Array.isArray(data) ? data : (data.list || []);
      const categorySet = new Set<string>();
      list.forEach((p) => {
        if (p.category) categorySet.add(p.category);
      });
      categoryOptions.value = Array.from(categorySet).map((c) => ({ label: c, value: c }));
    }
  } catch {
    // 静默失败
  }
}

// 处理页码变化
function handlePageChange(p: number) {
  page.value = p;
  fetchProducts();
  // 滚动到列表顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 跳转到「多套餐区域对比」页面（默认展示第一个区域）
function goZoneCompare() {
  const firstZone = zoneOptions.value[0]?.value;
  if (firstZone) {
    router.push({ name: 'ZoneDetail', params: { zone: firstZone } });
  } else {
    router.push({ name: 'ZoneDetail', params: { zone: '_' } });
  }
}

// 是否显示重置按钮
const hasActiveFilters = computed(
  () => !!(filters.category || filters.zone || filters.trafficType || filters.keyword),
);

// 从 query 中读取 keyword
onMounted(async () => {
  if (route.query.keyword) {
    filters.keyword = String(route.query.keyword);
  }
  if (route.query.category) {
    filters.category = String(route.query.category);
  }
  if (route.query.zone) {
    filters.zone = String(route.query.zone);
  }
  if (route.query.trafficType) {
    filters.trafficType = String(route.query.trafficType);
  }
  await fetchFilterOptions();
  await fetchProducts();
});

// 监听路由 query 变化（从其他页面带参跳转）
watch(
  () => route.query,
  (q) => {
    if (q.keyword && q.keyword !== filters.keyword) {
      filters.keyword = String(q.keyword);
      page.value = 1;
      fetchProducts();
    }
  },
);
</script>

<template>
  <div class="products-page">
    <!-- 页面头部 -->
    <section class="page-header">
      <div class="header-inner">
        <div class="header-eyebrow eyebrow">CLOUD SERVERS</div>
        <h1 class="header-title font-display">云服务器产品</h1>
        <p class="header-subtitle">弹性算力，灵活时长，按需选择最适合你的方案</p>
        <div class="header-actions">
          <button class="zone-compare-btn" @click="goZoneCompare">
            <span class="zone-compare-icon">⇄</span>
            <span>多套餐区域对比</span>
          </button>
        </div>
      </div>
    </section>

    <div class="page-body">
      <!-- 筛选栏 -->
      <section class="filter-bar">
        <div class="filter-row">
          <div class="filter-item">
            <label class="filter-label eyebrow">分类</label>
            <el-select
              v-model="filters.category"
              placeholder="全部分类"
              clearable
              size="default"
              class="filter-select"
              @change="applyFilters"
            >
              <el-option
                v-for="opt in categoryOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label eyebrow">地区</label>
            <el-select
              v-model="filters.zone"
              placeholder="全部地区"
              clearable
              size="default"
              class="filter-select"
              @change="applyFilters"
            >
              <el-option
                v-for="opt in zoneOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label eyebrow">流量类型</label>
            <el-select
              v-model="filters.trafficType"
              placeholder="全部流量"
              clearable
              size="default"
              class="filter-select"
              @change="applyFilters"
            >
              <el-option
                v-for="opt in trafficTypeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="filter-item filter-item-search">
            <label class="filter-label eyebrow">关键字</label>
            <el-input
              v-model="filters.keyword"
              placeholder="搜索商品名称、规格"
              size="default"
              clearable
              class="filter-input"
              @keyup.enter="applyFilters"
              @clear="applyFilters"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
              <template #append>
                <el-button @click="applyFilters">
                  <el-icon><Search /></el-icon>
                </el-button>
              </template>
            </el-input>
          </div>
          <div class="filter-actions">
            <button type="button" v-if="hasActiveFilters" class="reset-btn" @click="resetFilters">
              <el-icon><RefreshLeft /></el-icon>
              重置
            </button>
          </div>
        </div>
      </section>

      <!-- 商品网格 -->
      <section class="products-wrapper" v-loading="loading">
        <div v-if="products.length" class="products-grid">
          <div
            v-for="product in products"
            :key="product.id"
            class="product-card card"
            :class="{ 'is-recommended': product.isRecommended }"
            @click="goProduct(product.id)"
          >
            <div v-if="product.isRecommended" class="recommend-badge">
              <span class="badge-text font-mono">推荐</span>
            </div>
            <div v-if="getDiscountLabel(product)" class="discount-badge font-mono">
              {{ getDiscountLabel(product) }}
            </div>
            <div v-if="!product.isOnSale" class="sold-out-tag font-mono">已售罄</div>

            <div class="card-header">
              <div class="card-header-top">
                <h3 class="product-name font-display">{{ product.name }}</h3>
                <span class="zone-tag">{{ product.zoneName || product.zone }}</span>
              </div>
              <p class="product-desc">{{ product.description || '高性价比之选，适合个人博客、轻量应用。' }}</p>
              <div class="card-tags">
                <div v-if="getTrafficTypeLabel(product.trafficType)" class="traffic-tag font-mono">
                  {{ getTrafficTypeLabel(product.trafficType) }}
                </div>
                <div class="net-tag font-mono" :class="{ 'net-nat': (product as any).netMode === 'nat' }">
                  {{ (product as any).netMode === 'nat' ? 'NAT 共享' : '独立 IP' }}
                </div>
                <div
                  v-if="getStockLabel(product)"
                  class="stock-tag font-mono"
                  :class="{ 'stock-low': isStockLow(product) }"
                >
                  {{ getStockLabel(product) }}
                </div>
              </div>
            </div>

            <div class="spec-grid">
              <div class="spec-cell">
                <div class="spec-num font-mono">{{ product.cpu }}</div>
                <div class="spec-name eyebrow">CPU 核</div>
              </div>
              <div class="spec-cell">
                <div class="spec-num font-mono">{{ product.memory }}</div>
                <div class="spec-name eyebrow">内存 GB</div>
              </div>
              <div class="spec-cell">
                <div class="spec-num font-mono">{{ product.disk }}</div>
                <div class="spec-name eyebrow">磁盘 GB</div>
              </div>
              <div class="spec-cell">
                <div class="spec-num font-mono">
                  <template v-if="product.netIn && product.netIn !== product.bandwidth">
                    {{ product.netIn }}/{{ product.bandwidth }}
                  </template>
                  <template v-else>{{ product.bandwidth }}</template>
                </div>
                <div class="spec-name eyebrow">带宽 Mbps</div>
              </div>
            </div>

            <div class="card-footer">
              <div class="price-block">
                <div v-if="getOfficialMonthlyPrice(product) && getDiscountLabel(product)" class="official-price">
                  <span class="official-label">官方价</span>
                  <span class="official-amount">¥{{ getOfficialMonthlyPrice(product)!.toFixed(2) }}</span>
                </div>
                <div class="price-main">
                  <span class="price-value font-display">{{ formatPrice(getStartingPrice(product)) }}</span>
                  <span class="price-suffix">/月起</span>
                </div>
                <div v-if="getDiscountLabel(product)" class="price-tag font-mono">本站 {{ getDiscountLabel(product) }}</div>
              </div>
              <button type="button"
                class="btn-gold buy-btn"
                :disabled="!product.isOnSale"
                @click.stop="goProduct(product.id)"
              >
                立即购买
              </button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!loading" class="empty-wrap">
          <el-empty description="未找到匹配的商品">
            <el-button v-if="hasActiveFilters" type="primary" @click="resetFilters">
              清空筛选条件
            </el-button>
          </el-empty>
        </div>
      </section>

      <!-- 分页 -->
      <section v-if="total > 0" class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          background
          layout="prev, pager, next, jumper, total"
          @current-change="handlePageChange"
        />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.products-page {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

// ============ 页面头部 ============
.page-header {
  position: relative;
  padding: 80px 24px 64px;
  text-align: center;
  background: var(--bg-base);

  @include mobile {
    padding: 56px 16px 40px;
  }
}

.header-inner {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: 0 auto;
}

.header-eyebrow {
  color: var(--text-gold);
  margin-bottom: 16px;

  @include mobile {
    margin-bottom: 12px;
  }
}

.header-actions {
  margin-top: 28px;
  display: flex;
  justify-content: center;

  @include mobile {
    margin-top: 20px;
  }
}

.zone-compare-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  background: linear-gradient(135deg, rgba(212, 175, 55, 0.12), rgba(212, 175, 55, 0.04));
  border: 1px solid rgba(212, 175, 55, 0.4);
  border-radius: 999px;
  color: var(--text-gold);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s var(--ease-out-expo, ease);

  &:hover {
    background: linear-gradient(135deg, rgba(212, 175, 55, 0.22), rgba(212, 175, 55, 0.08));
    border-color: rgba(212, 175, 55, 0.7);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(212, 175, 55, 0.18);
  }

  @include mobile {
    padding: 10px 18px;
    font-size: 12px;
    letter-spacing: 1px;
  }
}

.zone-compare-icon {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
}

.header-title {
  font-size: clamp(40px, 6vw, 64px);
  font-weight: 600;
  margin: 0 0 16px;
  line-height: 1.1;
  color: var(--text-primary);
  letter-spacing: -0.5px;

  @include mobile {
    font-size: clamp(32px, 8vw, 44px);
  }
}

.header-subtitle {
  font-size: 15px;
  color: var(--text-tertiary);
  margin: 0;

  @include mobile {
    font-size: 13px;
  }
}

// ============ 页面主体 ============
.page-body {
  max-width: 1180px;
  margin: 0 auto;
  padding: 40px 24px 80px;

  @include tablet-down {
    padding: 32px 20px 64px;
  }

  @include mobile {
    padding: 20px 16px 48px;
  }
}

// ============ 筛选栏 ============
.filter-bar {
  padding: 16px 20px;
  margin-bottom: 32px;
  border: 1px solid var(--border-base);
  border-radius: 8px;
  background: var(--bg-elevated);

  @include tablet-down {
    padding: 14px 16px;
    margin-bottom: 24px;
  }

  @include mobile {
    padding: 12px 14px;
    margin-bottom: 20px;
  }
}

.filter-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;

  @include mobile {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;

  &.filter-item-search {
    flex: 1;
    min-width: 220px;
  }

  @include mobile {
    width: 100%;
    min-width: 0;

    &.filter-item-search {
      min-width: 0;
    }
  }
}

.filter-label {
  color: var(--text-tertiary);
}

.filter-select {
  width: 100%;
}

.filter-input {
  width: 100%;
}

.filter-actions {
  display: flex;
  align-items: flex-end;
  height: 32px;

  @include mobile {
    height: auto;
  }
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid var(--border-base);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: border-color 0.2s var(--ease-out-expo), color 0.2s var(--ease-out-expo);

  &:hover {
    border-color: var(--gold-400);
    color: var(--text-gold);
  }
}

// ============ 商品网格 ============
.products-wrapper {
  min-height: 320px;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;

  @include lg-only {
    grid-template-columns: repeat(2, 1fr);
  }

  @include tablet {
    grid-template-columns: repeat(2, 1fr);
    gap: 18px;
  }

  @include mobile {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}

.product-card {
  padding: 22px 22px 20px;
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.2s var(--ease-out-expo);
  overflow: hidden;

  &:hover {
    border-color: var(--gold-300);
  }

  &.is-recommended {
    border-color: var(--gold-300);
  }

  @include mobile {
    padding: 18px 16px 16px;
    gap: 12px;
  }
}

// 顶部 2px 金线 + 角标文字（与 Home 一致）
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
}

.sold-out-tag {
  position: absolute;
  top: 6px;
  right: 12px;
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--text-tertiary);
  background: var(--bg-elevated);
  padding: 0 6px;
  text-transform: uppercase;
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  // 左上角 discount-badge 与 product-name 可能重叠时，给 header 留出空间
  padding-left: 4px;
}

.card-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  flex-wrap: nowrap;

  @include mobile {
    gap: 8px;
  }
}

.product-name {
  font-size: 19px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
  line-height: 1.3;
  min-width: 0;
  // 允许换行，避免长名称挤压 zone-tag
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;

  @include mobile {
    font-size: 17px;
  }
}

.zone-tag {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 2px 8px;
  border: 1px solid var(--border-base);
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  align-self: flex-start;
  margin-top: 2px;
}

// 卡片标签组（流量类型 + 网络模式 + 库存）
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

// 流量类型标签（卡片描述下方，区别于 zone-tag 的位置/颜色）
.traffic-tag {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-gold);
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(212, 175, 55, 0.08);
  border: 1px solid rgba(212, 175, 55, 0.25);
}

// 网络模式标签
.net-tag {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: var(--success);
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.25);

  // NAT 共享 IP 用警示色
  &.net-nat {
    color: var(--warning, #e6a23c);
    background: rgba(230, 162, 60, 0.08);
    border-color: rgba(230, 162, 60, 0.25);
  }
}

// 库存标签
.stock-tag {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);

  // 库存紧张用警示色
  &.stock-low {
    color: var(--warning, #e6a23c);
    background: rgba(230, 162, 60, 0.08);
    border-color: rgba(230, 162, 60, 0.25);
    font-weight: 600;
  }
}

.product-desc {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// ============ 规格网格 ============
.spec-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 14px 0;
  border-top: 1px solid var(--border-base);
  border-bottom: 1px solid var(--border-base);

  @include tablet {
    gap: 6px;
    padding: 12px 0;
  }

  @include mobile {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px 12px;
    padding: 12px 0;
  }
}

.spec-cell {
  text-align: left;
  min-width: 0;
  // 防止长数字溢出导致重叠
  overflow: hidden;
  text-overflow: ellipsis;

  .spec-num {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    @include tablet {
      font-size: 14px;
    }

    @include mobile {
      font-size: 15px;
    }
  }

  .spec-name {
    color: var(--text-tertiary);
    margin-top: 4px;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    @include mobile {
      font-size: 11px;
    }
  }
}

// ============ 卡片底部 ============
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  flex-wrap: wrap;

  @include mobile {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}

.price-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;

  @include mobile {
    align-items: center;
  }
}

.official-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);

  .official-label {
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .official-amount {
    text-decoration: line-through;
    font-family: 'JetBrains Mono', monospace;
  }
}

.price-main {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.price-tag {
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--success);
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(76, 175, 80, 0.12);
  font-weight: 700;
}

.price-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-gold);
  line-height: 1;

  @include mobile {
    font-size: 22px;
  }
}

.price-suffix {
  font-size: 12px;
  color: var(--text-tertiary);
}

// 优惠徽章（左上角，独立浮层；为避免与 product-name 重叠，card-header 设置 padding-left）
.discount-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
  background: linear-gradient(135deg, var(--gold-400), var(--gold-600));
  padding: 3px 10px;
  border-radius: 10px 10px 10px 0;
  box-shadow: 0 2px 8px rgba(212, 121, 142, 0.35);
  z-index: 2;

  // 当存在 discount-badge 时，card-header 需要让出空间
  ~ .card-header {
    padding-left: 56px;

    @include mobile {
      padding-left: 52px;
    }
  }
}

.buy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 18px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;

  @include mobile {
    width: 100%;
  }

  &:disabled {
    background: var(--bg-hover);
    color: var(--text-tertiary);
    cursor: not-allowed;
    opacity: 1;
  }
}

// ============ 空状态 & 分页 ============
.empty-wrap {
  padding: 80px 0;
  display: flex;
  justify-content: center;

  @include mobile {
    padding: 48px 0;
  }
}

.pagination-wrap {
  margin-top: 48px;
  display: flex;
  justify-content: center;

  @include mobile {
    margin-top: 28px;
  }
}
</style>
