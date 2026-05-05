/**
 * Script to check which tokens are in token_exchanges table
 * Run with: npx ts-node scripts/check-token-exchanges.ts
 */

import { DataSource } from 'typeorm';
import { TokenExchangeEntity } from '../src/database/entities/token-exchange.entity';
import { ExchangeEntity } from '../src/database/entities/exchange.entity';
import { ExchangeMarketData24hEntity } from '../src/database/entities/exchange-market-data-24h.entity';
import { ExchangeMarketData7dEntity } from '../src/database/entities/exchange-market-data-7d.entity';
import { ExchangeSyncLogEntity } from '../src/database/entities/exchange-sync-log.entity';
import { config } from 'dotenv';

config();

async function checkTokenExchanges() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'kaspamemes',
    entities: [
      TokenExchangeEntity,
      ExchangeEntity,
      ExchangeMarketData24hEntity,
      ExchangeMarketData7dEntity,
      ExchangeSyncLogEntity,
    ],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connected\n');

    const tokenExchangeRepository = dataSource.getRepository(TokenExchangeEntity);
    const exchangeRepository = dataSource.getRepository(ExchangeEntity);

    // Get all token exchanges with exchange relations
    const tokenExchanges = await tokenExchangeRepository.find({
      relations: ['exchange'],
      order: { tokenIdentifier: 'ASC' },
    });

    // Group by token identifier
    const tokensMap = new Map<string, string[]>();
    for (const te of tokenExchanges) {
      if (!tokensMap.has(te.tokenIdentifier)) {
        tokensMap.set(te.tokenIdentifier, []);
      }
      tokensMap.get(te.tokenIdentifier)!.push(te.exchange.name);
    }

    console.log(`📊 Total tokens in token_exchanges table: ${tokensMap.size}\n`);
    console.log('Tokens and their exchanges:');
    console.log('='.repeat(60));
    
    for (const [token, exchanges] of Array.from(tokensMap.entries()).sort()) {
      console.log(`${token}: ${exchanges.join(', ')}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Total token-exchange pairs: ${tokenExchanges.length}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

checkTokenExchanges();

