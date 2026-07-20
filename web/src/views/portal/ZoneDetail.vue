<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { productApi, type Product, MACHINE_LABELS, LINE_LABELS, CHARGE_TYPE_LABELS, NET_ZONE_LABELS } from '@/api/product';

const route = useRoute();
const router = useRouter();

// 当前路由的 zone 参数（如 cn-sq1）
const currentZone = computed(() => String(route.params.zone || ''));

// 当前 zone 的中文名
const currentZoneName = computed(() => {
  if (!currentZone.value) return '';
  // 优先从 NET_ZONE_LABELS 取，其次从 zoneOptions 中匹配
  if (NET_ZONE_LABELS[currentZone.value]) return NET_ZONE_LABELS[currentZone.value];
  const opt = zoneOptions.value.find((z) => z.code === currentZone.value);
  return opt?.name || currentZone.value;
});

// 数据状态
const loading = ref(false);
const products = ref<Product[]>([]);
const zoneOptions = ref<{ code: string; name: string }[]>([]);

// 服务器处理器 tab（基于 machine 字段）
// 单个 zone 内可能有多种处理器型号（G6v2 / EPYCv2 / EPYCv3），按 tab 分组对比
const machineTabs = computed<string[]>(() => {
  const set = new Set<string>();
  for (const p of products.value) {
    const m = (p as any).machine;
    if (m) set.add(m);
  }
  // 排序：未知放最后
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

// 当前选中的处理器 tab
const selectedMachine = ref<string>('');
watch(machineTabs, (tabs) => {
  if (tabs.length && !tabs.includes(selectedMachine.value)) {
    selectedMachine.value = tabs[0];
  }
}, { immediate: true });

// 按处理器过滤后的商品列表
const filteredProducts = computed<Product[]>(() => {
  if (!selectedMachine.value) return products.value;
  return products.value.filter((p) => (p as any).machine === selectedMachine.value);
});

// 按网络线路分组（同一处理器下可能有 single/bgp/3c/opt 多种线路）
const groupedByLine = computed<{ line: string; label: string; items: Product[] }[]>(() => {
  const groups = new Map<string, Product[]>();
  for (const p of filteredProducts.value) {
    const line = (p as any).line || 'default';
    if (!groups.has(line)) groups.set(line, []);
    groups.get(line)!.push(p);
  }
  return Array.from(groups.entries())
    .map(([line, items]) => ({
      line,
      label: LINE_LABELS[line] || (line === 'default' ? '默认线路' : line),
      items: items.sort((a, b) => {
        // 按 cpu 升序，再按 memory 升序
        const c = (a.cpu || 0) - (b.cpu || 0);
        if (c !== 0) return c;
        return (a.memory || 0) - (b.memory || 0);
      }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

// 计费类型分组（package=不限流量 / package_traffic=流量叠加）
const chargeTypeLabel = (p: Product): string => {
  const ct = (p as any).chargeType;
  if (!ct) return '';
  return CHARGE_TYPE_LABELS[ct] || ct;
};

// 取起售价 = 机器月价（NAT 共享 IP 商品）/ 机器月价 + 最便宜 IP 月价（独立 IP 商品）
// 注：NAT 共享 IP 商品默认使用共享 IP（免费），仅当用户主动加购独立 IP 时才计 IP 价
//     因此起售价仅含机器月价，与 Products.vue / ProductDetail.vue 行为一致
function getStartingPrice(p: Product): number {
  try {
    const prices: any = typeof (p as any).prices === 'string'
      ? JSON.parse((p as any).prices || '{}')
      : ((p as any).prices || {});
    const machineMonthly = Number(prices?.['1'] ?? 0);
    if (!machineMonthly || isNaN(machineMonthly)) return 0;

    // NAT 共享 IP 商品：默认使用共享 IP（免费），起售价仅机器月价
    const isNat = (p as any).netMode === 'nat';
    if (isNat) return machineMonthly;

    let ipMin = 0;
    const ipPrices: any = (p as any).ipPrices;
    if (ipPrices) {
      const obj = typeof ipPrices === 'string' ? JSON.parse(ipPrices) : ipPrices;
      const vals = Object.values(obj || {})
        .map((v) => Number(v))
        .filter((v) => !isNaN(v) && v >= 0);
      if (vals.length) {
        ipMin = vals.some((v) => v === 0) ? 0 : Math.min(...vals);
      }
    }
    return machineMonthly + ipMin;
  } catch {
    return 0;
  }
}

// 跳转商品详情
function goProduct(id: number) {
  router.push({ name: 'ProductDetail', params: { id } });
}

// 跳转到其他区域
function goZone(zone: string) {
  if (!zone || zone === currentZone.value) return;
  router.push({ name: 'ZoneDetail', params: { zone } });
}

// 拉取该区域所有在售商品
async function fetchProducts() {
  loading.value = true;
  try {
    const res = await productApi.list({ zone: currentZone.value, pageSize: 200 });
    if (res.success) {
      const data: any = res.data;
      products.value = Array.isArray(data) ? data : (data.list || data.items || []);
    }
  } catch {
    // 错误已由拦截器提示
  } finally {
    loading.value = false;
  }
}

// 拉取所有区域（用于区域切换）
async function fetchZones() {
  try {
    const res = await productApi.zones();
    if (res.success) {
      zoneOptions.value = (res.data || []).map((z: any) => ({
        code: z.code || z.zone || '',
        name: z.name || z.zoneName || z.code,
      }));
    }
  } catch {
    // 静默失败
  }
}

onMounted(() => {
  fetchZones();
  fetchProducts();
});

// 监听路由 zone 变化
watch(currentZone, () => {
  fetchProducts();
});
</script>

<template>
  <div class="zone-detail-page" v-loading="loading">
    <!-- 面包屑 -->
    <div class="breadcrumb-bar">
      <div class="container">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
          <el-breadcrumb-item :to="{ path: '/products' }">云服务器</el-breadcrumb-item>
          <el-breadcrumb-item>{{ currentZoneName || currentZone }} 套餐对比</el-breadcrumb-item>
        </el-breadcrumb>
      </div>
    </div>

    <!-- 页面头部 -->
    <section class="page-header">
      <div class="container">
        <div class="header-eyebrow eyebrow">
          <span class="eyebrow-dot"></span>
          ZONE COMPARISON
        </div>
        <h1 class="page-title font-display">
          {{ currentZoneName || currentZone }}
          <span class="page-title-suffix">· 套餐对比</span>
        </h1>
        <p class="page-subtitle">
          同区域所有套餐横向对比，按处理器型号和网络线路分组，快速选出最适合的方案
        </p>

        <!-- 区域切换 -->
        <div class="zone-switcher" v-if="zoneOptions.length > 1">
          <span class="zone-switcher-label eyebrow">切换区域</span>
          <div class="zone-switcher-list">
            <button
              v-for="z in zoneOptions"
              :key="z.code"
              type="button"
              class="zone-switcher-item"
              :class="{ active: z.code === currentZone }"
              @click="goZone(z.code)"
            >
              {{ z.name }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 主体 -->
    <section class="page-body">
      <div class="container">
        <!-- 处理器 tab -->
        <div class="machine-tabs" v-if="machineTabs.length">
          <span class="machine-tabs-label eyebrow">处理器型号</span>
          <div class="machine-tabs-list">
            <button
              v-for="m in machineTabs"
              :key="m"
              type="button"
              class="machine-tab"
              :class="{ active: selectedMachine === m }"
              @click="selectedMachine = m"
            >
              {{ MACHINE_LABELS[m] || m }}
            </button>
          </div>
        </div>

        <!-- 按网络线路分组对比 -->
        <div v-if="groupedByLine.length" class="line-groups">
          <div v-for="g in groupedByLine" :key="g.line" class="line-group">
            <div class="line-group-head">
              <h2 class="line-group-title font-display">
                {{ g.label }}
                <span class="line-group-count font-mono">{{ g.items.length }} 个套餐</span>
              </h2>
            </div>
            <div class="compare-table-wrap">
              <table class="compare-table">
                <thead>
                  <tr>
                    <th>套餐</th>
                    <th class="num-col">CPU</th>
                    <th class="num-col">内存</th>
                    <th class="num-col">系统盘</th>
                    <th class="num-col">带宽</th>
                    <th class="num-col">月流量</th>
                    <th class="num-col">网络</th>
                    <th class="num-col">起售价</th>
                    <th class="action-col"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in g.items" :key="p.id" @click="goProduct(p.id)" class="compare-row">
                    <td class="name-cell">
                      <div class="cell-name">{{ p.name }}</div>
                      <div class="cell-tags">
                        <span v-if="p.isRecommended" class="rec-tag font-mono">推荐</span>
                        <span v-if="chargeTypeLabel(p)" class="charge-tag font-mono">{{ chargeTypeLabel(p) }}</span>
                        <span class="net-tag font-mono" :class="{ 'net-nat': (p as any).netMode === 'nat' }">
                          {{ (p as any).netMode === 'nat' ? 'NAT' : '独立IP' }}
                        </span>
                      </div>
                    </td>
                    <td class="num-cell font-mono">{{ p.cpu }} 核</td>
                    <td class="num-cell font-mono">{{ p.memory }} GB</td>
                    <td class="num-cell font-mono">{{ p.disk }} GB</td>
                    <td class="num-cell font-mono">
                      <template v-if="p.netIn && p.netIn !== p.bandwidth">
                        {{ p.netIn }}/{{ p.bandwidth }}
                      </template>
                      <template v-else>{{ p.bandwidth }}</template>
                      Mbps
                    </td>
                    <td class="num-cell font-mono">
                      <template v-if="p.trafficType === 'stacked'">{{ p.traffic }} GB</template>
                      <template v-else>不限</template>
                    </td>
                    <td class="num-cell font-mono">
                      <span :class="(p as any).netMode === 'nat' ? 'text-nat' : 'text-normal'">
                        {{ (p as any).netMode === 'nat' ? 'NAT 共享' : '独立 IP' }}
                      </span>
                    </td>
                    <td class="num-cell price-cell">
                      <div class="price-text font-display">¥{{ getStartingPrice(p).toFixed(2) }}</div>
                      <div class="price-suffix">/月起</div>
                    </td>
                    <td class="action-cell">
                      <button type="button" class="btn-gold-mini" @click.stop="goProduct(p.id)">
                        查看
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!loading" class="empty-wrap">
          <el-empty description="该区域暂无在售套餐">
            <button type="button" class="btn-gold" @click="router.push('/products')">返回商品列表</button>
          </el-empty>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.zone-detail-page {
  min-height: 60vh;
}

.container {
  max-width: 1280px;
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
  padding: 16px 0;

  .container {
    padding-top: 0;
    padding-bottom: 0;
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

// ============ 页面头部 ============
.page-header {
  padding: 56px 0 40px;
  background: var(--bg-base);
  animation: fadeUp 0.6s var(--ease-out-expo) both;

  @include tablet-down {
    padding: 40px 0 28px;
  }

  @include mobile {
    padding: 28px 0 20px;
  }
}

.header-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 11px;

  .eyebrow-dot {
    width: 6px;
    height: 6px;
    background: var(--gold-400);
    display: inline-block;
  }
}

.page-title {
  font-size: clamp(30px, 4vw, 44px);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 14px;
  letter-spacing: -0.5px;
  line-height: 1.15;

  .page-title-suffix {
    font-size: 0.55em;
    font-weight: 400;
    color: var(--text-tertiary);
    margin-left: 8px;
  }
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0 0 24px;
  max-width: 680px;

  @include mobile {
    font-size: 13px;
    margin-bottom: 18px;
  }
}

// 区域切换器
.zone-switcher {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 14px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  border-radius: 6px;

  @include mobile {
    flex-direction: column;
    gap: 8px;
  }
}

.zone-switcher-label {
  font-size: 10px;
  color: var(--text-tertiary);
  padding-top: 8px;
  flex-shrink: 0;
}

.zone-switcher-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.zone-switcher-item {
  border: 1px solid var(--border-base);
  background: var(--bg-base);
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
  font-family: inherit;
  font-size: 12px;
  color: var(--text-secondary);

  &:hover {
    border-color: var(--gold-300);
    color: var(--text-primary);
  }

  &.active {
    border-color: var(--gold-400);
    background: var(--gold-50);
    color: var(--text-gold);
    font-weight: 500;
  }
}

// ============ 主体 ============
.page-body {
  padding: 16px 0 80px;
  background: var(--bg-base);

  @include tablet-down {
    padding: 12px 0 64px;
  }

  @include mobile {
    padding: 8px 0 40px;
  }
}

// 处理器 tab
.machine-tabs {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 28px;
  padding: 14px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  border-radius: 6px;

  @include mobile {
    flex-direction: column;
    gap: 8px;
  }
}

.machine-tabs-label {
  font-size: 10px;
  color: var(--text-tertiary);
  padding-top: 8px;
  flex-shrink: 0;
}

.machine-tabs-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.machine-tab {
  border: 1px solid var(--border-base);
  background: var(--bg-base);
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);

  &:hover {
    border-color: var(--gold-300);
    color: var(--text-primary);
  }

  &.active {
    border-color: var(--gold-400);
    background: var(--gold-50);
    color: var(--text-gold);
  }
}

// 按线路分组
.line-groups {
  display: flex;
  flex-direction: column;
  gap: 32px;

  @include mobile {
    gap: 20px;
  }
}

.line-group {
  animation: fadeUp 0.5s var(--ease-out-expo) both;
}

.line-group-head {
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--border-base);
}

.line-group-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  letter-spacing: -0.2px;

  @include mobile {
    font-size: 17px;
  }
}

.line-group-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-tertiary);
  padding: 2px 8px;
  background: var(--bg-elevated);
  border-radius: 10px;
}

// 对比表格
.compare-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-base);
  border-radius: 6px;
  background: var(--bg-elevated);

  @include mobile {
    margin: 0 -16px;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 880px;

  thead {
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-base);
  }

  th {
    padding: 12px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;

    &.num-col {
      text-align: center;
    }

    &.action-col {
      width: 80px;
    }
  }

  .compare-row {
    cursor: pointer;
    transition: background 0.15s var(--ease-out-expo);
    border-bottom: 1px dashed var(--border-base);

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: var(--gold-50);

      .btn-gold-mini {
        background: linear-gradient(135deg, var(--gold-400), var(--gold-600));
        color: #fff;
      }
    }
  }

  td {
    padding: 14px;
    font-size: 13px;
    color: var(--text-secondary);
    vertical-align: middle;

    &.num-cell {
      text-align: center;
      color: var(--text-primary);
      font-weight: 500;
    }

    &.name-cell {
      .cell-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary);
        margin-bottom: 4px;
      }

      .cell-tags {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }

      .rec-tag {
        font-size: 10px;
        color: #fff;
        background: linear-gradient(135deg, var(--gold-400), var(--gold-600));
        padding: 1px 5px;
        border-radius: 3px;
      }

      .charge-tag {
        font-size: 10px;
        color: var(--text-gold);
        border: 1px solid var(--border-gold);
        padding: 0 4px;
        border-radius: 3px;
      }

      .net-tag {
        font-size: 10px;
        padding: 0 4px;
        border-radius: 3px;
        border: 1px solid var(--border-base);
        color: var(--text-tertiary);

        &.net-nat {
          color: var(--warning, #e6a23c);
          border-color: var(--warning, #e6a23c);
        }
      }
    }

    &.price-cell {
      .price-text {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-gold);
        line-height: 1.1;
      }

      .price-suffix {
        font-size: 10px;
        color: var(--text-tertiary);
        margin-top: 2px;
      }
    }

    &.action-cell {
      text-align: right;
    }

    .text-nat {
      color: var(--warning, #e6a23c);
    }

    .text-normal {
      color: var(--success);
    }
  }

  @include mobile {
    th,
    td {
      padding: 10px 8px;
      font-size: 12px;
    }

    td.name-cell .cell-name {
      font-size: 13px;
    }

    td.price-cell .price-text {
      font-size: 15px;
    }
  }
}

.btn-gold-mini {
  display: inline-block;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-gold);
  background: var(--bg-base);
  border: 1px solid var(--border-gold);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
  font-family: inherit;

  &:hover {
    background: linear-gradient(135deg, var(--gold-400), var(--gold-600));
    color: #fff;
  }
}

// 空状态
.empty-wrap {
  padding: 80px 24px;
  display: flex;
  justify-content: center;

  @include mobile {
    padding: 40px 16px;
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
  .page-header,
  .line-group {
    animation: none;
  }
}
</style>
