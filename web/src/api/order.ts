import { request } from './http';

export const orderApi = {
  create(data: {
    productId: number;
    duration: number;
    osId: number;
    quantity?: number;
    couponCode?: string;
    ipType?: string;
    ipCount?: number;
    addDiskSize?: number;
    diskType?: string; // 系统盘类型：cloud-hdd / cloud-ssd / ssd / hdd
    netZone?: string; // 网络区域（雨云 zone 字段，可选）
    appVars?: Array<{ app_id: number; vars?: Record<string, string> }>;
  }) {
    return request.post('/orders', data);
  },
  list(params?: { status?: string; page?: number; pageSize?: number }) {
    return request.get('/orders', params);
  },
  detail(id: number) {
    return request.get(`/orders/${id}`);
  },
  payWithBalance(id: number) {
    return request.post(`/orders/${id}/pay/balance`);
  },
  payWithEpay(id: number) {
    return request.post(`/orders/${id}/pay/epay`);
  },
  cancel(id: number) {
    return request.post(`/orders/${id}/cancel`);
  },
};

export const paymentApi = {
  mockPay(orderNo: string) {
    return request.get('/payment/epay/mock-pay', { orderNo });
  },
};
