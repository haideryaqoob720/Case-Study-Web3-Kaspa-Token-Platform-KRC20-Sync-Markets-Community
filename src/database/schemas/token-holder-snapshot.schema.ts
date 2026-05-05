// Mongoose schema for token_holder_snapshots (replaces TypeORM TokenHolderSnapshot)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'token_holder_snapshots', timestamps: true })
export class TokenHolderSnapshotDocument extends Document {
  @Prop({ required: true, maxlength: 50, uppercase: true })
  ticker: string;

  @Prop({ required: true })
  snapshotTimestamp: Date;

  @Prop({ required: true })
  holderTotal: number;

  @Prop({ type: Number, default: null })
  transferTotal: number | null;

  @Prop({ type: Number, default: null })
  mintTotal: number | null;

  @Prop({ type: Number, default: null })
  top10Percentage: number | null;

  @Prop({ type: Number, default: null })
  top20Percentage: number | null;

  @Prop({ type: Number, default: null })
  top50Percentage: number | null;

  createdAt: Date;
  updatedAt: Date;
}

export const TokenHolderSnapshotSchema = SchemaFactory.createForClass(
  TokenHolderSnapshotDocument,
);

export type TokenHolderSnapshot = TokenHolderSnapshotDocument;

TokenHolderSnapshotSchema.index(
  { ticker: 1, snapshotTimestamp: 1 },
  { unique: true },
);

TokenHolderSnapshotSchema.index({ snapshotTimestamp: -1 });
