// Purpose: Manually trigger candle sync (7d, 1h, 1d, 1M, 1Y, max) to populate exchange_tokens_candles_* tables
// Usage: yarn run sync:candles  (or: npx ts-node -r tsconfig-paths/register scripts/sync-candles-now.ts)

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExchangeSync7dProcessor } from '../src/worker/exchange-sync-7d.processor';
import { ExchangeSyncKlinesProcessor } from '../src/worker/exchange-sync-klines.processor';

async function syncCandlesNow() {
  console.log('🚀 Syncing candle data (7d, 1h, 1d, 1M, 1Y, max)...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const processor7d = app.get(ExchangeSync7dProcessor);
  const processorKlines = app.get(ExchangeSyncKlinesProcessor);

  try {
    const intervals = ['7d', '1h', '1d', '1M', '1Y', 'max'] as const;

    for (const interval of intervals) {
      if (interval === '7d') {
        console.log(`📊 Syncing 7d...`);
        const result = await processor7d.process({ data: { source: 'manual' } } as any);
        console.log(`   ✅ 7d: ${result.successful} ok, ${result.failed} failed, ${result.skipped} skipped (${result.duration}ms)\n`);
      } else {
        console.log(`📊 Syncing ${interval}...`);
        const result = await processorKlines.process({
          id: `manual-${interval}-${Date.now()}`,
          data: { interval, source: 'manual' },
        } as any);
        console.log(`   ✅ ${interval}: ${result.successful} ok, ${result.failed} failed, ${result.skipped} skipped (${result.duration}ms)\n`);
      }
    }

    console.log('✅ Candle sync completed.');
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

syncCandlesNow();
