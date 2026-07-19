import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user = req['user'];
    return data ? user?.[data] : user;
  },
);

export const CurrentAdmin = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const admin = req['admin'];
    return data ? admin?.[data] : admin;
  },
);
