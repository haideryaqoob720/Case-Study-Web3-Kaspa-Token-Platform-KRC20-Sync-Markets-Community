import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Krc20OpDocument,
  Krc20OpEntity,
} from '../database/schemas/krc20-op.schema';

@Injectable()
export class Krc20OpRepository {
  constructor(
    @InjectModel(Krc20OpDocument.name)
    private readonly model: Model<Krc20OpDocument>,
  ) {}

  async bulkUpsertOps(
    ops: Array<Partial<Krc20OpEntity> & { dedupeKey: string }>,
  ): Promise<void> {
    if (ops.length === 0) return;

    const opsBulk = ops.map((doc) => ({
      updateOne: {
        filter: { dedupeKey: doc.dedupeKey },
        update: { $set: doc },
        upsert: true,
      },
    }));

    await this.model.bulkWrite(opsBulk, { ordered: false });
  }

  /** Rows in DB for this tick involving the wallet (sender or receiver). */
  async countByTickAndWallet(tick: string, wallet: string): Promise<number> {
    return this.model.countDocuments({
      tick,
      $or: [{ from: wallet }, { to: wallet }],
    });
  }
}
