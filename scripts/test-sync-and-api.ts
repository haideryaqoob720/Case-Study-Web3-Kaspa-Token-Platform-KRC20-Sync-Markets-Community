// Purpose: Manual testing script for holder snapshot sync and API
// What: Triggers TokenInfoSyncProcessor to create snapshots, queries repository
//      to verify snapshot creation, displays results for debugging

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TokenInfoSyncProcessor } from '../src/worker/token-info-sync.processor';
import { HolderSnapshotRepository } from '../src/holder-tracking/holder-snapshot.repository';

async function testSyncAndAPI() {
  console.log('🚀 Starting test...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const processor = app.get(TokenInfoSyncProcessor);
  const repository = app.get(HolderSnapshotRepository);

  try {
    console.log('📊 Step 1: Check current snapshots');
    const testTicker = 'NACHO';
    const beforeSnapshots = await repository.findHistory(
      testTicker,
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      new Date(),
    );
    console.log(`   Current snapshots for ${testTicker}: ${beforeSnapshots.length}\n`);

    console.log('⚙️  Step 2: Trigger sync worker');
    const result = await processor.process({
      data: { source: 'manual' },
    } as any);
    console.log(`   ✅ Sync completed:`);
    console.log(`      - Successful: ${result.successful}`);
    console.log(`      - Failed: ${result.failed}`);
    console.log(`      - Duration: ${result.duration}ms\n`);

    console.log('📊 Step 3: Check snapshots after sync');
    const afterSnapshots = await repository.findHistory(
      testTicker,
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      new Date(),
    );
    console.log(`   Snapshots after sync: ${afterSnapshots.length}`);
    console.log(`   New snapshots created: ${afterSnapshots.length - beforeSnapshots.length}\n`);

    if (afterSnapshots.length > 0) {
      console.log('📈 Step 4: Display snapshot details');
      console.log(`   Found ${afterSnapshots.length} snapshots for ${testTicker}`);
      
      const latest = afterSnapshots[afterSnapshots.length - 1];
      console.log(`   Latest snapshot:`);
      console.log(`      - Date: ${latest.snapshotTimestamp.toISOString().split('T')[0]}`);
      console.log(`      - Holders: ${latest.holderTotal}`);
      console.log(`      - Top 10%: ${latest.top10Percentage}%`);
      console.log(`      - Top 50%: ${latest.top50Percentage}%`);
      
      if (afterSnapshots.length > 1) {
        console.log(`\n   All snapshots:`);
        afterSnapshots.forEach((s, i) => {
          console.log(`      ${i + 1}. ${s.snapshotTimestamp.toISOString().split('T')[0]} - ${s.holderTotal} holders`);
        });
      }
    }

    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await app.close();
  }
}

testSyncAndAPI();

