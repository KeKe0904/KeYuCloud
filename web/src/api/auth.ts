import { request } from './http';

export interface UserProfile {
  id: number;
  phone: string;
  email: string;
  nickname: string;
  avatar: string;
  balance: number;
  status: string;
  isRealname: boolean;
  inviteCode: string;
  panelUserName: string;
  panelUserStatus: string;
  createdAt: string;
}

export const authApi = {
  register(data: {
    phone: string;
    password: string;
    smsCode: string;
    email?: string;
    nickname?: string;
    inviteCode?: string;
  }) {
    return request.post<{ token: string; user: UserProfile }>('/auth/register', data);
  },
  login(data: { phone: string; password: string }) {
    return request.post<{ token: string; user: UserProfile }>('/auth/login', data);
  },
  // 发送短信验证码（注册场景）
  sendSmsCode(phone: string) {
    return request.post<{ bizId?: string }>('/auth/sms-code', { phone });
  },
  profile() {
    return request.get<UserProfile>('/auth/profile');
  },
  updateProfile(data: { nickname?: string; email?: string; avatar?: string }) {
    return request.put<UserProfile>('/auth/profile', data);
  },
  changePassword(data: { oldPassword: string; newPassword: string }) {
    return request.post('/auth/change-password', data);
  },
};
