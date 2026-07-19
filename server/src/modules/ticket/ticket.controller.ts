// 工单 Controller — 路由 api/tickets（全部需登录）
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TicketService } from './ticket.service';
import { CreateTicketDto, ReplyDto, RateDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/api-response';

@Controller('api/tickets')
@UseGuards(JwtAuthGuard)
export class TicketController {
  constructor(private ticket: TicketService) {}

  // 创建工单
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 防止刷工单
  async create(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateTicketDto,
  ) {
    const ticket = await this.ticket.createTicket(userId, dto);
    return ApiResponse.success(ticket, '工单创建成功');
  }

  // 用户工单列表
  @Get()
  async list(@CurrentUser('sub') userId: number, @Query() query: any) {
    const result = await this.ticket.listUserTickets(userId, query);
    return ApiResponse.paged(result.list, result.total, result.page, result.pageSize);
  }

  // 工单详情
  @Get(':id')
  async detail(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    const ticket = await this.ticket.getTicket(parseInt(id, 10), userId);
    return ApiResponse.success(ticket);
  }

  // 用户回复工单
  @Post(':id/reply')
  async reply(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    const msg = await this.ticket.replyTicket(parseInt(id, 10), userId, dto.content);
    return ApiResponse.success(msg, '回复成功');
  }

  // 关闭工单（用户/管理员均可）
  @Post(':id/close')
  async close(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    const ticket = await this.ticket.closeTicket(parseInt(id, 10), userId);
    return ApiResponse.success(ticket, '工单已关闭');
  }

  // 工单评分
  @Post(':id/rate')
  async rate(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
    @Body() dto: RateDto,
  ) {
    const ticket = await this.ticket.rateTicket(
      parseInt(id, 10),
      userId,
      dto.rating,
      dto.comment,
    );
    return ApiResponse.success(ticket, '评分成功');
  }

  // 用户升级工单到雨云官方（本站 → 官方，单向不可降级）
  // 升级前置条件：
  //   1. 工单 source=local（本站工单）
  //   2. 工单已关联雨云产品（userProductId 不为空且 upstreamRcsId 不为空）
  //   3. 工单未关闭
  @Post(':id/escalate')
  async escalate(@CurrentUser('sub') userId: number, @Param('id') id: string) {
    const ticket = await this.ticket.escalateToRainyun(parseInt(id, 10), userId);
    return ApiResponse.success(ticket, '工单已升级到雨云官方');
  }
}
