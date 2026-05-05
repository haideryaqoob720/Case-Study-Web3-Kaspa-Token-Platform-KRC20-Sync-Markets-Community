// Mongoose schema for exchange_klines_sync_state (per-interval last success per pair)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'exchange_klines_sync_state', timestamps: true })
export class ExchangeKlinesSyncStateDocument extends Document {
  @Prop({ required: true, maxlength: 50 })
  tokenIdentifier: string;

  @Prop({ required: true })
  exchangeId: string;

  @Prop({ required: true, maxlength: 10 })
  interval: string;

  @Prop({ type: Date, default: null })
  lastSuccessAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ExchangeKlinesSyncStateSchema = SchemaFactory.createForClass(
  ExchangeKlinesSyncStateDocument,
);

ExchangeKlinesSyncStateSchema.index(
  { tokenIdentifier: 1, exchangeId: 1, interval: 1 },
  { unique: true },
);
ExchangeKlinesSyncStateSchema.index({ interval: 1, lastSuccessAt: 1 });
