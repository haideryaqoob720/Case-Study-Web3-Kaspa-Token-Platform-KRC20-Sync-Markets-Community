import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'transactions', timestamps: true })
export class TransactionDocument extends Document {
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

  @Prop({ required: true, default: false })
  accepted: boolean;

  @Prop({ required: true, index: true })
  txTime: number;
}

export const TransactionSchema =
  SchemaFactory.createForClass(TransactionDocument);

TransactionSchema.index({ ticker: 1 });
TransactionSchema.index({ txTime: -1 });

export type TransactionEntity = TransactionDocument;
