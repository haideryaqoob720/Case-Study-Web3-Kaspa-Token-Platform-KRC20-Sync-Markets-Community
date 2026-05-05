import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { FeedbackRepository } from './feedback.repository';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import {
  GetFeedbackResponseDto,
  CreateFeedbackResponseDto,
  fromEntity,
  fromEntities,
} from './dto/feedback-response.dto';
import { CloudinaryService, UploadImageFile } from '../config/cloudinary.service';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(
    dto: CreateFeedbackDto,
    imageFile?: UploadImageFile,
  ): Promise<CreateFeedbackResponseDto> {
    let imageUrl: string | null = null;
    if (imageFile) {
      try {
        imageUrl = await this.cloudinaryService.uploadImage(imageFile, {
          folder: 'feedback_screenshots',
        });
      } catch (error) {
        this.logger.error(
          `Feedback image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        throw new UnprocessableEntityException(
          'Unable to upload screenshot right now. Please try again.',
        );
      }
    }

    const entity = await this.feedbackRepository.create({
      type: dto.type,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? null,
      email: dto.email?.trim() ?? null,
      url: dto.url?.trim() ?? null,
      imageUrl,
      status: 'open',
    });
    this.logger.log(`Feedback created: ${entity.id} (type: ${entity.type})`);
    return {
      success: true,
      message: 'Feedback submitted successfully',
      data: fromEntity(entity),
    };
  }

  async findAll(query: GetFeedbackQueryDto): Promise<GetFeedbackResponseDto> {
    const { page = 1, limit = 20, type } = query;
    const { data, total } = await this.feedbackRepository.findAll({
      page,
      limit,
      type,
    });
    return {
      data: fromEntities(data),
      total,
      page,
      limit,
    };
  }
}
