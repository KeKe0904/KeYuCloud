// XSS 输入清洗工具
// 用于用户输入的文本字段（工单标题/内容、昵称、公告等）入库前的 HTML 转义
// 注意：本工具采用白名单策略——剥离所有 HTML 标签，仅保留纯文本

/**
 * HTML 转义：将 & < > " ' 转换为实体，避免在 v-html / dangerouslySetInnerHTML 场景下造成 XSS
 */
export function escapeHtml(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * 反转义 HTML 实体（仅用于显示场景，谨慎使用）
 */
export function unescapeHtml(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * 剥离所有 HTML 标签，保留纯文本内容（用于工单内容等不允许 HTML 的字段）
 * 同时压缩连续空白，限制最大长度
 */
export function stripHtml(input: string | null | undefined, maxLength?: number): string {
  if (input == null) return '';
  let text = String(input)
    // 去除所有 HTML 标签
    .replace(/<[^>]*>/g, '')
    // 去除 HTML 实体（如 &nbsp;）
    .replace(/&[a-zA-Z]+;|&#\d+;/g, ' ')
    // 压缩连续空白
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLength && text.length > maxLength) {
    text = text.slice(0, maxLength);
  }
  return text;
}

/**
 * 通用文本清洗：剥离 HTML 标签 + 转义特殊字符
 * 适用于工单标题、内容、用户昵称等场景
 */
export function sanitizeText(input: string | null | undefined, maxLength?: number): string {
  return escapeHtml(stripHtml(input, maxLength));
}

/**
 * 富文本清洗（保留允许的标签和属性）— 当前项目不使用富文本，预留
 */
export function sanitizeRichText(input: string | null | undefined): string {
  // 当前项目所有用户输入均为纯文本，直接 escape
  return escapeHtml(String(input ?? ''));
}

/**
 * 需要脱敏的 URL query 参数名（小写匹配）
 */
const SENSITIVE_QUERY_KEYS = [
  'password', 'pwd', 'passwd', 'token', 'secret', 'apikey', 'api_key',
  'access_token', 'refresh_token', 'authorization', 'auth', 'captcha',
  'oldpassword', 'newpassword', 'currentpassword',
];

/**
 * URL 脱敏：保留 path，对 query 中的敏感字段值替换为 ***
 * 用于日志记录、异常响应等场景，避免敏感参数被泄露
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url || !url.includes('?')) return String(url ?? '');
  const [path, query] = String(url).split('?', 2);
  if (!query) return String(url);
  const pairs = query.split('&');
  const sanitized = pairs.map((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return pair;
    const key = pair.substring(0, idx).toLowerCase();
    if (SENSITIVE_QUERY_KEYS.some((s) => key === s || key.endsWith('_' + s) || key.endsWith(s))) {
      return `${pair.substring(0, idx)}=***`;
    }
    return pair;
  });
  return `${path}?${sanitized.join('&')}`;
}
