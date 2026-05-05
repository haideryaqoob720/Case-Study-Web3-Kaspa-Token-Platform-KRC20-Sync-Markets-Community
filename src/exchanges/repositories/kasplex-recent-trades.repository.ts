import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KasplexRecentTrade } from '../dto/kasplex-recent-trade.dto';
import { KasplexRecentTradeDocument } from '../../database/schemas/kasplex-recent-trade.schema';

@Injectable()
export class KasplexRecentTradesRepository {
  constructor(
    @InjectModel(KasplexRecentTradeDocument.name)
    private readonly model: Model<KasplexRecentTradeDocument>,
  ) {}

  async bulkUpsert(
    trades: KasplexRecentTrade[],
  ): Promise<{ inserted: number; updated: number }> {
    if (trades.length === 0) return { inserted: 0, updated: 0 };

    const ops = trades.map((trade) => ({
      updateOne: {
        filter: { txId: trade.txId },
        update: { $set: trade },
        upsert: true,
      },
    }));

    const result = await this.model.bulkWrite(ops, { ordered: false });
    return {
      inserted: result.upsertedCount ?? 0,
      updated: result.modifiedCount ?? 0,
    };
  }

  async deleteOlderThan(olderThanTimestampMs: number): Promise<number> {
    const result = await this.model
      .deleteMany({ txTime: { $lt: olderThanTimestampMs } })
      .exec();
    return result.deletedCount ?? 0;
  }

  async findLatestByTicker(
    ticker: string,
    limit = 20,
  ): Promise<KasplexRecentTradeDocument[]> {
    return this.model
      .find({ ticker: ticker.trim().toUpperCase() })
      .sort({ txTime: -1 })
      .limit(limit)
      .exec();
  }
}
