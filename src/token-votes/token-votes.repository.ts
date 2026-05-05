// Token votes repository: find/upsert by tokenId + walletAddress

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Types } from 'mongoose';
import { TokenVoteDocument, TokenVoteEntity } from '../database/schemas/token-vote.schema';

@Injectable()
export class TokenVotesRepository {
  private readonly logger = new Logger(TokenVotesRepository.name);

  constructor(
    @InjectModel(TokenVoteDocument.name)
    private readonly tokenVoteModel: Model<TokenVoteDocument>,
  ) {}

  async findByTokenAndWallet(
    tokenId: string,
    walletAddress: string,
  ): Promise<TokenVoteEntity | null> {
    const doc = await this.tokenVoteModel
      .findOne({ tokenId, walletAddress })
      .lean()
      .exec();
    return doc ? (doc as unknown as TokenVoteEntity) : null;
  }

  async upsert(
    tokenId: string,
    walletAddress: string,
    userId: Types.ObjectId,
    voteType: 'bullish' | 'bearish',
  ): Promise<TokenVoteEntity> {
    const doc = await this.tokenVoteModel
      .findOneAndUpdate(
        { tokenId, walletAddress },
        { $set: { voteType, userId, updatedAt: new Date() } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
    return doc as unknown as TokenVoteEntity;
  }

  async create(
    tokenId: string,
    walletAddress: string,
    voteType: 'bullish' | 'bearish',
  ): Promise<TokenVoteEntity> {
    const created = await this.tokenVoteModel.create({
      tokenId,
      walletAddress,
      voteType,
    });
    return created.toObject ? created.toObject() : (created as TokenVoteEntity);
  }

  async updateVote(
    tokenId: string,
    walletAddress: string,
    userId: Types.ObjectId,
    voteType: 'bullish' | 'bearish',
  ): Promise<TokenVoteEntity> {
    const doc = await this.tokenVoteModel
      .findOneAndUpdate(
        { tokenId, walletAddress },
        { $set: { voteType, userId, updatedAt: new Date() } },
        { new: true },
      )
      .lean()
      .exec();
    return doc as unknown as TokenVoteEntity;
  }

  async countByTokenAndType(
    tokenId: string,
    voteType: 'bullish' | 'bearish',
  ): Promise<number> {
    return this.tokenVoteModel.countDocuments({ tokenId, voteType }).exec();
  }

  async findByWallet(walletAddress: string): Promise<TokenVoteEntity[]> {
    const docs = await this.tokenVoteModel
      .find({ walletAddress: walletAddress.trim() })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs as unknown as TokenVoteEntity[];
  }
}
