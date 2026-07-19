import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) throw new UnauthorizedException('未登录');

    try {
      const payload = await this.jwt.verifyAsync(token);
      req['user'] = payload;
      return true;
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
  }
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly adminJwtSecret: string;

  constructor(
    private jwt: JwtService,
    private reflector: Reflector,
    private config: ConfigService,
  ) {
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret || secret.length < 16) {
      // 启动时即暴露问题，避免使用弱密钥
      throw new Error(
        'ADMIN_JWT_SECRET 未配置或长度不足 16 位，请在 .env 中设置强随机密钥',
      );
    }
    this.adminJwtSecret = secret;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 只看方法级 @Public 装饰器（admin controller 类级 @Public 是给全局 JwtAuthGuard 用的）
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token =
      (req.headers['x-admin-token'] as string) ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) throw new UnauthorizedException('管理员未登录');

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.adminJwtSecret,
      });
      req['admin'] = payload;
      return true;
    } catch {
      throw new UnauthorizedException('管理员登录已失效');
    }
  }
}
