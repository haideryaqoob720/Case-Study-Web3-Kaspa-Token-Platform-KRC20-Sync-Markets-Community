import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'community_members', timestamps: false })
export class CommunityMemberDocument extends Document {
  @Prop({ type: Types.ObjectId, ref: 'CommunityDocument', required: true })
  communityId: Types.ObjectId;

  @Prop({ required: true })
  walletAddress: string;

  @Prop({ enum: ['owner', 'admin', 'member'], default: 'member' })
  role: 'owner' | 'admin' | 'member';

  @Prop({ default: false })
  canCreateConversations: boolean;

  @Prop({ default: Date.now })
  joinedAt: Date;
}

export const CommunityMemberSchema = SchemaFactory.createForClass(CommunityMemberDocument);

export type CommunityMemberEntity = CommunityMemberDocument;

CommunityMemberSchema.index({ communityId: 1, walletAddress: 1 }, { unique: true });
