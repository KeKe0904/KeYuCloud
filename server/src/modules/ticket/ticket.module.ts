// 工单模块 — 双层架构（本站工单 + 可升级到雨云）
import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationModule],
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
