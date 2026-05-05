// Mongoose schema for exchange_sync_log (replaces TypeORM ExchangeSyncLogEntity)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  collection: 'exchange_sync_log',
  timestamps: { createdAt: true, updatedAt: false },
})
export class ExchangeSyncLogDocument extends Document {
  @Prop({ required: true })
  exchangeId: string;

  @Prop({ required: true, maxlength: 20 })
  syncType: string;

  @Prop({ maxlength: 20, default: 'running' })
  status: string;

  @Prop({ default: 0 })
  totalPairs: number;

  @Prop({ default: 0 })
  processedPairs: number;

  @Prop({ default: 0 })
  failedPairs: number;

  @Prop({ type: String, default: null })
  errorMessage: string | null;

  @Prop({ type: Number, default: null })
  durationSeconds: number | null;

  createdAt: Date;
}

export const ExchangeSyncLogSchema = SchemaFactory.createForClass(
  ExchangeSyncLogDocument,
);

/** Alias for use where code expects ExchangeSyncLogEntity (TypeORM) */
export type ExchangeSyncLogEntity = ExchangeSyncLogDocument;

/** Keep sync logs for 30 days, then expire automatically via MongoDB TTL. */
const EXCHANGE_SYNC_LOG_RETENTION_SECONDS = 30 * 24 * 60 * 60;

ExchangeSyncLogSchema.index({ exchangeId: 1 });
ExchangeSyncLogSchema.index({ syncType: 1 });
ExchangeSyncLogSchema.index({ status: 1 });
ExchangeSyncLogSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: EXCHANGE_SYNC_LOG_RETENTION_SECONDS,
    name: 'IDX_exchange_sync_log_created_at_ttl',
  },
);
