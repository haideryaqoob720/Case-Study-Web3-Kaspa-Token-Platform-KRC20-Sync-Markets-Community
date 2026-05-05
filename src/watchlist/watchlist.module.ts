import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WatchlistDocument,
  WatchlistSchema,
} from '../database/schemas/watchlist.schema';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';
import { WatchlistRepository } from './watchlist.repository';
import { UsersModule } from '../users/users.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WatchlistDocument.name, schema: WatchlistSchema },
    ]),
    UsersModule,
    CacheModule,
  ],
  controllers: [WatchlistController],
  providers: [WatchlistService, WatchlistRepository],
  exports: [WatchlistService],
})
export class WatchlistModule {}
