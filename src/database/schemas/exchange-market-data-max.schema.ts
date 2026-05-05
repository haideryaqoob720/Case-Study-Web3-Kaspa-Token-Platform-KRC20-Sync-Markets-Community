// Mongoose schema for exchange_market_data_max (max history candles)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'exchange_tokens_candles_max', timestamps: true })
export class ExchangeMarketDataMaxDocument extends Document {
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

export const ExchangeMarketDataMaxSchema =
  SchemaFactory.createForClass(ExchangeMarketDataMaxDocument);

export type ExchangeMarketDataMaxEntity = ExchangeMarketDataMaxDocument;

ExchangeMarketDataMaxSchema.index(
  { tokenIdentifier: 1, exchangeId: 1, date: 1 },
  { unique: true },
);
ExchangeMarketDataMaxSchema.index({ exchangeId: 1 });
ExchangeMarketDataMaxSchema.index({ date: 1 });
