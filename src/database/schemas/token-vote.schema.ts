// Mongoose schema for token votes (bullish/bearish per token per user)
// Linked to profile (userId) and wallet for convenience

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'token_votes', timestamps: true })
export class TokenVoteDocument extends Document {
  @Prop({ required: true, maxlength: 50 })
  tokenId: string;

  @Prop({ required: true, maxlength: 255 })
  walletAddress: string;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument', default: null })
  userId: Types.ObjectId | null;

  @Prop({ required: true, enum: ['bullish', 'bearish'] })
  voteType: 'bullish' | 'bearish';

  createdAt: Date;
  updatedAt: Date;
}

export const TokenVoteSchema = SchemaFactory.createForClass(TokenVoteDocument);

export type TokenVoteEntity = TokenVoteDocument;

TokenVoteSchema.index({ tokenId: 1, walletAddress: 1 }, { unique: true });
TokenVoteSchema.index({ tokenId: 1, voteType: 1 });
TokenVoteSchema.index({ userId: 1 });
