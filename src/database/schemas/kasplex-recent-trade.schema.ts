import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'kasplex_recent_trades', timestamps: true })
export class KasplexRecentTradeDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  txId: string;

  @Prop({ required: true, index: true })
  ticker: string;

  @Prop({ required: true })
  to: string;

  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  totalPrice: number;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  accepted: boolean;

  @Prop({ required: true, index: true })
  txTime: number;
}

export const KasplexRecentTradeSchema = SchemaFactory.createForClass(
  KasplexRecentTradeDocument,
);

KasplexRecentTradeSchema.index({ ticker: 1, txTime: -1 });

export type KasplexRecentTradeEntity = KasplexRecentTradeDocument;
