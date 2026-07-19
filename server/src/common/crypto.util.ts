import * as crypto from 'crypto';

// AES-256-CBC 加密（用于 SMTP 密码等敏感字段）
export class CryptoUtil {
  // 缓存解析后的 key，避免每次调用都重新计算
  private static cachedKey: Buffer | null = null;

  private static getKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    const secret = process.env.AES_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error(
        'AES_SECRET 未配置或长度不足 16 位，请在 .env 中设置 32 字节强随机密钥',
      );
    }
    this.cachedKey = crypto.createHash('sha256').update(secret).digest();
    return this.cachedKey;
  }

  static encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  static decrypt(encrypted: string): string {
    if (!encrypted) return '';
    try {
      const [ivHex, dataHex] = encrypted.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const data = Buffer.from(dataHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.getKey(), iv);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      return '';
    }
  }

  // MD5（易支付签名用）
  static md5(text: string): string {
    return crypto.createHash('md5').update(text, 'utf8').digest('hex');
  }

  // 生成随机字符串
  static randomString(len = 32): string {
    return crypto.randomBytes(len).toString('hex').slice(0, len);
  }
}
