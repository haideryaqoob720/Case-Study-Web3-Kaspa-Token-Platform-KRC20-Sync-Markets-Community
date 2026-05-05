// Token Info Repository: MongoDB operations via Mongoose
// What: Find by ticker, upsert token info from Kasplex API

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TokenInfoDocument,
  TokenInfoEntity,
} from '../database/schemas/token-info.schema';

@Injectable()
export class TokenInfoRepository {
  private readonly logger = new Logger(TokenInfoRepository.name);

  constructor(
    @InjectModel(TokenInfoDocument.name)
    private model: Model<TokenInfoDocument>,
  ) {}

  async findByTicker(ticker: string): Promise<TokenInfoEntity | null> {
    if (!ticker || ticker.trim().length === 0) {
      return null;
    }
    const doc = await this.model
      .findOne({ ticker: ticker.trim() })
      .lean()
      .exec();
    return doc as TokenInfoEntity | null;
  }

  async upsertTokenInfo(
    ticker: string,
    responseJson: Record<string, unknown>,
    name: string | null = null,
    identifier: string | null = null,
  ): Promise<void> {
    if (!ticker || ticker.trim().length === 0) {
      this.logger.warn('Cannot upsert token info: ticker is empty');
      return;
    }

    try {
      await this.model
        .updateOne(
          { ticker: ticker.trim() },
          {
            $set: {
              ticker: ticker.trim(),
              response_json: responseJson,
              name: name ?? null,
              identifier: identifier ?? ticker.trim(),
              updated_at: new Date(),
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      this.logger.error(
        `Error upserting token info for ${ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
