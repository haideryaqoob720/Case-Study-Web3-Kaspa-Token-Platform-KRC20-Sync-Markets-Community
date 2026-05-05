import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'conversations', timestamps: true })
export class ConversationDocument extends Document {
  @Prop({ required: true, enum: ['direct', 'group'] })
  type: 'direct' | 'group';

  @Prop({ type: [String], required: true })
  participants: string[];

  @Prop({ type: String, default: null })
  name: string | null;

  @Prop({ type: String, required: true })
  createdBy: string;

  @Prop({ type: Types.ObjectId, ref: 'CommunityDocument', default: null })
  communityId: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(ConversationDocument);

export type ConversationEntity = ConversationDocument;

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ type: 1, participants: 1 });
ConversationSchema.index({ communityId: 1 });

