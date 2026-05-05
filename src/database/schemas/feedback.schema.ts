// Mongoose schema for feedback collection (replaces TypeORM FeedbackEntity)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const FEEDBACK_TYPES = [
  'bug',
  'feature',
  'improvement',
  'other',
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

@Schema({
  collection: 'feedback',
  timestamps: { createdAt: true, updatedAt: false },
})
export class FeedbackDocument extends Document {
  @Prop({ required: true, maxlength: 20 })
  type: FeedbackType;

  @Prop({ required: true, maxlength: 500 })
  title: string;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: String, maxlength: 255, default: null })
  email: string | null;

  @Prop({ type: String, maxlength: 2048, default: null })
  url: string | null;

  @Prop({ type: String, maxlength: 2048, default: null })
  imageUrl: string | null;

  @Prop({ maxlength: 20, default: 'open' })
  status: string;

  createdAt: Date;
}

export const FeedbackSchema = SchemaFactory.createForClass(FeedbackDocument);

/** Alias for use where code expects FeedbackEntity (TypeORM) */
export type FeedbackEntity = FeedbackDocument;

FeedbackSchema.index({ type: 1 });
FeedbackSchema.index({ createdAt: -1 });
