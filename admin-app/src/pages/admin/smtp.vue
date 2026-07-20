<template>
  <view class="app">
    <ui-app-bar title="SMTP 配置" :show-back="true" />
    <scroll-view class="app-content" scroll-y>
      <view class="card">
        <view class="card-header">
          <ui-icon name="mail" :size="36" />
          <text class="card-title">SMTP 服务器</text>
        </view>
        <ui-field
          v-model="form.host"
          label="服务器地址"
          placeholder="smtp.qq.com"
          input-class="mono"
        />
        <ui-field
          v-model="form.port"
          label="端口"
          type="number"
          placeholder="465"
        />
        <ui-field
          v-model="form.encryption"
          label="加密方式"
          type="select"
          placeholder="选择加密方式"
          :options="encryptionOptions"
        />
        <ui-field
          v-model="form.fromEmail"
          label="发件邮箱"
          placeholder="noreply@keyuyun.com"
          input-class="mono"
        />
        <ui-field
          v-model="form.username"
          label="用户名"
          placeholder="noreply@keyuyun.com"
          input-class="mono"
        />
        <ui-field
          v-model="form.password"
          label="密码"
          type="password"
          placeholder="请输入SMTP授权码"
          hint="授权码非邮箱登录密码，需在邮箱后台开启 SMTP 后获取"
          :suffix="showPassword ? 'eye-off' : 'eye'"
          @suffix-click="showPassword = !showPassword"
        />
        <ui-field
          v-model="form.fromName"
          label="发件人名称"
          placeholder="柯羽云"
        />
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
    <ui-sheet :visible="testSheetVisible" title="发送测试邮件" @close="testSheetVisible = false">
      <ui-field
        v-model="testTo"
        label="收件邮箱"
        placeholder="输入测试收件邮箱地址"
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
      showPassword: false,
      testSheetVisible: false,
      testTo: '',
      encryptionOptions: [
        { label: 'SSL/TLS', value: 'SSL/TLS' },
        { label: 'STARTTLS', value: 'STARTTLS' },
        { label: '无', value: 'NONE' },
      ],
      form: {
        host: '',
        port: 465,
        encryption: 'SSL/TLS',
        fromEmail: '',
        username: '',
        password: '',
        fromName: '',
      },
    };
  },
  onLoad() { this.loadData(); },
  methods: {
    async loadData() {
      try {
        const r = await adminApi.smtpConfig();
        this.form.host = r.host || '';
        this.form.port = r.port || 465;
        this.form.encryption = r.encryption || 'SSL/TLS';
        this.form.fromEmail = r.fromEmail || '';
        this.form.username = r.username || '';
        this.form.password = r.password || '';
        this.form.fromName = r.fromName || '';
      } catch (e) {}
    },
    onSave() {
      if (!this.form.host) {
        uni.showToast({ title: '请填写服务器地址', icon: 'none' });
        return;
      }
      uni.showLoading({ title: '保存中' });
      adminApi.updateSmtpConfig({ ...this.form })
        .then(() => uni.showToast({ title: '已保存', icon: 'success' }))
        .catch(() => {})
        .finally(() => uni.hideLoading());
    },
    onTest() {
      this.testTo = '';
      this.testSheetVisible = true;
    },
    confirmTest() {
      if (!this.testTo) {
        uni.showToast({ title: '请输入收件邮箱', icon: 'none' });
        return;
      }
      this.testSheetVisible = false;
      uni.showLoading({ title: '发送中' });
      adminApi.testSmtp(this.testTo)
        .then(() => uni.showToast({ title: '发送成功', icon: 'success' }))
        .catch(() => {})
        .finally(() => uni.hideLoading());
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 200rpx; }
.card-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
  color: var(--color-text);
}
.card-title { font-size: 30rpx; font-weight: 600; }
.action-bar {
  display: flex;
  gap: 16rpx;
}
.sheet-actions {
  margin-top: 24rpx;
}
</style>
