// Mongoose schema for token_exchanges (replaces TypeORM TokenExchangeEntity)
// References exchanges by _id (ObjectId)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'token_exchanges', timestamps: true })
export class TokenExchangeDocument extends Document {
  @Prop({ required: true, maxlength: 50 })
  tokenIdentifier: string;

  /** Exchange _id as string (hex) for compatibility with code comparing exchangeId === exchange.id */
  @Prop({ required: true })
  exchangeId: string;

  @Prop({ required: true, maxlength: 50 })
  exchangeSymbol: string;

  @Prop({ maxlength: 10, default: 'USDT' })
  baseCurrency: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  verifiedAt: Date | null;

  @Prop({ type: Date, default: null })
  lastSyncedAt: Date | null;

  @Prop({ default: 0 })
  failureCount: number;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  lastSuccessAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const TokenExchangeSchema = SchemaFactory.createForClass(
  TokenExchangeDocument,
);

/** Alias for use where code expects TokenExchangeEntity (TypeORM) */
export type TokenExchangeEntity = TokenExchangeDocument;

TokenExchangeSchema.index(
  { tokenIdentifier: 1, exchangeId: 1 },
  { unique: true },
);
TokenExchangeSchema.index({ exchangeId: 1 });
TokenExchangeSchema.index({ isActive: 1 });
