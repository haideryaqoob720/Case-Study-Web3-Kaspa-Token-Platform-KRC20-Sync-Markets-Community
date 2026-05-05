import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

type AggregatedChartCandle = {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type AggregatedChartExchange = {
  exchangeCode: string;
  exchangeName: string;
  candles: AggregatedChartCandle[];
};

@Schema({ collection: 'aggregated_token_candles', timestamps: true })
export class AggregatedTokenCandleDocument extends Document {
  @Prop({ required: true, maxlength: 50 })
  tokenIdentifier: string;

  @Prop({ required: true, maxlength: 10 })
  interval: string;

  @Prop({ type: Array, required: true, default: [] })
  candles: AggregatedChartCandle[];

  @Prop({ type: Array, required: true, default: [] })
  byExchange: AggregatedChartExchange[];

  createdAt: Date;
  updatedAt: Date;
}

export const AggregatedTokenCandleSchema = SchemaFactory.createForClass(
  AggregatedTokenCandleDocument,
);

AggregatedTokenCandleSchema.index({ tokenIdentifier: 1, interval: 1 }, { unique: true });
AggregatedTokenCandleSchema.index({ updatedAt: -1 });
