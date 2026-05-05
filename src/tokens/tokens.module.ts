// Tokens Module: Mongoose schemas, repository, service, controller

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TokenDocument, TokenSchema } from '../database/schemas/token.schema';
import {
  TokenInfoDocument,
  TokenInfoSchema,
} from '../database/schemas/token-info.schema';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
import { TokensRepository } from './tokens.repository';
import { CacheModule } from '../cache/cache.module';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { HolderTrackingModule } from '../holder-tracking/holder-tracking.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TokenDocument.name, schema: TokenSchema },
      { name: TokenInfoDocument.name, schema: TokenInfoSchema },
    ]),
    CacheModule,
    ExchangesModule,
    WatchlistModule,
    HolderTrackingModule,
  ],
  controllers: [TokensController],
  providers: [TokensService, TokensRepository],
  exports: [TokensService, TokensRepository],
})
export class TokensModule {}
