// Minimal user/profile schema – linked by wallet; more fields can be added later

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'users', timestamps: true })
export class UserDocument extends Document {
  @Prop({ required: true, unique: true, maxlength: 255 })
  walletAddress: string;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserDocument);

export type UserEntity = UserDocument;
