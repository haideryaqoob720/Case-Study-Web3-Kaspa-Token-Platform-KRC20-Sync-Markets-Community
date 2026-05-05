// Mongoose schema for exchange_tokens_candles_1d (daily candles)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'exchange_tokens_candles_1d', timestamps: true })
export class ExchangeMarketData1dDocument extends Document {
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

export const ExchangeMarketData1dSchema =
  SchemaFactory.createForClass(ExchangeMarketData1dDocument);

export type ExchangeMarketData1dEntity = ExchangeMarketData1dDocument;

ExchangeMarketData1dSchema.index(
  { tokenIdentifier: 1, exchangeId: 1, date: 1 },
  { unique: true },
);
ExchangeMarketData1dSchema.index({ exchangeId: 1 });
ExchangeMarketData1dSchema.index({ date: 1 });
