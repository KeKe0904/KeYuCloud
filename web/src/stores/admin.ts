import { defineStore } from 'pinia';
import { adminApi } from '@/api/admin';

// 管理员个人资料 store：用于在 AdminLayout 右上角与 Profile.vue 之间共享头像/昵称
// Profile.vue 保存后调用 refresh() 同步，AdminLayout 显示响应式更新
interface AdminProfile {
  id: number;
  username: string;
  nickname: string | null;
  role: string;
  email?: string | null;
  qq?: string | null;
  avatarUrl?: string | null;
}

interface AdminState {
  profile: AdminProfile | null;
}

export const useAdminStore = defineStore('adminProfile', {
  state: (): AdminState => ({
    profile: null,
  }),
  getters: {
    // 头像来源：QQ 头像（优先）→ avatarUrl → 首字母
    avatarSrc: (state) => {
      const qq = state.profile?.qq;
      if (qq) return `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=140`;
      return state.profile?.avatarUrl || '';
    },
    avatarInitial: (state) => {
      const name = state.profile?.nickname || state.profile?.username || '?';
      return name.charAt(0).toUpperCase();
    },
    displayName: (state) => state.profile?.nickname || state.profile?.username || '管理员',
  },
  actions: {
    async refresh() {
      try {
        const res: any = await adminApi.profile();
        if (res?.success) this.profile = res.data;
      } catch {
        // 静默失败
      }
    },
    // 局部更新（Profile.vue 保存后调用，避免重新请求）
    patch(data: Partial<AdminProfile>) {
      if (this.profile) {
        this.profile = { ...this.profile, ...data };
      }
    },
  },
});
