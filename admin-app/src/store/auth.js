import { defineStore } from 'pinia';
import { adminApi } from '../common/api';
import { requestHelper } from '../common/http';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: uni.getStorageSync('adminToken') || '',
    profile: null,
    loaded: false,
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    displayName: (s) => (s.profile ? s.profile.nickname || s.profile.username : ''),
    role: (s) => (s.profile ? s.profile.role : ''),
    roleLabel: (s) => {
      const map = { SUPER_ADMIN: '超级管理员', ADMIN: '管理员', OPERATOR: '运营', FINANCE: '财务', SUPPORT: '客服', TECH: '技术' };
      return map[s.profile?.role] || '未知';
    },
    avatarSrc: (s) => {
      if (!s.profile) return '';
      if (s.profile.avatarUrl) return s.profile.avatarUrl;
      if (s.profile.qq) return `https://q1.qlogo.cn/g?b=qq&nk=${s.profile.qq}&s=140`;
      return '';
    },
    avatarInitial: (s) => {
      const name = s.profile?.nickname || s.profile?.username || '';
      return name ? name.charAt(0).toUpperCase() : 'A';
    },
  },
  actions: {
    restore() {
      this.token = uni.getStorageSync('adminToken') || '';
    },
    async login(payload) {
      const res = await adminApi.login(payload);
      this.token = res.token;
      this.profile = res.profile;
      requestHelper.setToken(res.token);
      return res;
    },
    async fetchProfile() {
      this.profile = await adminApi.profile();
      this.loaded = true;
      return this.profile;
    },
    patch(data) {
      if (this.profile) this.profile = { ...this.profile, ...data };
    },
    logout() {
      this.token = '';
      this.profile = null;
      requestHelper.clearToken();
      uni.reLaunch({ url: '/pages/admin/login' });
    },
  },
});
