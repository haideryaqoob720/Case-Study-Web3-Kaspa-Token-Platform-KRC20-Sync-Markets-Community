// Purpose: Main application module
// What: Registers all feature modules including HolderTrackingModule
//      for holder snapshot API endpoints

import { Module } from '@nestjs/common';
// import { APP_GUARD } from '@nestjs/core';
// import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { TokensModule } from './tokens/tokens.module';
import { TokenInfoModule } from './token-info/token-info.module';
import { TokenNewsModule } from './token-news/token-news.module';
import { WorkerModule } from './worker/worker.module';
import { CacheModule } from './cache/cache.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { FeedbackModule } from './feedback/feedback.module';
import { HolderTrackingModule } from './holder-tracking/holder-tracking.module';
import { TokenVotesModule } from './token-votes/token-votes.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { CommunityModule } from './community/community.module';
import { TokenMetadataModule } from './token-metadata/token-metadata.module';
import { Krc20TransactionsModule } from './krc20-transactions/krc20-transactions.module';

@Module({
  imports: [
    // ThrottlerModule.forRoot([
    //   {
    //     ttl: 60_000, // 60 seconds
    //     limit: 20, // 20 requests per ttl
    //   },
    // ]),
    ConfigModule,
    DatabaseModule,
    TokensModule,
    TokenInfoModule,
    FeedbackModule,
    TokenNewsModule,
    CacheModule,
    ...(process.env.ENABLE_BACKGROUND_WORKERS !== '0'
      ? [WorkerModule.forRoot()]
      : []),
    ExchangesModule,
    HolderTrackingModule,
    TokenVotesModule,
    WatchlistModule,
    UsersModule,
    ChatModule,
    CommunityModule,
    TokenMetadataModule,
    Krc20TransactionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // {
    //   provide: APP_GUARD,
    //   useClass: ThrottlerGuard,
    // },
  ],
})
export class AppModule {}
