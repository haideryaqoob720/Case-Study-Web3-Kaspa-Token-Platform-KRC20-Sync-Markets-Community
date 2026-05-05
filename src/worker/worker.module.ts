// Purpose: Worker module for background job processing (Mongoose)
// What: Configures all background workers, BullMQ if Redis available

import { Module, DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TokenSyncProcessor } from './token-sync.processor';
import { TokenSyncScheduler } from './token-sync.scheduler';
import { TokenSyncBullMQProcessor } from './token-sync.bullmq-processor';
import { TokenInfoSyncProcessor } from './token-info-sync.processor';
import { TokenInfoSyncScheduler } from './token-info-sync.scheduler';
import { TokenInfoSyncBullMQProcessor } from './token-info-sync.bullmq-processor';
import { ExchangeSync24hProcessor } from './exchange-sync-24h.processor';
import { ExchangeSync24hScheduler } from './exchange-sync-24h.scheduler';
import { ExchangeSync24hBullMQProcessor } from './exchange-sync-24h.bullmq-processor';
import { ExchangeSync7dProcessor } from './exchange-sync-7d.processor';
import { ExchangeSync7dScheduler } from './exchange-sync-7d.scheduler';
import { ExchangeSync7dBullMQProcessor } from './exchange-sync-7d.bullmq-processor';
import { ExchangeSyncKlinesProcessor } from './exchange-sync-klines.processor';
import { ExchangeSyncKlinesScheduler } from './exchange-sync-klines.scheduler';
import { ExchangeSyncKlinesBullMQProcessor } from './exchange-sync-klines.bullmq-processor';
import { TokenRankingProcessor } from './token-ranking.processor';
import { TokenRankingScheduler } from './token-ranking.scheduler';
import { TokenRankingBullMQProcessor } from './token-ranking.bullmq-processor';
import { TierListCacheService } from './tier-list-cache.service';
import { ApiBudgetService } from './api-budget.service';
import { TierAssignmentProcessor } from './tier-assignment.processor';
import { TierAssignmentScheduler } from './tier-assignment.scheduler';
import { FloorPriceSyncProcessor } from './floor-price-sync.processor';
import { FloorPriceSyncScheduler } from './floor-price-sync.scheduler';
import { FloorPriceSyncBullMQProcessor } from './floor-price-sync.bullmq-processor';
import { RecentTradesSyncProcessor } from './recent-trades-sync.processor';
import { RecentTradesSyncScheduler } from './recent-trades-sync.scheduler';
import { RecentTradesSyncBullMQProcessor } from './recent-trades-sync.bullmq-processor';
import { RecentTradesCleanProcessor } from './recent-trades-clean.processor';
import { RecentTradesCleanScheduler } from './recent-trades-clean.scheduler';
import { RecentTradesCleanBullMQProcessor } from './recent-trades-clean.bullmq-processor';
import { KasplexModule } from '../kasplex/kasplex.module';
import { KasPriceModule } from '../kas-price/kas-price.module';
import { TokensModule } from '../tokens/tokens.module';
import { TokenInfoModule } from '../token-info/token-info.module';
import { CacheModule } from '../cache/cache.module';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { HolderTrackingModule } from '../holder-tracking/holder-tracking.module';
import { Krc20TransactionsModule } from '../krc20-transactions/krc20-transactions.module';
import { Krc20OplistSyncProcessor } from './krc20-oplist-sync.processor';
import { Krc20OplistSyncScheduler } from './krc20-oplist-sync.scheduler';
import { ChartPrecomputeProcessor } from './chart-precompute.processor';
import { ChartPrecomputeScheduler } from './chart-precompute.scheduler';
import { HolderTrend1mProcessor } from './holder-trend-1m.processor';
import { HolderTrend1mScheduler } from './holder-trend-1m.scheduler';

// Workers run without Redis by design: schedulers call processors directly (no BullMQ queues).
// This avoids Redis dependency and "max clients" issues; third-party API calls are not gated by Redis.
const WORKERS_USE_REDIS = false;

@Module({})
export class WorkerModule {
  static forRoot(): DynamicModule {
    const hasRedis = WORKERS_USE_REDIS;

    const imports: any[] = [
      KasplexModule,
      KasPriceModule,
      TokensModule,
      TokenInfoModule,
      CacheModule,
      ExchangesModule,
      HolderTrackingModule,
      Krc20TransactionsModule,
    ];
    const providers: any[] = [
      TokenSyncProcessor,
      TokenSyncScheduler,
      TierListCacheService,
      ApiBudgetService,
      TierAssignmentProcessor,
      TierAssignmentScheduler,
      TokenInfoSyncProcessor,
      TokenInfoSyncScheduler,
      ExchangeSync24hProcessor,
      ExchangeSync24hScheduler,
      ExchangeSync7dProcessor,
      ExchangeSync7dScheduler,
      ExchangeSyncKlinesProcessor,
      ExchangeSyncKlinesScheduler,
      TokenRankingProcessor,
      TokenRankingScheduler,
      FloorPriceSyncProcessor,
      FloorPriceSyncScheduler,
      RecentTradesSyncProcessor,
      RecentTradesSyncScheduler,
      RecentTradesCleanProcessor,
      RecentTradesCleanScheduler,
      Krc20OplistSyncProcessor,
      Krc20OplistSyncScheduler,
      ChartPrecomputeProcessor,
      ChartPrecomputeScheduler,
      HolderTrend1mProcessor,
      HolderTrend1mScheduler,
    ];

    if (hasRedis) {
      imports.push(
        BullModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => {
            const redisConfig = configService.get('redis');
            return {
              connection: {
                host: redisConfig.host,
                port: redisConfig.port,
                password: redisConfig.password,
                db: redisConfig.db,
                maxRetriesPerRequest: null,
                lazyConnect: true,
                // true = queue commands when disconnected so workers can recover after long jobs / brief drop
                enableOfflineQueue: true,
                connectTimeout: 20000, // 20s for Redis Cloud / remote Redis
                retryStrategy: (times: number) =>
                  times <= 3 ? Math.min(times * 1000, 5000) : null,
              },
            };
          },
          inject: [ConfigService],
        }),
        BullModule.registerQueue(
          { name: 'token-sync' },
          { name: 'token-info-sync' },
          { name: 'exchange-sync-24h' },
          { name: 'exchange-sync-7d' },
          { name: 'exchange-sync-klines' },
          { name: 'token-ranking' },
          { name: 'floor-price-sync' },
          { name: 'recent-trades-sync' },
          { name: 'recent-trades-clean' },
        ),
      );
      // BullMQ job consumers: when Redis is used, schedulers enqueue jobs and these processors run them.
      providers.push(
        TokenSyncBullMQProcessor,
        TokenInfoSyncBullMQProcessor,
        ExchangeSync24hBullMQProcessor,
        ExchangeSync7dBullMQProcessor,
        ExchangeSyncKlinesBullMQProcessor,
        TokenRankingBullMQProcessor,
        FloorPriceSyncBullMQProcessor,
        RecentTradesSyncBullMQProcessor,
        RecentTradesCleanBullMQProcessor,
      );
    }

    return {
      module: WorkerModule,
      imports,
      providers,
    };
  }
}
