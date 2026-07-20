<template>
  <view class="app">
    <ui-app-bar title="短信配置" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="card">
        <view class="provider-header">
          <view class="provider-info">
            <text class="provider-name">阿里云短信服务</text>
            <text class="provider-sub">Aliyun PNVS · 国内消息</text>
          </view>
          <ui-pill
            :variant="configured ? 'success' : 'muted'"
            :icon="configured ? 'check' : ''"
            :text="configured ? '已配置' : '未配置'"
          />
        </view>

        <ui-field
          v-model="form.accessKeyId"
          label="AccessKey ID"
          placeholder="LTAI5tXXXXXX"
          input-class="mono"
        />
        <ui-field
          v-model="form.accessKeySecret"
          label="AccessKey Secret"
          type="password"
          placeholder="请输入 AccessKey Secret"
          :suffix="showSecret ? 'eye-off' : 'eye'"
          @suffix-click="showSecret = !showSecret"
        />
        <ui-field
          v-model="form.signName"
          label="签名名称"
          placeholder="柯羽云"
        />
        <ui-field
          v-model="form.templateCode"
          label="模板 Code"
          placeholder="SMS_XXXXXX"
          input-class="mono"
        />
        <ui-field
          v-model="form.region"
          label="Region"
          type="select"
          placeholder="选择地域"
          :options="regionOptions"
        />
        <view class="field-hint">
          <ui-icon name="circle-question-mark" :size="24" />
          <text>在阿里云控制台 → 短信服务 → 国内消息中获取以上信息</text>
        </view>
      </view>
    </scroll-view>

    <ui-action-bar>
      <ui-button variant="secondary" :block="true" @click="onTest">
        <ui-icon name="send-horizontal" :size="32" /> 测试发送
      </ui-button>
      <ui-button variant="primary" :block="true" @click="onSave">
        <ui-icon name="save" :size="32" /> 保存
      </ui-button>
    </ui-action-bar>

    <!-- 测试发送 sheet -->
    <ui-sheet :visible="testSheetVisible" title="发送测试短信" @close="testSheetVisible = false">
      <ui-field
        v-model="testPhone"
        label="手机号"
        placeholder="输入测试手机号"
        input-class="mono"
      />
      <view class="sheet-actions">
        <ui-button variant="primary" :block="true" @click="confirmTest">发送</ui-button>
      </view>
    </ui-sheet>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';

export default {
  data() {
    return {
      showSecret: false,
      configured: false,
      testSheetVisible: false,
      testPhone: '',
      regionOptions: [
        { label: 'cn-hangzhou', value: 'cn-hangzhou' },
        { label: 'cn-beijing', value: 'cn-beijing' },
        { label: 'cn-shanghai', value: 'cn-shanghai' },
        { label: 'cn-shenzhen', value: 'cn-shenzhen' },
      ],
      form: {
        accessKeyId: '',
        accessKeySecret: '',
        signName: '',
        templateCode: '',
        region: 'cn-hangzhou',
      },
    };
  },
  onLoad() { this.loadData(); },
  methods: {
    async loadData() {
      try {
        const r = await adminApi.smsConfig();
        this.form.accessKeyId = r.accessKeyId || '';
        this.form.accessKeySecret = r.accessKeySecret || '';
        this.form.signName = r.signName || '';
        this.form.templateCode = r.templateCode || '';
        this.form.region = r.region || 'cn-hangzhou';
        this.configured = !!r.configured;
      } catch (e) {}
    },
    onSave() {
      if (!this.form.accessKeyId || !this.form.accessKeySecret) {
        uni.showToast({ title: '请填写 AK 信息', icon: 'none' });
        return;
      }
      uni.showLoading({ title: '保存中' });
      adminApi.updateSmsConfig({ ...this.form })
        .then(() => {
          this.configured = true;
          uni.showToast({ title: '已保存', icon: 'success' });
        })
        .catch(() => {})
        .finally(() => uni.hideLoading());
    },
    onTest() {
      this.testPhone = '';
      this.testSheetVisible = true;
    },
    confirmTest() {
      if (!this.testPhone) {
        uni.showToast({ title: '请输入手机号', icon: 'none' });
        return;
      }
      this.testSheetVisible = false;
      uni.showLoading({ title: '发送中' });
      adminApi.testSms(this.testPhone)
        .then(() => uni.showToast({ title: '发送成功', icon: 'success' }))
        .catch(() => {})
        .finally(() => uni.hideLoading());
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 200rpx; }
.provider-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding-bottom: 24rpx;
  margin-bottom: 24rpx;
  border-bottom: 1rpx solid var(--color-border);
}
.provider-info { flex: 1; }
.provider-name {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: var(--color-text);
}
.provider-sub {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-muted);
  margin-top: 4rpx;
}
.field-hint {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-top: 16rpx;
  padding: 16rpx;
  background: var(--color-surface-muted);
  border-radius: 16rpx;
  font-size: 24rpx;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.action-bar {
  display: flex;
  gap: 16rpx;
}
.sheet-actions {
  margin-top: 24rpx;
}
</style>
