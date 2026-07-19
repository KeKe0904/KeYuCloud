import { request } from './http';

export const userProductApi = {
  list(params?: { state?: string; page?: number; pageSize?: number }) {
    return request.get('/user-products', params);
  },
  detail(id: number) {
    return request.get(`/user-products/${id}`);
  },
  sync(id: number) {
    return request.post(`/user-products/${id}/sync`);
  },
  // 开机/关机/重启
  operate(id: number, action: 'start' | 'stop' | 'restart') {
    return request.post(`/user-products/${id}/operate`, { action });
  },
  // 重装系统
  //   - osId: 必填
  //   - password: 可选，不传则雨云自动随机生成
  //   - appVars: 可选，预装软件 [{ app_id, vars }]
  reinstall(id: number, osId: number, password?: string, appVars?: Array<{ app_id: number; vars?: Record<string, string> }>) {
    const body: any = { osId };
    if (password) body.password = password;
    if (appVars && appVars.length) body.appVars = appVars;
    return request.post(`/user-products/${id}/reinstall`, body);
  },
  // OS 模板列表（用于重装系统选择，与购买页一致：按产品 zone 过滤 + mapOs 标准化）
  osTemplates(id: number) {
    return request.get(`/user-products/${id}/os-templates`);
  },
  // 预装软件列表（用于重装系统选择，与购买页一致）
  appTemplates(id: number) {
    return request.get(`/user-products/${id}/app-templates`);
  },
  // 实时资源使用率
  usage(id: number) {
    return request.get(`/user-products/${id}/usage`);
  },
  renew(id: number, duration: number) {
    return request.post(`/user-products/${id}/renew`, { duration });
  },
  getPanelUrl(id: number) {
    return request.get(`/user-products/${id}/panel-url`);
  },
};
