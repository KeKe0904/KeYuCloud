// 工单 DTO
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

// 创建工单
// type 枚举与雨云官方 API 一致：tech / expense / sales / reward / feedback
// 数据来源：雨云 /workorder/ 端点实测（2026-07）
// source: local=本站工单（仅写本地 DB）/ official=官方工单（创建时直接调雨云 API）
//   - official 必须传 userProductId（雨云 /workorder/ 要求 related_product_id 必填）
//   - local 可不传 userProductId（用户可无关联机器提问）
export class CreateTicketDto {
  @IsString()
  @IsIn(['tech', 'expense', 'sales', 'sale', 'reward', 'feedback'])
  type: string; // 兼容前端历史 'sale' 值，service 层会标准化为 'sales'

  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(500000)
  content: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userProductId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  priority?: number; // 0普通 1紧急，默认 0

  @IsOptional()
  @IsString()
  @IsIn(['local', 'official'])
  source?: string; // 默认 local
}

// 回复工单
export class ReplyDto {
  @IsString()
  @MaxLength(500000)
  content: string;
}

// 工单评分
export class RateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
