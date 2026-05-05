// Mongoose schema for token watchlist/favorites – linked to profile (userId) and wallet

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'watchlist', timestamps: true })
export class WatchlistDocument extends Document {
  @Prop({ required: true, maxlength: 255 })
  walletAddress: string;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument', default: null })
  userId: Types.ObjectId | null;

  @Prop({ required: true, maxlength: 50 })
  tokenId: string;

  createdAt: Date;
  updatedAt: Date;
}

export const WatchlistSchema = SchemaFactory.createForClass(WatchlistDocument);

export type WatchlistEntity = WatchlistDocument;

WatchlistSchema.index({ walletAddress: 1, tokenId: 1 }, { unique: true });
WatchlistSchema.index({ userId: 1 });
