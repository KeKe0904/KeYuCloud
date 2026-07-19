import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';

// 创建 axios 实例
const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 请求拦截器：附加 token
http.interceptors.request.use(
  (config) => {
    // admin 接口用 adminToken
    if (config.url?.startsWith('/admin/')) {
      const adminToken = localStorage.getItem('adminToken');
      if (adminToken) {
        config.headers['x-admin-token'] = adminToken;
      }
    } else {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器：统一处理错误
http.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res && typeof res === 'object' && 'success' in res) {
      if (!res.success) {
        ElMessage.error(res.message || '请求失败');
        return Promise.reject(new Error(res.message || '请求失败'));
      }
      return res;
    }
    return res;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.message || `请求失败 (${status})`;

      if (status === 401) {
        // 未授权，清除 token 跳登录
        if (error.config?.url?.startsWith('/admin/')) {
          localStorage.removeItem('adminToken');
          if (!window.location.pathname.startsWith('/admin/login')) {
            window.location.href = '/admin/login';
          }
        } else {
          localStorage.removeItem('token');
          if (!window.location.pathname.startsWith('/login')) {
            ElMessage.error('登录已失效，请重新登录');
            setTimeout(() => {
              window.location.href = '/login';
            }, 1000);
          }
        }
      } else {
        ElMessage.error(message);
      }
    } else if (error.message?.includes('timeout')) {
      ElMessage.error('请求超时，请稍后重试');
    } else {
      ElMessage.error('网络异常');
    }
    return Promise.reject(error);
  },
);

// 通用请求方法
export const request = {
  get<T = any>(url: string, params?: any, config?: AxiosRequestConfig) {
    return http.get<any, { success: boolean; data: T; message?: string }>(url, {
      params,
      ...config,
    });
  },
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return http.post<any, { success: boolean; data: T; message?: string }>(url, data, config);
  },
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return http.put<any, { success: boolean; data: T; message?: string }>(url, data, config);
  },
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return http.patch<any, { success: boolean; data: T; message?: string }>(url, data, config);
  },
  delete<T = any>(url: string, config?: AxiosRequestConfig) {
    return http.delete<any, { success: boolean; data: T; message?: string }>(url, config);
  },
};

export default http;
