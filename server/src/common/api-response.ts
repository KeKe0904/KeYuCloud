import { HttpException, HttpStatus } from '@nestjs/common';

// 统一成功响应
export class ApiResponse {
  static success(data: any = null, message = '操作成功') {
    return { success: true, code: 'OK', message, data };
  }

  static error(message: string, code = 'ERROR', status = HttpStatus.BAD_REQUEST, details: any = null) {
    throw new HttpException(
      { success: false, code, message, details },
      status,
    );
  }

  static paged(list: any[], total: number, page: number, pageSize: number) {
    return {
      success: true,
      code: 'OK',
      data: {
        list,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}

// 业务异常
export class BizError extends HttpException {
  constructor(message: string, code = 'BIZ_ERROR', status = HttpStatus.BAD_REQUEST, details: any = null) {
    super({ success: false, code, message, details }, status);
  }
}

// 分页参数解析
export function parsePaging(query: any) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize) || 10));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}
