import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'messages', timestamps: true })
export class MessageDocument extends Document {
  @Prop({ type: Types.ObjectId, ref: 'ConversationDocument', required: true })
  conversationId: Types.ObjectId;

  @Prop({ type: String, required: true })
  authorId: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  createdAt: Date;
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(MessageDocument);

export type MessageEntity = MessageDocument;

MessageSchema.index({ conversationId: 1, createdAt: -1 });

