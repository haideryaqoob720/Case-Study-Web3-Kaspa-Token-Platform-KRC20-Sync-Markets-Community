// Mongoose schema for exchange_market_data_24h (replaces TypeORM ExchangeMarketData24hEntity)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'exchange_market_data_24h', timestamps: true })
export class ExchangeMarketData24hDocument extends Document {
  @Prop({ required: true, maxlength: 50 })
  tokenIdentifier: string;

  @Prop({ required: true })
  exchangeId: string;

  @Prop({ required: true })
  price: string;

  @Prop({ required: true })
  volume24h: string;

  @Prop({ required: true })
  change24h: string;

  @Prop({ required: true })
  high24h: string;

  @Prop({ required: true })
  low24h: string;

  @Prop({ required: true })
  open24h: string;

  @Prop({ required: true })
  close24h: string;

  @Prop({ required: true })
  lastUpdated: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ExchangeMarketData24hSchema = SchemaFactory.createForClass(
  ExchangeMarketData24hDocument,
);

/** Alias for use where code expects ExchangeMarketData24hEntity (TypeORM) */
export type ExchangeMarketData24hEntity = ExchangeMarketData24hDocument;

ExchangeMarketData24hSchema.index(
  { tokenIdentifier: 1, exchangeId: 1 },
  { unique: true },
);
ExchangeMarketData24hSchema.index({ exchangeId: 1 });
ExchangeMarketData24hSchema.index({ lastUpdated: 1 });
