/**
 * 统一请求封装 (uni.request)
 * - baseURL 通过 manifest/环境变量配置
 * - 自动附加 adminToken / token
 * - 处理 { success, data, message } 后端响应
 * - 401 自动跳登录
 */
import config from './config';

const TOKEN_KEY = 'adminToken';

function getToken() {
  return uni.getStorageSync(TOKEN_KEY) || '';
}

function setToken(t) {
  if (t) uni.setStorageSync(TOKEN_KEY, t);
  else uni.removeStorageSync(TOKEN_KEY);
}

function buildUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return config.baseURL + url;
}

function request(method, url, data, options = {}) {
  const header = { 'Content-Type': 'application/json', ...(options.header || {}) };
  if (url.startsWith('/admin/')) {
    const t = getToken();
    if (t) header['x-admin-token'] = t;
  } else {
    const t = uni.getStorageSync('token') || '';
    if (t) header.Authorization = `Bearer ${t}`;
  }

  return new Promise((resolve, reject) => {
    uni.request({
      method,
      url: buildUrl(url),
      data,
      header,
      timeout: options.timeout || config.timeout,
      success: (res) => {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (body && typeof body === 'object' && 'success' in body) {
            if (!body.success) {
              toast(body.message || '请求失败');
              const err = new Error(body.message || '请求失败');
              err.code = body.code;
              err.details = body.details;
              err.handled = true;
              return reject(err);
            }
            return resolve(body.data);
          }
          return resolve(body);
        }
        if (res.statusCode === 401) {
          setToken('');
          toast('登录已失效，请重新登录');
          // 跳转登录页 (避免重复跳转)
          const pages = getCurrentPages();
          const route = pages.length ? pages[pages.length - 1].route : '';
          if (!route.endsWith('login')) {
            setTimeout(() => {
              uni.reLaunch({ url: '/pages/admin/login' });
            }, 800);
          }
          const err = new Error('未授权');
          err.code = 401;
          err.handled = true;
          return reject(err);
        }
        const msg = body && body.message ? body.message : `请求失败 (${res.statusCode})`;
        toast(msg);
        const err = new Error(msg);
        err.code = body && body.code;
        err.details = body && body.details;
        err.handled = true;
        reject(err);
      },
      fail: (e) => {
        const msg = /timeout/i.test(e.errMsg || '') ? '请求超时，请稍后重试' : '网络异常';
        toast(msg);
        const err = new Error(msg);
        err.handled = true;
        reject(err);
      },
    });
  });
}

let toastTimer = null;
function toast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    uni.showToast({ title: msg, icon: 'none', duration: 2000 });
    toastTimer = null;
  }, 50);
}

export const http = {
  get: (url, params, opts) => request('GET', url + buildQuery(params), undefined, opts),
  post: (url, data, opts) => request('POST', url, data, opts),
  put: (url, data, opts) => request('PUT', url, data, opts),
  patch: (url, data, opts) => request('PATCH', url, data, opts),
  delete: (url, data, opts) => request('DELETE', url, data, opts),
};

function buildQuery(params) {
  if (!params) return '';
  const parts = [];
  Object.keys(params).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

export const requestHelper = {
  setToken,
  getToken,
  clearToken: () => setToken(''),
};

export default http;
