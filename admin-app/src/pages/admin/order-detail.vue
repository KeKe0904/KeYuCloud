<template>
  <view class="app">
    <ui-app-bar title="订单详情" :show-back="true" />
    <scroll-view class="app-content no-nav" scroll-y>
      <!-- order info -->
      <view class="section-label">订单信息</view>
      <view class="card" v-if="order">
        <view class="kv"><text class="k">订单号</text><text class="v mono">{{ order.orderNo }}</text></view>
        <view class="kv"><text class="k">用户</text><text class="v">{{ order.userName }}</text></view>
        <view class="kv"><text class="k">商品</text><text class="v">{{ order.productName }}</text></view>
        <view class="kv"><text class="k">规格</text><text class="v mono">{{ order.spec }}</text></view>
        <view class="kv"><text class="k">金额</text><text class="v serif amount">{{ formatMoney(order.amount) }}</text></view>
        <view class="kv"><text class="k">支付方式</text><text class="v">{{ order.payMethod }}</text></view>
        <view class="kv">
          <text class="k">状态</text>
          <ui-pill
            :variant="orderStatus(order.status).variant"
            :icon="orderStatus(order.status).icon"
            :text="orderStatus(order.status).label"
          />
        </view>
        <view class="kv"><text class="k">下单时间</text><text class="v">{{ order.createdAt }}</text></view>
        <view class="kv"><text class="k">支付时间</text><text class="v">{{ order.paidAt || '-' }}</text></view>
      </view>

      <!-- timeline -->
      <view class="section-label mt-12">开通状态</view>
      <view class="card" v-if="order && order.timeline">
        <view class="timeline">
          <view
            v-for="(step, i) in order.timeline"
            :key="i"
            class="tl-step"
            :class="{ 'is-done': step.status === 'done', 'is-current': step.status === 'current' }"
          >
            <view class="tl-dot">
              <ui-icon :name="step.status === 'done' ? 'check' : (step.status === 'current' ? 'circle-play' : 'circle-check')" :size="24" />
            </view>
            <view class="tl-title">{{ step.title }}</view>
            <view class="tl-time">{{ step.time }}</view>
          </view>
        </view>
      </view>
    </scroll-view>

    <ui-action-bar>
      <ui-button variant="secondary" @click="contactUser">联系用户</ui-button>
      <ui-button
        variant="danger"
        :disabled="order && !['PAID', 'OPENED'].includes(order.status)"
        @click="onRefund"
      >
        退款
      </ui-button>
    </ui-action-bar>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { ORDER_STATUS, pickStatus, formatMoney } from '../../common/format';

export default {
  data() {
    return {
      orderId: null,
      order: null,
    };
  },
  onLoad(query) {
    this.orderId = +query.id;
  },
  onShow() {
    if (this.orderId) this.loadData();
  },
  methods: {
    formatMoney,
    orderStatus(s) { return pickStatus(ORDER_STATUS, s); },
    async loadData() {
      try {
        this.order = await adminApi.orderDetail(this.orderId);
      } catch (e) { console.error(e); }
    },
    contactUser() {
      uni.showToast({ title: '请在工单系统中联系用户', icon: 'none' });
    },
    onRefund() {
      uni.showModal({
        title: '确认退款',
        content: `确定对订单 ${this.order.orderNo} 发起退款吗？`,
        editable: true,
        placeholderText: '请输入退款原因',
        success: async (res) => {
          if (res.confirm) {
            try {
              await adminApi.refundOrder(this.orderId, res.content || '管理员手动退款');
              uni.showToast({ title: '退款已发起', icon: 'success' });
              this.loadData();
            } catch (e) {}
          }
        },
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx 32rpx 220rpx; }
.amount {
  font-size: 36rpx;
  font-weight: 600;
}
</style>
