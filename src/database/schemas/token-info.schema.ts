// Mongoose schema for token_info (replaces TypeORM TokenInfoEntity)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'token_info', timestamps: false })
export class TokenInfoDocument extends Document {
  @Prop({ required: true, unique: true, maxlength: 50 })
  ticker: string;

  @Prop({ type: String, maxlength: 255, default: null })
  name: string | null;

  @Prop({ type: Object, required: true })
  response_json: Record<string, unknown>;

  @Prop({ required: true, maxlength: 50 })
  identifier: string;

  updated_at: Date;
}

export const TokenInfoSchema = SchemaFactory.createForClass(TokenInfoDocument);

/** Alias for use where code expects TokenInfoEntity (TypeORM) */
export type TokenInfoEntity = TokenInfoDocument;

TokenInfoSchema.index({ name: 1 });
TokenInfoSchema.index({ identifier: 1 });
TokenInfoSchema.index({ updated_at: 1 });
