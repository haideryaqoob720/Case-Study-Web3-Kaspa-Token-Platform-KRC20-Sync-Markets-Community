import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Types } from 'mongoose';
import { WatchlistDocument, WatchlistEntity } from '../database/schemas/watchlist.schema';

@Injectable()
export class WatchlistRepository {
  private readonly logger = new Logger(WatchlistRepository.name);

  constructor(
    @InjectModel(WatchlistDocument.name)
    private readonly watchlistModel: Model<WatchlistDocument>,
  ) {}

  async findByWallet(walletAddress: string): Promise<WatchlistEntity[]> {
    const docs = await this.watchlistModel
      .find({ walletAddress: walletAddress.trim() })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs as unknown as WatchlistEntity[];
  }

  async add(
    walletAddress: string,
    tokenId: string,
    userId: Types.ObjectId,
  ): Promise<WatchlistEntity> {
    const doc = await this.watchlistModel
      .findOneAndUpdate(
        { walletAddress: walletAddress.trim(), tokenId: tokenId.trim() },
        { $set: { userId, updatedAt: new Date() } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
    return doc as unknown as WatchlistEntity;
  }

  async remove(walletAddress: string, tokenId: string): Promise<boolean> {
    const result = await this.watchlistModel
      .deleteOne({
        walletAddress: walletAddress.trim(),
        tokenId: tokenId.trim(),
      })
      .exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async has(walletAddress: string, tokenId: string): Promise<boolean> {
    const count = await this.watchlistModel
      .countDocuments({
        walletAddress: walletAddress.trim(),
        tokenId: tokenId.trim(),
      })
      .exec();
    return count > 0;
  }

  async countByToken(tokenId: string): Promise<number> {
    return this.watchlistModel
      .countDocuments({ tokenId: tokenId.trim() })
      .exec();
  }
}
