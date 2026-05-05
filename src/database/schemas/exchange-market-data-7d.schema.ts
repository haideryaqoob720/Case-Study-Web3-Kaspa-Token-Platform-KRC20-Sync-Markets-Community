// Mongoose schema for exchange_market_data_7d (replaces TypeORM ExchangeMarketData7dEntity)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'exchange_tokens_candles_7d', timestamps: true })
export class ExchangeMarketData7dDocument extends Document {
  @Prop({ required: true, maxlength: 50 })
  tokenIdentifier: string;

  @Prop({ required: true })
  exchangeId: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  open: string;

  @Prop({ required: true })
  high: string;

  @Prop({ required: true })
  low: string;

  @Prop({ required: true })
  close: string;

  @Prop({ required: true })
  volume: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ExchangeMarketData7dSchema = SchemaFactory.createForClass(
  ExchangeMarketData7dDocument,
);

/** Alias for use where code expects ExchangeMarketData7dEntity (TypeORM) */
export type ExchangeMarketData7dEntity = ExchangeMarketData7dDocument;

ExchangeMarketData7dSchema.index(
  { tokenIdentifier: 1, exchangeId: 1, date: 1 },
  { unique: true },
);
ExchangeMarketData7dSchema.index({ exchangeId: 1 });
ExchangeMarketData7dSchema.index({ date: 1 });
