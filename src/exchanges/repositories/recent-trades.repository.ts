import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RecentTradeDocument,
  RecentTradeEntity,
} from '../../database/schemas/recent-trade.schema';
import { NormalizedTrade } from '../dto/normalized-trade.dto';

@Injectable()
export class RecentTradesRepository {
  constructor(
    @InjectModel(RecentTradeDocument.name)
    private readonly model: Model<RecentTradeDocument>,
  ) {}

  /**
   * Bulk upsert trades by (exchangeCode, exchangeSymbol, exchangeTradeId).
   * Uses updateOne + upsert so duplicates are skipped / updated.
   */
  async bulkUpsert(trades: NormalizedTrade[]): Promise<{ inserted: number; updated: number }> {
    if (trades.length === 0) return { inserted: 0, updated: 0 };
    const BATCH = 200;
    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < trades.length; i += BATCH) {
      const batch = trades.slice(i, i + BATCH);
      const ops = batch.map((t) => ({
        updateOne: {
          filter: {
            exchangeCode: t.exchangeCode,
            exchangeSymbol: t.exchangeSymbol,
            exchangeTradeId: t.exchangeTradeId,
          },
          update: {
            $set: {
              tokenIdentifier: t.tokenIdentifier,
              timestamp: t.timestamp,
              side: t.side,
              price: t.price,
              amount: t.amount,
              ...(t.quoteVolume != null && { quoteVolume: t.quoteVolume }),
            },
          },
          upsert: true,
        },
      }));
      const result = await this.model.bulkWrite(ops, { ordered: false });
      inserted += result.upsertedCount ?? 0;
      updated += result.modifiedCount ?? 0;
    }
    return { inserted, updated };
  }

  /**
   * Delete trades older than retentionMs (e.g. 24h).
   */
  async deleteOlderThan(olderThanTimestampMs: number): Promise<number> {
    const result = await this.model
      .deleteMany({ timestamp: { $lt: olderThanTimestampMs } })
      .exec();
    return result.deletedCount ?? 0;
  }

  /**
   * Find latest trades, optionally filtered by tokenIdentifier, sorted by timestamp desc.
   */
  async findLatest(options: {
    tokenIdentifier?: string;
    limit?: number;
  }): Promise<RecentTradeDocument[]> {
    const { tokenIdentifier, limit = 50 } = options;
    const filter = tokenIdentifier ? { tokenIdentifier } : {};
    return this.model
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }
}
