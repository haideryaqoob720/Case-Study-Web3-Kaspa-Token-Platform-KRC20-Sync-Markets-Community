// Purpose: Service layer for holder snapshot business logic
// What: Calculates top holder percentages (10%, 20%, 50%) from holder arrays,
//      uses BigInt for precision with large token amounts, saves daily snapshots
//      with structured logging for monitoring

import { Injectable, Logger } from '@nestjs/common';
import { HolderSnapshotRepository } from './holder-snapshot.repository';
import { TokenHolderSnapshot } from '../database/entities/token-holder-snapshot.entity';

export interface SnapshotData {
  ticker: string;
  holderTotal: number;
  transferTotal: number | null;
  mintTotal: number | null;
  topHolders: Array<{ address: string; amount: string }>;
  mintedSupply: string;
}

@Injectable()
export class HolderSnapshotService {
  private readonly logger = new Logger(HolderSnapshotService.name);

  constructor(private readonly snapshotRepository: HolderSnapshotRepository) {}

  /**
   * LEGACY: Not used by any scheduler. Token Info Sync uses saveDailySnapshots() only.
   * Kept for tests/API; delegates to bulk path.
   */
  async saveDailySnapshot(data: SnapshotData): Promise<void> {
    return this.saveDailySnapshots([data]);
    // --- Before (one-by-one DB upsert per snapshot): ---
    // const startTime = Date.now();
    // try {
    //   const snapshot = this.buildSnapshot(data);
    //   await this.snapshotRepository.upsert(
    //     snapshot as unknown as TokenHolderSnapshot,
    //   );
    //   this.logger.debug({
    //     event: 'snapshot_saved',
    //     ticker: data.ticker,
    //     holderTotal: data.holderTotal,
    //     duration: Date.now() - startTime,
    //   });
    // } catch (error) {
    //   const duration = Date.now() - startTime;
    //   const message = error instanceof Error ? error.message : 'Unknown error';
    //   const isClientClosed =
    //     message === 'Operation interrupted because client was closed';
    //   if (isClientClosed) {
    //     this.logger.debug({
    //       event: 'snapshot_skipped_shutdown',
    //       ticker: data.ticker,
    //       duration,
    //     });
    //     return;
    //   }
    //   this.logger.error({
    //     event: 'snapshot_failed',
    //     ticker: data.ticker,
    //     error: message,
    //     duration,
    //   });
    //   throw error;
    // }
  }

  /**
   * Bulk save daily snapshots in one DB round-trip. Use from token-info-sync per chunk.
   */
  async saveDailySnapshots(dataList: SnapshotData[]): Promise<void> {
    if (dataList.length === 0) return;
    const startTime = Date.now();
    try {
      const snapshots = dataList.map((data) => this.buildSnapshot(data));
      await this.snapshotRepository.bulkUpsert(
        snapshots as unknown as TokenHolderSnapshot[],
      );
      this.logger.debug({
        event: 'snapshots_bulk_saved',
        count: snapshots.length,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isClientClosed =
        message === 'Operation interrupted because client was closed';
      if (isClientClosed) {
        this.logger.debug({
          event: 'snapshots_bulk_skipped_shutdown',
          count: dataList.length,
          duration: Date.now() - startTime,
        });
        return;
      }
      this.logger.error({
        event: 'snapshots_bulk_failed',
        count: dataList.length,
        error: message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /** Build one snapshot document from SnapshotData (shared by single and bulk save). */
  private buildSnapshot(data: SnapshotData): Record<string, unknown> {
    const totalSupply = BigInt(data.mintedSupply || '0');
    const percentages = this.calculatePercentages(
      data.topHolders,
      totalSupply,
    );
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return {
      ticker: data.ticker.toUpperCase(),
      snapshotTimestamp: today,
      holderTotal: data.holderTotal,
      transferTotal: data.transferTotal,
      mintTotal: data.mintTotal,
      top10Percentage: percentages.top10,
      top20Percentage: percentages.top20,
      top50Percentage: percentages.top50,
    };
  }

  /** One pass over holders to compute top 10/20/50 sums, then percentages. */
  private calculatePercentages(
    holders: Array<{ address: string; amount: string }>,
    totalSupply: bigint,
  ): { top10: number; top20: number; top50: number } {
    if (holders.length === 0 || totalSupply === 0n) {
      return { top10: 0, top20: 0, top50: 0 };
    }
    let sum10 = 0n;
    let sum20 = 0n;
    let sum50 = 0n;
    const limit = Math.min(50, holders.length);
    for (let i = 0; i < limit; i++) {
      const amount = BigInt(holders[i].amount || '0');
      sum50 += amount;
      if (i < 20) sum20 += amount;
      if (i < 10) sum10 += amount;
    }
    return {
      top10: this.calculatePercentage(sum10, totalSupply),
      top20: this.calculatePercentage(sum20, totalSupply),
      top50: this.calculatePercentage(sum50, totalSupply),
    };
  }

  private calculatePercentage(amount: bigint, totalSupply: bigint): number {
    if (totalSupply === 0n) return 0;
    const percentageScaled = (amount * 1000000n) / totalSupply;
    const percentage = Number(percentageScaled) / 10000;
    return Math.round(percentage * 10000) / 10000;
  }

  /**
   * Get 7-day holder growth per ticker for trending score (T component).
   * Uses latest snapshot vs snapshot closest to 7 days ago; growth = max(0, latest - sevenDaysAgo).
   * Returns Map<ticker, holderGrowth7d>. Missing tickers get 0.
   */
  async getHolderGrowthMap(
    tickers: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (tickers.length === 0) return result;

    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    const snapshots = await this.snapshotRepository.findSnapshotsForTickers(
      tickers,
      eightDaysAgo,
      now,
    );

    // Group by ticker (ticker may be uppercase from DB)
    const byTicker = new Map<
      string,
      Array<{ snapshotTimestamp: Date; holderTotal: number }>
    >();
    for (const s of snapshots) {
      const key = (s.ticker || '').toUpperCase();
      if (!byTicker.has(key)) byTicker.set(key, []);
      byTicker.get(key)!.push({
        snapshotTimestamp: s.snapshotTimestamp instanceof Date ? s.snapshotTimestamp : new Date(s.snapshotTimestamp),
        holderTotal: s.holderTotal ?? 0,
      });
    }

    for (const ticker of tickers.map((t) => t.toUpperCase())) {
      const list = byTicker.get(ticker) || [];
      if (list.length === 0) {
        result.set(ticker, 0);
        continue;
      }
      // Latest = max timestamp
      const latest = list.reduce((a, b) =>
        a.snapshotTimestamp.getTime() >= b.snapshotTimestamp.getTime() ? a : b,
      );
      // Closest to 7 days ago
      const sevenDaysAgoSnap = list.reduce((a, b) =>
        Math.abs(a.snapshotTimestamp.getTime() - sevenDaysAgoTime) <=
        Math.abs(b.snapshotTimestamp.getTime() - sevenDaysAgoTime)
          ? a
          : b,
      );
      const growth = Math.max(
        0,
        latest.holderTotal - sevenDaysAgoSnap.holderTotal,
      );
      result.set(ticker, growth);
    }
    return result;
  }
}
