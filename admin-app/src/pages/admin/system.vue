<template>
  <view class="app">
    <ui-app-bar title="系统配置" :show-back="true" />
    <scroll-view class="app-content no-nav" scroll-y>
      <!-- 站点信息 -->
      <view class="card">
        <view class="card-header">
          <ui-icon name="settings" :size="36" />
          <text class="card-title">站点信息</text>
        </view>
        <ui-field
          v-model="form.siteName"
          label="站点名称"
          placeholder="柯羽云"
        />
        <ui-field
          v-model="form.siteDomain"
          label="站点域名"
          placeholder="keyuyun.com"
          input-class="mono"
        />
        <ui-field
          v-model="form.icpNo"
          label="备案号"
          placeholder="京ICP备XXXXXXXX号"
        />
        <ui-field
          v-model="form.supportQq"
          label="客服QQ"
          placeholder="10001"
          input-class="mono"
        />
        <ui-field
          v-model="form.supportWechat"
          label="客服微信"
          placeholder="keyu_support"
          input-class="mono"
        />
        <view class="card-actions">
          <ui-button variant="primary" :block="true" @click="onSave">
            <ui-icon name="save" :size="32" /> 保存配置
          </ui-button>
        </view>
      </view>

      <!-- 版本信息 -->
      <view class="card">
        <view class="card-header">
          <ui-icon name="shield-check" :size="36" />
          <text class="card-title">版本信息</text>
        </view>
        <view class="kv">
          <text class="kv-k">当前版本</text>
          <text class="kv-v mono">v{{ versionInfo.currentVersion }}</text>
        </view>
        <view class="kv">
          <text class="kv-k">发布日期</text>
          <text class="kv-v">{{ versionInfo.releaseDate }}</text>
        </view>
        <view class="kv">
          <text class="kv-k">最新版本</text>
          <view class="kv-v">
            <text class="mono">v{{ versionInfo.latestVersion }}</text>
            <ui-pill
              v-if="!versionInfo.hasUpdate"
              variant="success"
              icon="check"
              text="已是最新"
              class="ml-8"
            />
            <ui-pill
              v-else
              variant="brand"
              icon="arrow-up"
              text="有新版本"
              class="ml-8"
            />
          </view>
        </view>
        <view class="card-actions">
          <ui-button variant="secondary" :block="true" @click="onCheckUpdate">
            <ui-icon name="refresh" :size="32" /> 检查更新
          </ui-button>
        </view>
      </view>

      <!-- 在线更新 -->
      <view class="card">
        <view class="card-header">
          <ui-icon name="zap" :size="36" />
          <text class="card-title">在线更新</text>
        </view>
        <text class="update-subtitle">v{{ versionInfo.latestVersion }} 更新内容</text>
        <view class="changelog">
          <view v-for="(line, i) in changelogList" :key="i" class="changelog-item">
            <text class="changelog-dot">·</text>
            <text class="changelog-text">{{ line }}</text>
          </view>
        </view>
        <view class="card-actions">
          <ui-button
            variant="primary"
            :block="true"
            :disabled="!versionInfo.hasUpdate"
            @click="onForceUpdate"
          >
            <ui-icon name="arrow-up" :size="32" />
            {{ versionInfo.hasUpdate ? '立即更新' : '已是最新版本' }}
          </ui-button>
        </view>
      </view>

      <!-- 环境信息 -->
      <view class="card">
        <view class="card-header">
          <ui-icon name="server" :size="36" />
          <text class="card-title">环境信息</text>
        </view>
        <view class="kv" v-for="(v, k) in envInfo" :key="k">
          <text class="kv-k">{{ envLabels[k] || k }}</text>
          <text class="kv-v mono">{{ v }}</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { adminApi } from '../../common/api';

export default {
  data() {
    return {
      form: {
        siteName: '',
        siteDomain: '',
        icpNo: '',
        supportQq: '',
        supportWechat: '',
      },
      versionInfo: {
        currentVersion: '-',
        latestVersion: '-',
        hasUpdate: false,
        releaseDate: '-',
        changelog: '',
      },
      envInfo: {},
      envLabels: {
        nodeVersion: 'Node.js',
        npmVersion: 'npm',
        database: '数据库',
        redis: 'Redis',
        os: '操作系统',
        cpu: 'CPU',
        memory: '内存',
        disk: '磁盘',
      },
    };
  },
  computed: {
    changelogList() {
      if (!this.versionInfo.changelog) return [];
      return this.versionInfo.changelog
        .split('\n')
        .map((s) => s.replace(/^[-·*\s]+/, '').trim())
        .filter(Boolean);
    },
  },
  onLoad() { this.loadData(); },
  methods: {
    async loadData() {
      uni.showLoading({ title: '加载中' });
      try {
        const [cfg, ver, env] = await Promise.all([
          adminApi.systemConfigs(),
          adminApi.versionCheck(),
          adminApi.envInfo(),
        ]);
        const map = {};
        (cfg.configs || []).forEach((c) => { map[c.key] = c.value; });
        this.form.siteName = map.site_name || '';
        this.form.siteDomain = map.site_domain || '';
        this.form.icpNo = map.icp_no || '';
        this.form.supportQq = map.support_qq || '';
        this.form.supportWechat = map.support_wechat || '';
        this.versionInfo = { ...this.versionInfo, ...ver };
        this.envInfo = env || {};
      } catch (e) {}
      uni.hideLoading();
    },
    onSave() {
      if (!this.form.siteName) {
        uni.showToast({ title: '请填写站点名称', icon: 'none' });
        return;
      }
      const configs = [
        { key: 'site_name', value: this.form.siteName },
        { key: 'site_domain', value: this.form.siteDomain },
        { key: 'icp_no', value: this.form.icpNo },
        { key: 'support_qq', value: this.form.supportQq },
        { key: 'support_wechat', value: this.form.supportWechat },
      ];
      uni.showLoading({ title: '保存中' });
      adminApi.updateSystemConfigs(configs)
        .then(() => uni.showToast({ title: '已保存', icon: 'success' }))
        .catch(() => {})
        .finally(() => uni.hideLoading());
    },
    onCheckUpdate() {
      uni.showLoading({ title: '检查中' });
      adminApi.versionCheck()
        .then((r) => {
          this.versionInfo = { ...this.versionInfo, ...r };
          uni.showToast({
            title: r.hasUpdate ? '发现新版本' : '已是最新版本',
            icon: 'none',
          });
        })
        .catch(() => {})
        .finally(() => uni.hideLoading());
    },
    onForceUpdate() {
      if (!this.versionInfo.hasUpdate) return;
      uni.showModal({
        title: '确认更新',
        content: '更新过程将临时中断服务，确认立即更新到最新版本？',
        success: (res) => {
          if (res.confirm) {
            uni.showLoading({ title: '触发更新中' });
            adminApi.forceUpdate()
              .then(() => {
                uni.hideLoading();
                uni.showToast({ title: '更新任务已触发', icon: 'success' });
              })
              .catch(() => uni.hideLoading());
          }
        },
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.app-content { padding: 32rpx; padding-bottom: 64rpx; }
.card + .card { margin-top: 24rpx; }
.card-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
  color: var(--color-text);
}
.card-title { font-size: 30rpx; font-weight: 600; }
.card-actions {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--color-border);
}
.kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--color-border);
  gap: 16rpx;
}
.kv:last-child { border-bottom: 0; }
.kv-k {
  font-size: 26rpx;
  color: var(--color-text-muted);
}
.kv-v {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--color-text);
  text-align: right;
  display: flex;
  align-items: center;
}
.update-subtitle {
  font-size: 24rpx;
  color: var(--color-text-muted);
  margin-bottom: 16rpx;
}
.changelog {
  background: var(--color-surface-muted);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
}
.changelog-item {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  font-size: 26rpx;
  color: var(--color-text);
  line-height: 1.6;
}
.changelog-item + .changelog-item { margin-top: 8rpx; }
.changelog-dot {
  color: var(--color-text-muted);
  flex: none;
}
.ml-8 { margin-left: 16rpx; }
</style>
