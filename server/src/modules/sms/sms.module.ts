// 短信模块 — 阿里云号码认证服务（PNVS）短信认证
// 无 Controller，由 admin/auth 模块转发调用
import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';

@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
