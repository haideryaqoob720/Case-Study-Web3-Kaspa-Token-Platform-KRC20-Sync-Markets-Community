import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TokenInfoDocument } from '../database/schemas/token-info.schema';
import { HolderTrend1mRepository } from './holder-trend-1m.repository';

const MAX_TOKENS_PER_CYCLE = 100;
const CHUNK_SIZE = 10;
const CHUNK_DELAY_MS = 500;
/** Skip re-write if last point is within this window (overlapping / fast cycles). */
const FRESHNESS_SKIP_MS = 55_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TokenInfoPayload = {
  ticker?: string;
  holderTotal?: string | number | null;
  minted?: string | null;
  holder?: Array<{ amount?: string | number | null }>;
};

@Injectable()
export class HolderTrend1mService {
  constructor(
    @InjectModel(TokenInfoDocument.name)
    private readonly tokenInfoModel: Model<TokenInfoDocument>,
    private readonly holderTrend1mRepository: HolderTrend1mRepository,
  ) {}

  async processMinuteSnapshot(): Promise<{
    totalEligible: number;
    selected: number;
    processed: number;
    skippedFresh: number;
    skippedNotPriority: number;
    failed: number;
    written: number;
  }> {
    const docs = await this.tokenInfoModel
      .find({})
      .select('ticker response_json')
      .sort({ ticker: 1 })
      .lean()
      .exec();

    const bucketStart = new Date(Math.floor(Date.now() / 60000) * 60000);

    const eligible: Array<{
      ticker: string;
      normalized: { holders: number; top10: number; top20: number; top50: number };
    }> = [];
    for (const doc of docs) {
      const token = (doc.response_json as any)?.result?.[0] as TokenInfoPayload | undefined;
      const ticker = String(token?.ticker || doc.ticker || '').toUpperCase();
      if (!ticker) continue;
      const normalized = this.normalizeHolderData(token);
      if (!normalized) continue;
      eligible.push({ ticker, normalized });
    }

    const totalEligible = eligible.length;
    const batch = eligible.slice(0, MAX_TOKENS_PER_CYCLE);
    const selected = batch.length;
    const skippedNotPriority = Math.max(0, totalEligible - selected);

    let processed = 0;
    let skippedFresh = 0;
    let failed = 0;
    let written = 0;

    for (let c = 0; c < batch.length; c += CHUNK_SIZE) {
      const chunk = batch.slice(c, c + CHUNK_SIZE);
      for (const { ticker, normalized } of chunk) {
        try {
          const latest = await this.holderTrend1mRepository.getLatestPointTimestamp(ticker);
          if (latest && Date.now() - latest.getTime() < FRESHNESS_SKIP_MS) {
            skippedFresh++;
            continue;
          }

          const prev = await this.holderTrend1mRepository.findPreviousPoint(
            ticker,
            bucketStart,
          );

          await this.holderTrend1mRepository.upsertPoint(ticker, {
            bucketStart,
            holders: normalized.holders,
            top10: normalized.top10,
            top20: normalized.top20,
            top50: normalized.top50,
            top10Delta: prev ? normalized.top10 - prev.top10 : 0,
            top20Delta: prev ? normalized.top20 - prev.top20 : 0,
            top50Delta: prev ? normalized.top50 - prev.top50 : 0,
          });

          processed++;
          written++;
        } catch {
          failed++;
        }
      }

      if (c + CHUNK_SIZE < batch.length) {
        await sleep(CHUNK_DELAY_MS);
      }
    }

    return {
      totalEligible,
      selected,
      processed,
      skippedFresh,
      skippedNotPriority,
      failed,
      written,
    };
  }

  async get1dTrend(ticker: string) {
    return this.holderTrend1mRepository.findLast24h(ticker.toUpperCase());
  }

  private normalizeHolderData(token?: TokenInfoPayload): {
    holders: number;
    top10: number;
    top20: number;
    top50: number;
  } | null {
    if (!token) return null;
    const holderArray = Array.isArray(token.holder) ? token.holder : null;
    const holderTotalRaw = Number(token.holderTotal);
    const minted = BigInt(String(token.minted || '0'));
    if (!holderArray || holderArray.length === 0) return null;
    if (!Number.isFinite(holderTotalRaw)) return null;
    if (minted <= 0n) return null;

    const limit = Math.min(50, holderArray.length);
    let sum10 = 0n;
    let sum20 = 0n;
    let sum50 = 0n;

    for (let i = 0; i < limit; i++) {
      const amount = BigInt(String(holderArray[i]?.amount ?? '0'));
      sum50 += amount;
      if (i < 20) sum20 += amount;
      if (i < 10) sum10 += amount;
    }

    return {
      holders: holderTotalRaw,
      top10: this.calculatePercentage(sum10, minted),
      top20: this.calculatePercentage(sum20, minted),
      top50: this.calculatePercentage(sum50, minted),
    };
  }

  private calculatePercentage(amount: bigint, total: bigint): number {
    if (total === 0n) return 0;
    const scaled = (amount * 1000000n) / total;
    const value = Number(scaled) / 10000;
    return Math.round(value * 10000) / 10000;
  }
}

