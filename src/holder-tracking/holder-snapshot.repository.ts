// Purpose: Repository layer for token holder snapshot database operations (Mongoose)
// What: Query snapshots by ticker/date, find history, idempotent upsert

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TokenHolderSnapshotDocument,
  TokenHolderSnapshot,
} from '../database/schemas/token-holder-snapshot.schema';

/** Never persist holder arrays on snapshot docs; strip if present (legacy). */
const LEGACY_SNAPSHOT_ARRAY_UNSET = {
  topHolders: '',
  holders: '',
  holder: '',
} as const;

@Injectable()
export class HolderSnapshotRepository {
  private readonly logger = new Logger(HolderSnapshotRepository.name);
  private hasRunGlobalLegacyCleanup = false;

  constructor(
    @InjectModel(TokenHolderSnapshotDocument.name)
    private readonly model: Model<TokenHolderSnapshotDocument>,
  ) {}

  async findByTickerAndDate(
    ticker: string,
    date: Date,
  ): Promise<TokenHolderSnapshot | null> {
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    const doc = await this.model
      .findOne({
        ticker: ticker.toUpperCase(),
        snapshotTimestamp: normalizedDate,
      })
      .exec();
    return doc ?? null;
  }

  async findHistory(
    ticker: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TokenHolderSnapshot[]> {
    const docs = await this.model
      .find({
        ticker: ticker.toUpperCase(),
        snapshotTimestamp: { $gte: startDate, $lte: endDate },
      })
      .sort({ snapshotTimestamp: 1 })
      .select(
        'snapshotTimestamp holderTotal top10Percentage top20Percentage top50Percentage',
      )
      .lean()
      .exec();
    return docs as unknown as TokenHolderSnapshot[];
  }

  /**
   * Fetch snapshots for multiple tickers within a date range (for trending: holder growth 7d).
   * Returns docs with ticker, snapshotTimestamp, holderTotal.
   */
  async findSnapshotsForTickers(
    tickers: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<
    Array<{ ticker: string; snapshotTimestamp: Date; holderTotal: number }>
  > {
    if (tickers.length === 0) return [];
    const normalized = tickers.map((t) => t.toUpperCase());
    const docs = await this.model
      .find({
        ticker: { $in: normalized },
        snapshotTimestamp: { $gte: startDate, $lte: endDate },
      })
      .sort({ ticker: 1, snapshotTimestamp: 1 })
      .select('ticker snapshotTimestamp holderTotal')
      .lean()
      .exec();
    return docs as Array<{
      ticker: string;
      snapshotTimestamp: Date;
      holderTotal: number;
    }>;
  }

  /**
   * LEGACY: Not used by any scheduler. saveDailySnapshot() now delegates to saveDailySnapshots() → bulkUpsert.
   * Kept for backward compatibility; delegates to bulkUpsert([snapshot]).
   */
  async upsert(snapshot: TokenHolderSnapshot): Promise<TokenHolderSnapshot> {
    await this.bulkUpsert([snapshot]);
    return snapshot as TokenHolderSnapshot;
  }

  /**
   * Bulk upsert many snapshots in one round-trip (ordered: false so one failure doesn't block rest).
   * Used by Token Info Sync processor via HolderSnapshotService.saveDailySnapshots() (production path).
   */
  async bulkUpsert(snapshots: TokenHolderSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    await this.ensureGlobalLegacyCleanupOnce();
    const ops = snapshots.map((s) => ({
      updateOne: {
        filter: {
          ticker: s.ticker,
          snapshotTimestamp: s.snapshotTimestamp,
        },
        update: {
          $set: {
            holderTotal: s.holderTotal,
            transferTotal: s.transferTotal,
            mintTotal: s.mintTotal,
            top10Percentage: s.top10Percentage,
            top20Percentage: s.top20Percentage,
            top50Percentage: s.top50Percentage,
          },
          $unset: { ...LEGACY_SNAPSHOT_ARRAY_UNSET },
        },
        upsert: true,
      },
    }));
    await this.model.bulkWrite(ops, { ordered: false });

    const tickers = [...new Set(snapshots.map((s) => String(s.ticker).toUpperCase()))];
    await this.unsetLegacyArraysForTickers(tickers);
  }

  /**
   * Removes legacy holder-array fields from ALL snapshot rows for these tickers (any date),
   * so old daily rows (e.g. April 1) get cleaned when that ticker is synced again.
   */
  private async unsetLegacyArraysForTickers(tickers: string[]): Promise<void> {
    if (tickers.length === 0) return;
    await this.model
      .updateMany(
        {
          ticker: { $in: tickers },
          $or: [
            { topHolders: { $exists: true } },
            { holders: { $exists: true } },
            { holder: { $exists: true } },
          ],
        },
        { $unset: { ...LEGACY_SNAPSHOT_ARRAY_UNSET } },
      )
      .exec();
  }

  /**
   * One-time global cleanup per process start.
   * Prevents old rows (any ticker/date) from keeping legacy holder arrays forever.
   */
  private async ensureGlobalLegacyCleanupOnce(): Promise<void> {
    if (this.hasRunGlobalLegacyCleanup) return;
    this.hasRunGlobalLegacyCleanup = true;

    const result = await this.model
      .updateMany(
        {
          $or: [
            { topHolders: { $exists: true } },
            { holders: { $exists: true } },
            { holder: { $exists: true } },
          ],
        },
        { $unset: { ...LEGACY_SNAPSHOT_ARRAY_UNSET } },
      )
      .exec();

    if ((result.modifiedCount ?? 0) > 0) {
      this.logger.log(
        `Legacy snapshot arrays removed from ${result.modifiedCount} documents.`,
      );
    }
  }
}
