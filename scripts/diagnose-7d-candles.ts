/**
 * Diagnose why exchange_tokens_candles_7d has no data.
 * Run: npx ts-node -r tsconfig-paths/register scripts/diagnose-7d-candles.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExchangesRepository } from '../src/exchanges/repositories/exchanges.repository';
import { ExchangeSync7dProcessor } from '../src/worker/exchange-sync-7d.processor';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

async function diagnose() {
  console.log('🔍 Diagnosing exchange_tokens_candles_7d...\n');

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const repo = app.get(ExchangesRepository);
    const processor7d = app.get(ExchangeSync7dProcessor);

    // 1. Check token_exchanges
    const allPairs = await (repo as any).tokenExchangesModel
      .find({ isActive: true })
      .lean()
      .exec();
    console.log(`📌 Active token-exchange pairs: ${allPairs.length}`);
    if (allPairs.length === 0) {
      console.log('   ⚠️  No pairs! TokenExchangesInitializationService populates from tokenExchanges config.');
      console.log('   → Ensure tokens exist in tokens collection and app has run onModuleInit.');
    } else {
      const sample = allPairs.slice(0, 3);
      console.log('   Sample:', sample.map((p: any) => `${p.tokenIdentifier}@${p.exchangeId}`).join(', '));
    }

    // 2. Check exchange_klines_sync_state for 7d
    const syncStates = await (repo as any).klinesSyncStateModel
      .find({ interval: '7d' })
      .lean()
      .exec();
    console.log(`\n📌 exchange_klines_sync_state (7d): ${syncStates.length} entries`);
    if (syncStates.length > 0) {
      const recent = syncStates.filter((s: any) => s.lastSuccessAt).length;
      console.log(`   With lastSuccessAt: ${recent}`);
    }

    // 3. Check exchange_tokens_candles_7d collection
    const candles7dModel = app.get(getModelToken('ExchangeMarketData7dDocument'));
    const count7d = await candles7dModel.countDocuments().exec();
    console.log(`\n📌 exchange_tokens_candles_7d: ${count7d} documents`);
    if (count7d > 0) {
      const sample = await candles7dModel.find().limit(2).lean().exec();
      console.log('   Sample:', JSON.stringify(sample, null, 2).slice(0, 300) + '...');
    }

    // 4. Check exchanges
    const exchanges = await repo.findAllActive();
    console.log(`\n📌 Active exchanges: ${exchanges.length}`);
    console.log('   ', exchanges.map((e) => e.name).join(', '));

    // 5. Run 7d sync and show result
    console.log('\n📌 Running 7d sync...');
    const result = await processor7d.process({ data: { source: 'manual' } } as any);
    console.log('   Result:', JSON.stringify(result, null, 2));

    // 6. Re-check count after sync
    const countAfter = await candles7dModel.countDocuments().exec();
    console.log(`\n📌 exchange_tokens_candles_7d after sync: ${countAfter} documents`);

    if (countAfter === 0 && allPairs.length > 0) {
      console.log('\n⚠️  Possible causes:');
      console.log('   - Exchange API errors (check logs for fetchKline7d failures)');
      console.log('   - Wrong exchange symbol format for API');
      console.log('   - Redis: if REDIS_HOST is set, ensure BullMQ worker is running (same process)');
    }
  } finally {
    await app.close();
  }
}

diagnose().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
