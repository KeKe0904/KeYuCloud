<template>
  <view class="app">
    <ui-app-bar title="用户详情" :show-back="true" :show-avatar="true" @avatar="goProfile" />
    <scroll-view class="app-content no-nav" scroll-y>
      <!-- user card -->
      <view class="card user-card" v-if="user">
        <view class="row gap-12">
          <view class="user-avatar"><ui-icon name="user" :size="56" /></view>
          <view class="flex-1">
            <view class="row gap-8 wrap">
              <text class="user-name">{{ user.name }}</text>
              <ui-pill
                :variant="userStatus(user.status).variant"
                :icon="userStatus(user.status).icon"
                :text="userStatus(user.status).label"
              />
            </view>
            <view class="user-phone mono">{{ user.phone }}</view>
          </view>
        </view>
        <view class="divider" />
        <view class="balance-row">
          <view class="balance-label">账户余额</view>
          <view class="balance-value serif">¥{{ formatNum(user.balance) }}</view>
        </view>
      </view>

      <!-- segmented -->
      <ui-segmented :items="tabs" v-model="currentTab" class="mt-12" />

      <!-- 概览 -->
      <view v-if="currentTab === '概览'">
        <view class="card mt-12">
          <view class="kv"><text class="k">用户ID</text><text class="v mono">{{ user?.id }}</text></view>
          <view class="kv"><text class="k">注册时间</text><text class="v">{{ user?.createdAt }}</text></view>
          <view class="kv"><text class="k">最后登录</text><text class="v">{{ user?.lastLoginAt }}</text></view>
          <view class="kv"><text class="k">累计消费</text><text class="v">¥{{ formatNum(user?.totalSpend || 0) }}</text></view>
          <view class="kv"><text class="k">订单数</text><text class="v">{{ user?.orderCount }}</text></view>
          <view class="kv"><text class="k">产品数</text><text class="v">{{ user?.productCount }}</text></view>
          <view class="kv"><text class="k">工单数</text><text class="v">{{ user?.ticketCount }}</text></view>
        </view>
      </view>

      <!-- 订单 -->
      <view v-else-if="currentTab === '订单'">
        <view class="section-label mt-12">最近订单</view>
        <view class="list-card" v-if="user?.recentOrders && user.recentOrders.length">
          <view
            v-for="o in user.recentOrders"
            :key="o.id"
            class="lc-item"
            @click="goOrder(o)"
          >
            <view class="lc-main">
              <view class="lc-title mono">{{ o.orderNo }}</view>
              <view class="lc-sub">{{ o.productName }} · {{ o.period }}</view>
            </view>
            <view class="lc-right">
              <text class="lc-amount">¥{{ formatNum(o.amount) }}</text>
              <ui-pill
                :variant="orderStatus(o.status).variant"
                :icon="orderStatus(o.status).icon"
                :text="orderStatus(o.status).label"
              />
            </view>
            <view class="lc-chev"><ui-icon name="chevron-right" :size="32" /></view>
          </view>
        </view>
        <ui-empty v-else text="暂无订单" />
      </view>

      <!-- 产品 -->
      <view v-else-if="currentTab === '产品'">
        <ui-empty text="暂无产品" />
      </view>

      <!-- 工单 -->
      <view v-else-if="currentTab === '工单'">
        <ui-empty text="暂无工单" />
      </view>

      <!-- 财务 -->
      <view v-else-if="currentTab === '财务'">
        <view class="card mt-12">
          <view class="kv"><text class="k">账户余额</text><text class="v">¥{{ formatNum(user?.balance || 0) }}</text></view>
          <view class="kv"><text class="k">累计消费</text><text class="v">¥{{ formatNum(user?.totalSpend || 0) }}</text></view>
        </view>
      </view>
    </scroll-view>

    <ui-action-bar>
      <ui-button variant="secondary" @click="showAdjust = true">
        <ui-icon name="wallet" :size="32" />
        调整余额
      </ui-button>
      <ui-button variant="danger" @click="onToggleBan">
        <ui-icon :name="user?.status === 'BANNED' ? 'circle-check' : 'circle-minus'" :size="32" />
        {{ user?.status === 'BANNED' ? '解封用户' : '封禁用户' }}
      </ui-button>
    </ui-action-bar>

    <!-- adjust sheet -->
    <ui-sheet :visible="showAdjust" title="调整余额" @close="showAdjust = false">
      <view class="sheet-row">
        <text>当前余额</text>
        <text class="mono">¥{{ formatNum(user?.balance || 0) }}</text>
      </view>
      <view class="field mt-8">
        <ui-field v-model="adjust.amount" type="number" placeholder="正数增加，负数扣除" label="调整金额" />
      </view>
      <view class="field">
        <ui-field v-model="adjust.remark" type="textarea" placeholder="请输入备注说明" label="备注" />
      </view>
      <ui-button class="mt-8" block @click="submitAdjust">确认调整</ui-button>
    </ui-sheet>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';
import { USER_STATUS, ORDER_STATUS, pickStatus, formatNum } from '../../common/format';

export default {
  data() {
    return {
      userId: null,
      user: null,
      currentTab: '概览',
      tabs: ['概览', '订单', '产品', '工单', '财务'],
      showAdjust: false,
      adjust: { amount: '', remark: '' },
    };
  },
  onLoad(query) {
    this.userId = +query.id;
  },
  onShow() {
    if (this.userId) this.loadData();
  },
  methods: {
    formatNum,
    userStatus(s) { return pickStatus(USER_STATUS, s); },
    orderStatus(s) { return pickStatus(ORDER_STATUS, s); },
    async loadData() {
      try {
        this.user = await adminApi.userDetail(this.userId);
      } catch (e) { console.error(e); }
    },
    goOrder(o) {
      uni.navigateTo({ url: `/pages/admin/order-detail?id=${o.id}` });
    },
    goProfile() {
      uni.switchTab({ url: '/pages/profile/profile' });
    },
    async onToggleBan() {
      if (!this.user) return;
      const newStatus = this.user.status === 'BANNED' ? 'ACTIVE' : 'BANNED';
      uni.showModal({
        title: newStatus === 'BANNED' ? '确认封禁' : '确认解封',
        content: `确定要${newStatus === 'BANNED' ? '封禁' : '解封'}用户 ${this.user.name} 吗？`,
        success: async (res) => {
          if (res.confirm) {
            try {
              await adminApi.updateUserStatus(this.userId, newStatus);
              this.user.status = newStatus;
              uni.showToast({ title: '操作成功', icon: 'success' });
            } catch (e) {}
          }
        },
      });
    },
    async submitAdjust() {
      const amount = parseFloat(this.adjust.amount);
      if (!amount || isNaN(amount)) {
        uni.showToast({ title: '请输入有效金额', icon: 'none' });
        return;
      }
      try {
        await adminApi.adjustBalance(this.userId, amount, this.adjust.remark);
        uni.showToast({ title: '调整成功', icon: 'success' });
        this.showAdjust = false;
        this.adjust = { amount: '', remark: '' };
        this.loadData();
      } catch (e) {}
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx 32rpx 220rpx; }
.user-card { padding-bottom: 24rpx; }
.user-avatar {
  width: 96rpx; height: 96rpx;
  border-radius: 999rpx;
  background: var(--color-surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.user-name {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--color-text);
}
.user-phone {
  font-size: 26rpx;
  color: var(--color-text-muted);
  margin-top: 4rpx;
}
.balance-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 8rpx;
}
.balance-label {
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.balance-value {
  font-size: 56rpx;
  font-weight: 600;
  color: var(--color-text);
}
.flex-1 { flex: 1; min-width: 0; }
</style>
