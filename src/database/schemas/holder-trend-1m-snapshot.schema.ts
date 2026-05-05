import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'holder_trend_1m_snapshots', timestamps: true })
export class HolderTrend1mSnapshotDocument extends Document {
  @Prop({ required: true, maxlength: 50, uppercase: true })
  ticker: string;

  @Prop({ required: true })
  bucketStart: Date;

  @Prop({ required: true })
  holders: number;

  @Prop({ required: true })
  top10: number;

  @Prop({ required: true })
  top20: number;

  @Prop({ required: true })
  top50: number;

  @Prop({ type: Number, default: 0 })
  top10Delta: number;

  @Prop({ type: Number, default: 0 })
  top20Delta: number;

  @Prop({ type: Number, default: 0 })
  top50Delta: number;

  createdAt: Date;
  updatedAt: Date;
}

export const HolderTrend1mSnapshotSchema = SchemaFactory.createForClass(
  HolderTrend1mSnapshotDocument,
);

HolderTrend1mSnapshotSchema.index({ ticker: 1, bucketStart: 1 }, { unique: true });
HolderTrend1mSnapshotSchema.index({ ticker: 1, bucketStart: -1 });
HolderTrend1mSnapshotSchema.index(
  { bucketStart: 1 },
  { expireAfterSeconds: 48 * 60 * 60 },
);

