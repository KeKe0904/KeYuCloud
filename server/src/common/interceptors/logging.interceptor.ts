import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { sanitizeUrl } from '../sanitize.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const { method, ip } = req;
    // 对 URL 进行脱敏，避免敏感 query 参数被记录到日志
    const url = sanitizeUrl(req.url);
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          if (!url.startsWith('/api/health')) {
            this.logger.log(`${method} ${url} ${duration}ms ${ip}`);
          }
        },
      }),
    );
  }
}
