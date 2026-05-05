import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TokenMetadataDocument,
  TokenMetadataEntity,
} from '../database/schemas/token-metadata.schema';

export interface TokenMetadataInput {
  ticker: string;
  website?: string | null;
  description?: string | null;
  image?: string | null;
  socials?: Record<string, string[]>;
}

@Injectable()
export class TokenMetadataRepository {
  constructor(
    @InjectModel(TokenMetadataDocument.name)
    private readonly model: Model<TokenMetadataDocument>,
  ) {}

  async findAll(): Promise<TokenMetadataEntity[]> {
    const docs = await this.model.find().sort({ ticker: 1 }).lean().exec();
    return docs as unknown as TokenMetadataEntity[];
  }

  async bulkUpsert(
    items: TokenMetadataInput[],
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    for (const item of items) {
      const ticker = (item.ticker || '').trim();
      if (!ticker) continue;
      const result = await this.model
        .updateOne(
          { ticker },
          {
            $set: {
              ticker,
              website: item.website ?? null,
              description: item.description ?? null,
              image: item.image ?? null,
              socials: item.socials ?? {},
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        )
        .exec();
      if (result.upsertedCount) inserted += 1;
      else if (result.modifiedCount) updated += 1;
    }
    return { inserted, updated };
  }
}
