<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { paymentApi } from '@/api/order';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

// 状态：success / failed / pending / verifying
const orderNo = computed(() => String(route.query.orderNo || ''));
const initialStatus = computed(() => String(route.query.status || ''));

const status = ref<'verifying' | 'success' | 'failed'>('verifying');
const verifying = ref(false);
const retrying = ref(false);

// 判断是否为 mock 模式（未带 redirect 时认为是 mock）
// 此处仅在前端展示中决定是否自动调用 mockPay 验证
const isMockMode = computed(() => {
  // 通常生产环境通过后端配置告知，这里以 query 中无 forceRealPay 为准
  return route.query.forceRealPay !== '1';
});

// 跳转订单列表
function goOrders() {
  router.push('/dashboard/orders');
}

// 跳转首页
function goHome() {
  router.push('/');
}

// 跳转商品列表重新选购
function goProducts() {
  router.push('/products');
}

// 联系客服
function contactSupport() {
  if (auth.isLoggedIn) {
    router.push({ name: 'DashboardTicketNew' });
  } else {
    ElMessage.info('请先登录后提交工单');
    router.push({ name: 'Login', query: { redirect: route.fullPath } });
  }
}

// 调用 mockPay 验证状态
async function verifyPaymentStatus() {
  if (!orderNo.value) {
    status.value = initialStatus.value === 'success' ? 'success' : 'failed';
    return;
  }

  verifying.value = true;
  status.value = 'verifying';
  try {
    const res = await paymentApi.mockPay(orderNo.value);
    if (res.success) {
      // 后端返回的状态优先于 URL query
      const data: any = res.data;
      const paidStatus = data?.status || data?.payStatus || data?.paid;
      if (paidStatus === 'PAID' || paidStatus === 'SUCCESS' || paidStatus === true || paidStatus === 'success') {
        status.value = 'success';
      } else if (paidStatus === 'FAILED' || paidStatus === 'FAILED_PAID' || paidStatus === false) {
        status.value = 'failed';
      } else {
        // 后端未明确状态，使用 URL 中的 status
        status.value = initialStatus.value === 'success' ? 'success' : 'failed';
      }
    } else {
      status.value = initialStatus.value === 'success' ? 'success' : 'failed';
    }
  } catch (e) {
    // 调用失败：以 URL 中的 status 为准
    status.value = initialStatus.value === 'success' ? 'success' : 'failed';
  } finally {
    verifying.value = false;
  }
}

// 重新支付（mock 模式下重新调用 mockPay）
async function handleRetryPay() {
  retrying.value = true;
  try {
    const res = await paymentApi.mockPay(orderNo.value);
    if (res.success) {
      const data: any = res.data;
      const paidStatus = data?.status || data?.payStatus || data?.paid;
      if (paidStatus === 'PAID' || paidStatus === 'SUCCESS' || paidStatus === true) {
        status.value = 'success';
        ElMessage.success('支付成功');
      } else {
        ElMessage.warning('支付尚未完成，请稍后再试');
      }
    }
  } catch (e) {
    // 错误已提示
  } finally {
    retrying.value = false;
  }
}

onMounted(() => {
  // 如果 URL 直接给出了明确状态，先展示，再异步验证
  if (initialStatus.value === 'success') {
    status.value = 'success';
  } else if (initialStatus.value === 'failed') {
    status.value = 'failed';
  }

  // mock 模式下自动调用 mockPay 验证状态
  if (isMockMode.value && orderNo.value) {
    verifyPaymentStatus();
  } else if (!orderNo.value) {
    status.value = 'failed';
  }
});
</script>

<template>
  <div class="payment-result-page">
    <!-- 极淡樱花点缀（二次元属性，克制使用） -->
    <SakuraPetal class="sakura-deco sakura-tl" :size="28" :count="2" />
    <SakuraPetal class="sakura-deco sakura-br" :size="28" :count="2" />

    <div class="result-card-wrap">
      <div class="result-card card">
        <!-- 顶部 2px 金线 -->
        <div class="card-top-line"></div>

        <!-- 验证中状态 -->
        <template v-if="status === 'verifying'">
          <div class="result-status verifying">
            <div class="status-icon-wrap">
              <svg class="status-svg verifying-svg" width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="8" y="8" width="48" height="48" stroke="currentColor" stroke-width="1.5" />
                <path class="spin-arc" d="M32 18 A14 14 0 0 1 46 32" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" fill="none" />
                <rect x="30" y="30" width="4" height="4" fill="currentColor" />
              </svg>
            </div>
            <span class="status-eyebrow eyebrow">Verifying</span>
            <h1 class="status-title font-display">支付结果确认中</h1>
            <p class="status-desc">正在为您确认支付状态，请稍候……</p>

            <div class="order-info-inline">
              <span class="info-label eyebrow">订单编号</span>
              <span class="info-value font-mono">{{ orderNo || '—' }}</span>
            </div>
          </div>
        </template>

        <!-- 支付成功 -->
        <template v-else-if="status === 'success'">
          <div class="result-status success">
            <div class="status-icon-wrap">
              <svg class="status-svg success-svg" width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <!-- 方形外框（锐利几何） -->
                <rect x="8" y="8" width="48" height="48" stroke="currentColor" stroke-width="1.5" />
                <!-- 内部对勾（两段直线，square linecap） -->
                <path class="check-stroke" d="M22 33 L29 40 L43 25" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" fill="none" />
              </svg>
            </div>
            <span class="status-eyebrow eyebrow">Success</span>
            <h1 class="status-title font-display">支付成功</h1>
            <p class="status-desc">感谢您的购买，订单已支付完成，可在用户中心查看详情</p>

            <div class="order-info-card">
              <div class="info-row">
                <span class="info-label eyebrow">订单编号</span>
                <span class="info-value font-mono">{{ orderNo }}</span>
              </div>
              <div class="info-row">
                <span class="info-label eyebrow">支付时间</span>
                <span class="info-value">{{ new Date().toLocaleString('zh-CN') }}</span>
              </div>
              <div class="info-row">
                <span class="info-label eyebrow">支付方式</span>
                <span class="info-value">在线支付</span>
              </div>
            </div>

            <div class="action-row">
              <button type="button" class="btn-gold" @click="goOrders">查看订单</button>
              <button type="button" class="btn-outline" @click="goHome">返回首页</button>
            </div>

            <div class="next-step-tip">
              <span class="tip-dot"></span>
              <span>您可以在「用户中心 - 我的实例」中管理刚购买的服务器</span>
            </div>
          </div>
        </template>

        <!-- 支付失败 -->
        <template v-else>
          <div class="result-status failed">
            <div class="status-icon-wrap">
              <svg class="status-svg failed-svg" width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <!-- 方形外框 -->
                <rect x="8" y="8" width="48" height="48" stroke="currentColor" stroke-width="1.5" />
                <!-- 内部叉号（两条直线，square linecap） -->
                <path class="x-stroke-1" d="M24 24 L40 40" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none" />
                <path class="x-stroke-2" d="M40 24 L24 40" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none" />
              </svg>
            </div>
            <span class="status-eyebrow eyebrow">Failed</span>
            <h1 class="status-title font-display">支付失败</h1>
            <p class="status-desc">很抱歉，您的支付未能完成。您可以重新支付，或联系客服协助处理</p>

            <div class="order-info-card">
              <div class="info-row">
                <span class="info-label eyebrow">订单编号</span>
                <span class="info-value font-mono">{{ orderNo || '—' }}</span>
              </div>
              <div class="info-row">
                <span class="info-label eyebrow">失败时间</span>
                <span class="info-value">{{ new Date().toLocaleString('zh-CN') }}</span>
              </div>
            </div>

            <div class="action-row">
              <button type="button"
                class="btn-gold"
                :disabled="retrying || !orderNo"
                @click="handleRetryPay"
              >
                {{ retrying ? '支付中…' : '重新支付' }}
              </button>
              <button type="button" class="btn-outline" @click="contactSupport">联系客服</button>
            </div>

            <div class="help-tip">
              <span class="tip-eyebrow eyebrow">常见问题</span>
              <ul class="tip-list">
                <li>账户余额不足，请充值后重试</li>
                <li>支付超时，请重新发起支付</li>
                <li>银行卡限额，请更换支付方式</li>
                <li>如问题持续，请联系客服协助</li>
              </ul>
            </div>
          </div>
        </template>

        <!-- 底部导航 -->
        <div class="card-footer">
          <button type="button" class="footer-link" @click="goProducts">继续浏览商品</button>
          <span class="footer-divider">·</span>
          <button type="button" class="footer-link" @click="goHome">返回首页</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.payment-result-page {
  min-height: calc(100vh - 64px);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  background: var(--bg-base);
  overflow: hidden;

  @include mobile {
    min-height: calc(100vh - 56px);
    padding: 24px 16px;
    align-items: flex-start;
  }
}

// ============ 樱花点缀（极淡） ============
.sakura-deco {
  position: absolute;
  pointer-events: none;
  opacity: 0.35;
  z-index: 0;

  &.sakura-tl {
    top: 32px;
    left: 32px;
  }

  &.sakura-br {
    bottom: 32px;
    right: 32px;
  }

  @include mobile {
    opacity: 0.22;

    &.sakura-tl {
      top: 16px;
      left: 16px;
    }

    &.sakura-br {
      bottom: 16px;
      right: 16px;
    }
  }
}

// ============ 卡片 ============
.result-card-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  animation: fadeUp 0.6s var(--ease-out-expo) both;
}

.result-card {
  padding: 48px 40px 28px;
  text-align: center;
  position: relative;
  overflow: hidden;

  @include tablet-down {
    padding: 40px 32px 24px;
  }

  @include mobile {
    padding: 32px 20px 20px;
  }
}

// 顶部 2px 金线（与套餐卡一致）
.card-top-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--gold-400);
}

.result-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

// ============ 状态图标（几何 SVG） ============
.status-icon-wrap {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;

  @include mobile {
    width: 64px;
    height: 64px;
  }
}

.status-svg {
  display: block;

  &.success-svg {
    color: var(--success);
    animation: pop-in 0.5s var(--ease-out-expo) both;
  }

  &.failed-svg {
    color: var(--danger);
    animation: pop-in 0.5s var(--ease-out-expo) both;
  }

  &.verifying-svg {
    color: var(--gold-400);
  }
}

// 对勾描边动画
.check-stroke {
  stroke-dasharray: 30;
  stroke-dashoffset: 30;
  animation: draw-stroke 0.5s var(--ease-out-expo) 0.25s forwards;
}

// 叉号描边动画（两段，错峰）
.x-stroke-1 {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: draw-stroke 0.3s var(--ease-out-expo) 0.25s forwards;
}

.x-stroke-2 {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: draw-stroke 0.3s var(--ease-out-expo) 0.45s forwards;
}

// 验证中的弧线旋转
.spin-arc {
  transform-box: view-box;
  transform-origin: 32px 32px;
  animation: rotate 1.2s linear infinite;
}

@keyframes pop-in {
  0% {
    transform: scale(0.6);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes draw-stroke {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}

// ============ 文本 ============
.status-eyebrow {
  font-size: 10px;
}

.status-title {
  font-size: 32px;
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.5px;
  color: var(--text-primary);

  @include tablet-down {
    font-size: 28px;
  }

  @include mobile {
    font-size: 24px;
  }
}

.status-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0;
  max-width: 360px;

  @include mobile {
    font-size: 12px;
    max-width: 100%;
  }
}

// ============ 订单信息（验证中：单行内联） ============
.order-info-inline {
  margin-top: 12px;
  padding: 10px 18px;
  border: 1px solid var(--border-base);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 12px;

  .info-label {
    font-size: 10px;
  }

  .info-value {
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 500;
  }
}

// ============ 订单信息卡片（成功 / 失败） ============
.order-info-card {
  width: 100%;
  margin-top: 12px;
  padding: 4px 0;
  text-align: left;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--border-base);
  gap: 12px;
  flex-wrap: wrap;

  &:last-child {
    border-bottom: none;
  }

  .info-label {
    font-size: 10px;
    flex-shrink: 0;
  }

  .info-value {
    color: var(--text-primary);
    font-weight: 500;
    text-align: right;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-all;
  }

  @include mobile {
    padding: 10px 0;
    font-size: 12px;
  }
}

// ============ 按钮区 ============
.action-row {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  flex-wrap: wrap;
  justify-content: center;

  .btn-gold,
  .btn-outline {
    flex: 1;
    min-width: 120px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  @include mobile {
    flex-direction: column;
    margin-top: 18px;
    gap: 10px;

    .btn-gold,
    .btn-outline {
      width: 100%;
      min-width: 0;
    }
  }
}

// ============ 提示信息（成功：下一步） ============
.next-step-tip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.3px;

  .tip-dot {
    width: 4px;
    height: 4px;
    background: var(--gold-400);
    flex-shrink: 0;
  }

  @include mobile {
    margin-top: 16px;
    font-size: 10px;
    text-align: left;
    line-height: 1.5;
  }
}

// ============ 帮助提示（失败：常见问题） ============
.help-tip {
  margin-top: 20px;
  width: 100%;
  text-align: left;
  padding: 16px 18px;
  border: 1px solid var(--border-base);
  border-radius: 4px;

  .tip-eyebrow {
    display: block;
    font-size: 10px;
    margin-bottom: 10px;
  }

  .tip-list {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      font-size: 11px;
      color: var(--text-tertiary);
      padding: 4px 0 4px 14px;
      position: relative;
      line-height: 1.6;

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 11px;
        width: 6px;
        height: 1px;
        background: var(--gold-400);
      }
    }
  }

  @include mobile {
    margin-top: 16px;
    padding: 14px 16px;

    .tip-list li {
      font-size: 10px;
    }
  }
}

// ============ 卡片底部 ============
.card-footer {
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px dashed var(--border-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;

  @include mobile {
    margin-top: 22px;
    padding-top: 14px;
    gap: 10px;
  }
}

.footer-link {
  background: none;
  border: none;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  letter-spacing: 0.5px;
  transition: color 0.2s var(--ease-out-expo);

  &:hover {
    color: var(--text-gold);
  }
}

.footer-divider {
  color: var(--border-base);
  font-size: 11px;
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
  .result-card-wrap,
  .status-svg,
  .check-stroke,
  .x-stroke-1,
  .x-stroke-2,
  .spin-arc {
    animation: none;
  }

  .check-stroke,
  .x-stroke-1,
  .x-stroke-2 {
    stroke-dashoffset: 0;
  }
}

// ============ 小屏手机横屏：极端紧凑 ============
@include sm-only {
  .result-card {
    padding: 24px 16px 16px;
  }

  .status-title {
    font-size: 22px;
  }
}
</style>
