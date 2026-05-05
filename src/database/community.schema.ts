import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'communities', timestamps: true })
export class CommunityDocument extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ required: true })
  createdByWallet: string;

  createdAt: Date;
  updatedAt: Date;
}

export const CommunitySchema = SchemaFactory.createForClass(CommunityDocument);

export type CommunityEntity = CommunityDocument;
