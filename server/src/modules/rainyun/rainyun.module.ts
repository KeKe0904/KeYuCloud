import { Module, Global } from '@nestjs/common';
import { RainyunService } from './rainyun.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../../common/prisma.service';

@Global()
@Module({
  imports: [HttpModule.register({ timeout: 15000, maxRedirects: 3 })],
  providers: [RainyunService, PrismaService],
  exports: [RainyunService],
})
export class RainyunModule {}
