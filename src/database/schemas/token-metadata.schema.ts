// Mongoose schema for curated token metadata (ticker, website, description, image, socials)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SocialsMap = Record<string, string[]>;

@Schema({ collection: 'token_metadata', timestamps: true })
export class TokenMetadataDocument extends Document {
  @Prop({ required: true, unique: true, maxlength: 50 })
  ticker: string;

  @Prop({ type: String, maxlength: 512, default: null })
  website: string | null;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: String, maxlength: 512, default: null })
  image: string | null;

  @Prop({ type: Object, default: {} })
  socials: SocialsMap;

  createdAt: Date;
  updatedAt: Date;
}

export const TokenMetadataSchema = SchemaFactory.createForClass(
  TokenMetadataDocument,
);

export type TokenMetadataEntity = TokenMetadataDocument;
