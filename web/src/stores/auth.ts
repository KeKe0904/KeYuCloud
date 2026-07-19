import { defineStore } from 'pinia';
import { authApi, type UserProfile } from '@/api/auth';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem('token'),
    user: null,
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
    isAdmin: (state) => !!localStorage.getItem('adminToken'),
  },
  actions: {
    setToken(token: string) {
      this.token = token;
      localStorage.setItem('token', token);
    },
    setAdminToken(token: string) {
      localStorage.setItem('adminToken', token);
    },
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('token');
    },
    logoutAdmin() {
      localStorage.removeItem('adminToken');
    },
    async fetchProfile() {
      if (!this.token) return;
      try {
        const res = await authApi.profile();
        this.user = res.data;
      } catch {
        this.logout();
      }
    },
  },
});
