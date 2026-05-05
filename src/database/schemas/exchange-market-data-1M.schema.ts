// Mongoose schema for exchange_market_data_1M (monthly candles)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'exchange_tokens_candles_1M', timestamps: true })
export class ExchangeMarketData1MDocument extends Document {
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

export const ExchangeMarketData1MSchema =
  SchemaFactory.createForClass(ExchangeMarketData1MDocument);

export type ExchangeMarketData1MEntity = ExchangeMarketData1MDocument;

ExchangeMarketData1MSchema.index(
  { tokenIdentifier: 1, exchangeId: 1, date: 1 },
  { unique: true },
);
ExchangeMarketData1MSchema.index({ exchangeId: 1 });
ExchangeMarketData1MSchema.index({ date: 1 });
