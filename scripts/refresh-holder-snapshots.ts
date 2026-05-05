/**
 * Purpose: Refresh holder snapshots with FRESH data from Kasplex API
 * What: Fetches token info directly from Kasplex, updates token_info + tokens + holder snapshots
 * Usage: npx ts-node -r tsconfig-paths/register scripts/refresh-holder-snapshots.ts [NACHO] [TICKER2 ...]
 *        Or: npm run refresh:holders -- NACHO
 *        Or: npm run refresh:holders -- --all  (all tickers from tokens table)
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { KasplexApiService } from '../src/kasplex/kasplex-api.service';
import { TokensRepository } from '../src/tokens/tokens.repository';
import { TokenInfoRepository } from '../src/token-info/token-info.repository';
import { HolderSnapshotService } from '../src/holder-tracking/holder-snapshot.service';

function transformKasplexResponse(kasplexResponse: any): any {
  if (
    !kasplexResponse ||
    !kasplexResponse.result ||
    !Array.isArray(kasplexResponse.result)
  ) {
    return kasplexResponse;
  }
  const token = kasplexResponse.result[0];
  if (!token) return kasplexResponse;

  const transformedToken: any = {};
  transformedToken.ticker = token.tick || null;
  transformedToken.MaximumSupply = token.max || null;
  transformedToken.MintLimit = token.lim || null;
  transformedToken.preAllocated = token.pre || null;
  transformedToken.to = token.to || null;
  transformedToken.decimal = token.dec || null;
  transformedToken.Deploymentmode = token.mod || null;
  transformedToken.minted = token.minted || null;
  transformedToken.burned = token.burned || null;
  transformedToken.ContractAddress = token.ca || null;
  transformedToken.opScoreAdd = token.opScoreAdd || null;
  transformedToken.opScoreMod = token.opScoreMod || null;
  transformedToken.state = token.state || null;
  transformedToken.hashRev = token.hashRev || null;
  transformedToken.mtsAdd = token.mtsAdd || null;
  transformedToken.holderTotal = token.holderTotal || null;
  transformedToken.transferTotal = token.transferTotal || null;
  transformedToken.mintTotal = token.mintTotal || null;
  transformedToken.holder = token.holder || null;
  transformedToken.name = token.name || null;

  return {
    message: kasplexResponse.message || 'successful',
    result: [transformedToken],
  };
}

async function refreshHolderSnapshots() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const useAll = process.argv.includes('--all');

  const tickersToProcess: string[] = useAll ? [] : args.length > 0 ? args : ['NACHO'];

  console.log('🔄 Refresh Holder Snapshots (fresh Kasplex API data)\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kasplex = app.get(KasplexApiService);
  const tokensRepo = app.get(TokensRepository);
  const tokenInfoRepo = app.get(TokenInfoRepository);
  const holderSnapshotService = app.get(HolderSnapshotService);

  try {
    let tickers: string[];
    if (useAll) {
      tickers = await tokensRepo.getAllTickers();
      console.log(`📋 Processing ALL ${tickers.length} tickers from tokens table\n`);
    } else {
      tickers = tickersToProcess.map((t) => t.toUpperCase());
      console.log(`📋 Processing tickers: ${tickers.join(', ')}\n`);
    }

    let success = 0;
    let failed = 0;

    for (const tick of tickers) {
      try {
        const tokenEntity = await tokensRepo.findByTicker(tick);
        if (!tokenEntity?.identifier) {
          console.log(`   ⏭️  ${tick}: not in tokens table, skip`);
          failed++;
          continue;
        }

        // 1. Fetch FRESH from Kasplex (no cache)
        const kasplexResponse = await kasplex.fetchTokenInfo(tick);
        const transformed = transformKasplexResponse(kasplexResponse);
        const tokenData = transformed?.result?.[0];

        if (!tokenData) {
          console.log(`   ❌ ${tick}: no token data from Kasplex`);
          failed++;
          continue;
        }

        const ticker =
          typeof tokenData.ticker === 'string'
            ? tokenData.ticker
            : typeof tokenData.tick === 'string'
              ? tokenData.tick
              : tick;
        const tokenName = tokenData.name || null;
        const mintTotal = tokenData.mintTotal
          ? parseInt(tokenData.mintTotal, 10)
          : null;
        const holderTotal = tokenData.holderTotal
          ? parseInt(tokenData.holderTotal, 10)
          : null;

        // 2. Update token_info (refresh cache)
        await tokenInfoRepo.upsertTokenInfo(
          ticker,
          transformed,
          tokenName,
          tokenEntity.identifier,
        );

        // 3. Update tokens (holder/mint count)
        if (mintTotal !== null || holderTotal !== null || tokenName !== null) {
          await tokensRepo.updateMintAndHolderCount(
            ticker,
            mintTotal,
            holderTotal,
            tokenName,
          );
        }

        // 4. Save holder snapshot (fresh data)
        if (
          holderTotal !== null &&
          tokenData.holder &&
          Array.isArray(tokenData.holder)
        ) {
          await holderSnapshotService.saveDailySnapshots([
            {
              ticker,
              holderTotal,
              transferTotal: tokenData.transferTotal
                ? parseInt(tokenData.transferTotal, 10)
                : null,
              mintTotal,
              topHolders: tokenData.holder,
              mintedSupply: tokenData.minted || '0',
            },
          ]);
          console.log(
            `   ✅ ${ticker}: refreshed (holders=${holderTotal}, top10/20/50 from live Kasplex)`,
          );
          success++;
        } else {
          console.log(`   ⏭️  ${ticker}: no holder data, skip snapshot`);
        }

        // Rate limit: 200ms between Kasplex calls
        if (tickers.length > 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (err) {
        console.error(`   ❌ ${tick}: ${err instanceof Error ? err.message : err}`);
        failed++;
      }
    }

    console.log(`\n✅ Done: ${success} refreshed, ${failed} failed`);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

refreshHolderSnapshots();
