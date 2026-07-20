/**
 * 通用格式化工具函数
 * 统一项目内 formatPrice / formatMoney / formatTime / formatDate 的实现，
 * 避免各文件重复定义导致行为不一致。
 */
import dayjs from 'dayjs';

/**
 * 格式化价格（商品起售价、列表价等）
 * - null / undefined / 非数字 / <=0 统一返回 '待定价'
 * - 正常数字返回 '¥123.45' 格式
 */
export function formatPrice(price: number | null | undefined | string): string {
  const n = Number(price);
  if (price === null || price === undefined || isNaN(n) || n <= 0) return '待定价';
  return `¥${n.toFixed(2)}`;
}

/**
 * 格式化金额（订单金额、余额等）
 * - 使用 toLocaleString 千分位分隔
 * - null / undefined / NaN 返回 '¥0.00'
 */
export function formatMoney(val: number | string | null | undefined): string {
  const n = Number(val);
  if (val === null || val === undefined || isNaN(n)) return '¥0.00';
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 格式化日期时间
 * @param val 时间字符串或时间戳
 * @param format dayjs 格式，默认 'YYYY-MM-DD HH:mm'
 */
export function formatTime(val: string | number | Date | null | undefined, format = 'YYYY-MM-DD HH:mm'): string {
  if (!val) return '-';
  try {
    return dayjs(val).format(format);
  } catch {
    return String(val);
  }
}

/**
 * 格式化日期（不含时间）
 */
export function formatDate(val: string | number | Date | null | undefined): string {
  return formatTime(val, 'YYYY-MM-DD');
}

/**
 * 格式化完整日期时间（含秒）
 */
export function formatDateTime(val: string | number | Date | null | undefined): string {
  return formatTime(val, 'YYYY-MM-DD HH:mm:ss');
}
