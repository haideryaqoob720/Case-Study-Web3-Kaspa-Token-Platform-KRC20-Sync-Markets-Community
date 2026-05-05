import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'recent_trades', timestamps: false })
export class RecentTradeDocument extends Document {
  @Prop({ required: true })
  exchangeCode: string;

  @Prop({ required: true })
  exchangeSymbol: string;

  @Prop({ required: true, index: true })
  tokenIdentifier: string;

  @Prop({ required: true })
  exchangeTradeId: string;

  @Prop({ required: true })
  timestamp: number; // ms (index added below via schema.index to avoid duplicate)

  @Prop({ required: true, enum: ['buy', 'sell'] })
  side: string;

  @Prop({ required: true })
  price: string;

  @Prop({ required: true })
  amount: string;

  @Prop()
  quoteVolume?: string;
}

export const RecentTradeSchema = SchemaFactory.createForClass(RecentTradeDocument);

RecentTradeSchema.index(
  { exchangeCode: 1, exchangeSymbol: 1, exchangeTradeId: 1 },
  { unique: true },
);
RecentTradeSchema.index({ timestamp: 1 });

export type RecentTradeEntity = RecentTradeDocument;
