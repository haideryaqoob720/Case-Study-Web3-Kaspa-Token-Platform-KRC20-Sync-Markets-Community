import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument, UserEntity } from '../database/schemas/user.schema';

@Injectable()
export class UsersRepository {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(
    @InjectModel(UserDocument.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findByWallet(walletAddress: string): Promise<UserEntity | null> {
    const doc = await this.userModel
      .findOne({ walletAddress: walletAddress.trim() })
      .lean()
      .exec();
    return doc ? (doc as unknown as UserEntity) : null;
  }

  async create(walletAddress: string): Promise<UserEntity> {
    const created = await this.userModel.create({
      walletAddress: walletAddress.trim(),
    });
    return created.toObject ? created.toObject() : (created as unknown as UserEntity);
  }

  async findOrCreateByWallet(walletAddress: string): Promise<UserEntity> {
    const trimmed = walletAddress.trim();
    const existing = await this.findByWallet(trimmed);
    if (existing) return existing;
    return this.create(trimmed);
  }
}
