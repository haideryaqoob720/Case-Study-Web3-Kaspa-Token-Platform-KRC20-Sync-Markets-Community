#!/usr/bin/env node
/**
 * Rename candle collections to new naming scheme.
 * Run this ONCE before deploying the schema changes.
 *
 * exchange_market_data_24h - UNCHANGED (stats: volume24h, marketCap, change24h)
 *
 * Renames:
 *   exchange_market_data_7d  -> exchange_tokens_candles_7d
 *   exchange_market_data_1h  -> exchange_tokens_candles_1h
 *   exchange_market_data_1M  -> exchange_tokens_candles_1M
 *   exchange_market_data_1Y  -> exchange_tokens_candles_1Y
 *   exchange_market_data_max -> exchange_tokens_candles_max
 *
 * Usage: MONGODB_URI="mongodb://..." node scripts/rename-candle-collections.js
 * Or run the mongosh commands below manually in MongoDB Compass / mongosh.
 */

const renames = [
  ['exchange_market_data_7d', 'exchange_tokens_candles_7d'],
  ['exchange_market_data_1h', 'exchange_tokens_candles_1h'],
  ['exchange_market_data_1M', 'exchange_tokens_candles_1M'],
  ['exchange_market_data_1Y', 'exchange_tokens_candles_1Y'],
  ['exchange_market_data_max', 'exchange_tokens_candles_max'],
];

async function run() {
  const mongoose = await import('mongoose');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kaspamemes-dev';

  try {
    await mongoose.default.connect(uri);
    const db = mongoose.default.connection.db;

    const cols = await db.listCollections().toArray();
    const names = new Set(cols.map((c) => c.name));

    for (const [oldName, newName] of renames) {
      try {
        if (!names.has(oldName)) {
          console.log(`⏭️  Skip ${oldName} (not found)`);
          continue;
        }
        if (names.has(newName)) {
          console.log(`⏭️  Skip ${oldName} -> ${newName} (target exists)`);
          continue;
        }
        await db.collection(oldName).rename(newName);
        console.log(`✅ ${oldName} -> ${newName}`);
        names.delete(oldName);
        names.add(newName);
      } catch (e) {
        if (e.code === 48) {
          console.log(`⏭️  Skip ${oldName} -> ${newName} (target exists)`);
        } else {
          throw e;
        }
      }
    }
    console.log('\nDone. exchange_market_data_24h unchanged (stats safe).');
  } finally {
    await mongoose.default.disconnect();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
