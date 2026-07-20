/**
 * 全局配置 - 在 manifest 编译期或运行期都可被覆盖
 * mockMode=true 时所有 API 走 mock 数据，方便离线预览
 */
export default {
  // 后端 API 地址 (App 端需配置为完整域名)
  // H5 走 vite proxy /api -> http://localhost:3000
  baseURL: '/api',
  timeout: 30000,
  mockMode: true, // 默认开 mock，便于设计稿预览
  appName: '柯羽云管理后台',
  version: '2.4.1',
};
