import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Stored KRC20 oplist rows; query by tick and/or wallet via `from` / `to`. */
@Schema({ collection: 'krc20_ops', timestamps: true })
export class Krc20OpDocument extends Document {
  @Prop({ required: true })
  tick: string;

  @Prop({ required: true, index: true })
  hashRev: string;

  @Prop({ required: true })
  op: string;

  @Prop({ required: true, index: true })
  from: string;

  @Prop({ required: true, index: true })
  to: string;

  @Prop({ required: true })
  amt: string;

  @Prop()
  price?: string;

  @Prop({ required: true, index: true })
  mtsAdd: number;

  @Prop()
  txAccept?: string;

  @Prop()
  opAccept?: string;

  @Prop({ required: true, unique: true })
  dedupeKey: string;
}

export const Krc20OpSchema = SchemaFactory.createForClass(Krc20OpDocument);

Krc20OpSchema.index({ tick: 1, from: 1, mtsAdd: -1 });
Krc20OpSchema.index({ tick: 1, to: 1, mtsAdd: -1 });
Krc20OpSchema.index({ tick: 1, mtsAdd: -1, hashRev: -1 });

export type Krc20OpEntity = Krc20OpDocument;
