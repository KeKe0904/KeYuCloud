<template>
  <view class="app">
    <ui-app-bar title="上游配置" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <!-- RainYun API 配置 -->
      <view class="card">
        <view class="card-header">
          <ui-icon name="cloud" :size="36" />
          <text class="card-title">RainYun API 配置</text>
        </view>
        <ui-field
          v-model="form.apiKey"
          label="API Key"
          type="password"
          placeholder="请输入 RainYun API Key"
          hint="在 RainYun 控制台 → API 设置中获取"
          :suffix="showApiKey ? 'eye-off' : 'eye'"
          @suffix-click="showApiKey = !showApiKey"
        />
        <ui-field
          v-model="form.apiBase"
          label="API 地址"
          placeholder="https://api.rainyun.com"
          input-class="mono"
          disabled
          hint="上游 API 固定地址，不可修改"
        />
        <view class="status-row" v-if="connected !== null">
          <ui-pill
            :variant="connected ? 'success' : 'danger'"
            :icon="connected ? 'check' : 'circle-minus'"
            :text="connected ? '已连接' : '未连接'"
          />
          <text class="status-meta" v-if="lastSyncAt">上次同步 {{ lastSyncAt }}</text>
        </view>
      </view>

      <!-- 白标面板配置 -->
      <view class="card">
        <view class="card-header">
          <ui-icon name="settings" :size="36" />
          <text class="card-title">白标面板配置</text>
        </view>
        <ui-field
          v-model="form.panelDomain"
          label="面板域名"
          placeholder="panel.keyuyun.com"
          input-class="mono"
        />
        <ui-field
          v-model="form.panelName"
          label="面板名称"
          placeholder="柯羽云"
        />
        <ui-field
          v-model="form.icpNo"
          label="备案号"
          placeholder="京ICP备XXXXXXXX号"
        />
      </view>
    </scroll-view>

    <ui-action-bar>
      <ui-button variant="secondary" :block="true" @click="onTest">
        <ui-icon name="zap" :size="32" /> 测试连接
      </ui-button>
      <ui-button variant="primary" :block="true" @click="onSave">
        <ui-icon name="save" :size="32" /> 保存
      </ui-button>
    </ui-action-bar>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';

export default {
  data() {
    return {
      showApiKey: false,
      connected: null,
      lastSyncAt: '',
      form: {
        apiKey: '',
        apiBase: 'https://api.rainyun.com',
        panelDomain: '',
        panelName: '',
        icpNo: '',
      },
    };
  },
  onLoad() { this.loadData(); },
  methods: {
    async loadData() {
      uni.showLoading({ title: '加载中' });
      try {
        const [api, panel] = await Promise.all([
          adminApi.rainyunApiKeyConfig(),
          adminApi.upstreamPanelConfig(),
        ]);
        this.form.apiKey = api.apiKey || '';
        this.form.apiBase = api.apiBase || 'https://api.rainyun.com';
        this.connected = api.connected ?? null;
        this.lastSyncAt = api.lastSyncAt || '';
        this.form.panelDomain = panel.panelDomain || '';
        this.form.panelName = panel.panelName || '';
        this.form.icpNo = panel.icpNo || '';
      } catch (e) {}
      uni.hideLoading();
    },
    onTest() {
      uni.showLoading({ title: '测试中' });
      adminApi.testRainyunApiKey()
        .then(() => {
          this.connected = true;
          uni.showToast({ title: '连接成功', icon: 'success' });
        })
        .catch(() => {
          this.connected = false;
        })
        .finally(() => uni.hideLoading());
    },
    onSave() {
      if (!this.form.apiKey) {
        uni.showToast({ title: '请填写 API Key', icon: 'none' });
        return;
      }
      uni.showLoading({ title: '保存中' });
      Promise.all([
        adminApi.updateRainyunApiKey({
          apiKey: this.form.apiKey,
          apiBase: this.form.apiBase,
        }),
        adminApi.updatePanelConfig({
          panelDomain: this.form.panelDomain,
          panelName: this.form.panelName,
          icpNo: this.form.icpNo,
        }),
      ])
        .then(() => uni.showToast({ title: '已保存', icon: 'success' }))
        .catch(() => {})
        .finally(() => uni.hideLoading());
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 200rpx; }
.card + .card { margin-top: 24rpx; }
.card-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
  color: var(--color-text);
}
.card-title { font-size: 30rpx; font-weight: 600; }
.status-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid var(--color-border);
}
.status-meta {
  font-size: 24rpx;
  color: var(--color-text-muted);
}
.action-bar {
  display: flex;
  gap: 16rpx;
}
</style>
