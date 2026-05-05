import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FeedbackDocument,
  FeedbackSchema,
} from '../database/schemas/feedback.schema';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackRepository } from './feedback.repository';
import { CloudinaryService } from '../config/cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FeedbackDocument.name, schema: FeedbackSchema },
    ]),
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackRepository, CloudinaryService],
  exports: [FeedbackService, FeedbackRepository],
})
export class FeedbackModule {}
