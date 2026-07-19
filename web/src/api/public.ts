import { request } from './http';

export const publicApi = {
  siteInfo() {
    return request.get('/public/site-info');
  },
  announcements() {
    return request.get('/public/announcements');
  },
  configs() {
    return request.get('/public/configs');
  },
  // 首页精选套餐推荐
  recommendedProducts() {
    return request.get('/public/products/recommended');
  },
};
