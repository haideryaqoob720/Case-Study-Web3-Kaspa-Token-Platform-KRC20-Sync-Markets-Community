// Mongoose schema for exchange_market_data_1h (hourly candles)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'exchange_tokens_candles_1h', timestamps: true })
export class ExchangeMarketData1hDocument extends Document {
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

export const ExchangeMarketData1hSchema =
  SchemaFactory.createForClass(ExchangeMarketData1hDocument);

export type ExchangeMarketData1hEntity = ExchangeMarketData1hDocument;

ExchangeMarketData1hSchema.index(
  { tokenIdentifier: 1, exchangeId: 1, date: 1 },
  { unique: true },
);
ExchangeMarketData1hSchema.index({ exchangeId: 1 });
ExchangeMarketData1hSchema.index({ date: 1 });
