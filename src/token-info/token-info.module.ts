// Token Info Module: Mongoose schema, repository, service, controller

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TokenInfoDocument,
  TokenInfoSchema,
} from '../database/schemas/token-info.schema';
import { TokenInfoController } from './token-info.controller';
import { TokenInfoService } from './token-info.service';
import { TokenInfoRepository } from './token-info.repository';
import { TokensModule } from '../tokens/tokens.module';
import { TokenVotesModule } from '../token-votes/token-votes.module';
import { WatchlistModule } from '../watchlist/watchlist.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TokenInfoDocument.name, schema: TokenInfoSchema },
    ]),
    TokensModule,
    TokenVotesModule,
    WatchlistModule,
  ],
  controllers: [TokenInfoController],
  providers: [TokenInfoService, TokenInfoRepository],
  exports: [TokenInfoService, TokenInfoRepository],
})
export class TokenInfoModule {}
