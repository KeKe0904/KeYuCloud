// 邮件模块 — SMTP 配置 / 模板 / 日志（无 Controller，由 admin 模块转发调用）
import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
