import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { sanitizeUrl } from '../sanitize.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    // 对 URL 进行脱敏，避免敏感 query 参数被记录到日志或响应中
    const safeUrl = sanitizeUrl(request.url);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let code = 'INTERNAL_ERROR';
    let details: any = null;

    // HTTP 状态码 → 错误码映射（用于未显式声明 code 的 HttpException）
    const statusToCode: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      // 默认根据状态码推断 code
      code = statusToCode[status] || (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r: any = res;
        // class-validator 错误：{ message: string[], error: string }
        if (Array.isArray(r.message)) {
          message = r.message[0] || '参数校验失败';
          code = 'VALIDATION_ERROR';
        } else {
          message = r.message || message;
          // 业务异常显式声明的 code 优先
          if (r.code) code = r.code;
          details = r.details || null;
        }
      }
      // 429 限流：使用友好消息，避免暴露内部异常类名（如 "ThrottlerException: ..."）
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        const raw = String(message || '');
        if (/Throttler|Too Many Requests|throttler/i.test(raw)) {
          message = '请求过于频繁，请稍后再试';
        }
      }
      // 安全脱敏：4xx 业务异常中若包含上游 API/ORM/库内部细节，统一替换为通用消息
      // 防止攻击者通过 BadRequestException 透传获取上游 API 结构、字段名、堆栈摘要
      // 详细错误已通过 logger 记录到服务端日志，可凭 timestamp/path 排查
      const rawMsg = String(message || '');
      if (/雨云|rainyun|Prisma|prisma|stack|at\s\/|node_modules|axios|ECONNREFUSED|ETIMEDout|getaddrinfo|ENOTFOUND/i.test(rawMsg)) {
        // 保留业务前缀（如"开通失败："、"创建工单失败："），后缀替换为通用提示
        const prefixMatch = rawMsg.match(/^(开通失败|创建.*失败|.*失败|.*错误)[：:]/);
        message = prefixMatch ? `${prefixMatch[1]}，请稍后重试或联系客服` : '操作失败，请稍后重试或联系客服';
      }
      // 4xx 业务异常：记录简短信息即可
      if (status < 500) {
        this.logger.warn(`${request.method} ${safeUrl} → ${status} ${message}`);
      }
    } else if (exception instanceof Error) {
      // 非 HttpException 的未知异常：完整堆栈仅记录到服务端日志
      // 对外只返回统一的通用错误消息，避免泄露内部实现细节（堆栈、库错误等）
      this.logger.error(
        `${request.method} ${safeUrl} 未处理异常: ${exception.message}`,
        exception.stack,
      );
      message = '服务器内部错误，请稍后重试';
      code = 'INTERNAL_ERROR';
      details = null;
    }

    // 5xx 异常统一记录
    if (status >= 500) {
      this.logger.error(`${request.method} ${safeUrl} → ${status} ${message}`);
    }

    response.status(status).json({
      success: false,
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: safeUrl,
    });
  }
}
