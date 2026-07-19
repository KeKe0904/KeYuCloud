import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { ProductModule } from '../product/product.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [ProductModule, MailerModule],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
