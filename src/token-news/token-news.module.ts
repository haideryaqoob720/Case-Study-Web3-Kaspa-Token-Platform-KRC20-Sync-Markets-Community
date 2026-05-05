import { Module } from '@nestjs/common';
import { TokenNewsController } from './token-news.controller';
import { TokenNewsService } from './token-news.service';

@Module({
  controllers: [TokenNewsController],
  providers: [TokenNewsService],
  exports: [TokenNewsService],
})
export class TokenNewsModule {}
