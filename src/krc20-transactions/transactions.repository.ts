import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TransactionDocument,
  TransactionEntity,
} from '../database/schemas/transaction.schema';

@Injectable()
export class TransactionsRepository {
  constructor(
    @InjectModel(TransactionDocument.name)
    private readonly model: Model<TransactionDocument>,
  ) {}

  async createMany(
    transactions: Array<Partial<TransactionEntity> & { txId: string }>,
  ): Promise<void> {
    if (transactions.length === 0) return;

    const ops = transactions.map((transaction) => ({
      updateOne: {
        filter: { txId: transaction.txId },
        update: { $set: transaction },
        upsert: true,
      },
    }));

    await this.model.bulkWrite(ops, { ordered: false });
  }

  async findByTicker(ticker: string, limit = 50): Promise<TransactionDocument[]> {
    return this.model
      .find({ ticker })
      .sort({ txTime: -1 })
      .limit(limit)
      .exec();
  }

  async findLatest(limit = 50): Promise<TransactionDocument[]> {
    return this.model.find({}).sort({ txTime: -1 }).limit(limit).exec();
  }
}
