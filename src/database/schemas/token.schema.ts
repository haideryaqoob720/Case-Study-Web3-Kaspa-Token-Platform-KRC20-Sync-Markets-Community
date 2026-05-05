// Mongoose schema for tokens collection (replaces TypeORM TokenEntity)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'tokens', timestamps: true })
export class TokenDocument extends Document {
  @Prop({ required: true, unique: true, maxlength: 50 })
  ticker: string;

  @Prop({ type: String, maxlength: 255, default: null })
  name: string | null;

  @Prop({ required: true, unique: true, maxlength: 50 })
  identifier: string;

  @Prop({ required: true, maxlength: 50, default: '0' })
  maxSupply: string;

  @Prop({ required: true, maxlength: 50, default: '0' })
  minted: string;

  @Prop({ maxlength: 50, default: '0' })
  burned: string;

  @Prop({ default: 0 })
  holderCount: number;

  @Prop({ default: 0 })
  mintCount: number;

  @Prop({ maxlength: 50, default: '0' })
  preAllocated: string;

  @Prop({ maxlength: 20, default: 'active' })
  state: string;

  @Prop({ maxlength: 10, default: '8' })
  decimal: string;

  @Prop({ maxlength: 20, default: 'mint' })
  Deploymentmode: string;

  @Prop({ required: true, maxlength: 255 })
  to: string;

  @Prop({ required: true })
  mtsAdd: number;

  @Prop({ type: String, maxlength: 50, default: null })
  MintLimit: string | null;

  @Prop({ type: String, maxlength: 50, default: null })
  opScoreAdd: string | null;

  @Prop({ type: String, maxlength: 50, default: null })
  opScoreMod: string | null;

  @Prop({ type: String, maxlength: 255, default: null })
  hashRev: string | null;

  @Prop({ type: String, maxlength: 255, default: null })
  ContractAddress: string | null;

  @Prop({ type: String, default: null })
  logo_url: string | null;

  @Prop({ type: String, maxlength: 20, default: null })
  logo_status: string | null;

  @Prop({ type: Number, default: null })
  rank: number | null;

  /** market_cap = ranked by verified mcap; fallback = stable order when no eligible mcap */
  @Prop({ type: String, default: null })
  rankBasis: 'market_cap' | 'fallback' | null;

  @Prop({ type: String, default: null })
  floorPriceUsd: string | null;

  @Prop({ type: String, default: null })
  floorPriceKas: string | null;

  @Prop({ type: Number, default: null })
  floorPriceListingCount: number | null;

  @Prop({ type: Date, default: null })
  floorPriceUpdatedAt: Date | null;

  @Prop({
    type: String,
    enum: ['exchange', 'kasplex_marketplace', 'none'],
    default: 'none',
  })
  priceSource: string;

  createdAt: Date;
  updatedAt: Date;
}

export const TokenSchema = SchemaFactory.createForClass(TokenDocument);

/** Alias for use where code expects TokenEntity (TypeORM) */
export type TokenEntity = TokenDocument;

TokenSchema.index({ name: 1 });
TokenSchema.index({ holderCount: 1 });
TokenSchema.index({ mtsAdd: 1 });
TokenSchema.index({ rank: 1 });
