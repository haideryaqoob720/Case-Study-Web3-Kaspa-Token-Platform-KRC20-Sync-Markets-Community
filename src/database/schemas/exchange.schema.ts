// Mongoose schema for exchanges collection (replaces TypeORM ExchangeEntity)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'exchanges', timestamps: true })
export class ExchangeDocument extends Document {
  @Prop({ required: true, unique: true, maxlength: 50 })
  code: string;

  @Prop({ required: true, maxlength: 100 })
  name: string;

  @Prop({ type: String, maxlength: 255, default: null })
  logoUrl: string | null;

  @Prop({ required: true, maxlength: 255 })
  apiBaseUrl: string;

  @Prop({ maxlength: 50, default: 'USDT' })
  defaultBaseCurrency: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 200 })
  rateLimitDelayMs: number;

  @Prop({ type: Object, default: null })
  config: Record<string, unknown> | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ExchangeSchema = SchemaFactory.createForClass(ExchangeDocument);

/** Alias for use where code expects ExchangeEntity (TypeORM) */
export type ExchangeEntity = ExchangeDocument;

ExchangeSchema.index({ name: 1 });
