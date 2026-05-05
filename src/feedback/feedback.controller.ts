import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import {
  GetFeedbackResponseDto,
  CreateFeedbackResponseDto,
} from './dto/feedback-response.dto';
import type { UploadImageFile } from '../config/cloudinary.service';

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}
  private readonly maxImageSizeBytes = 5 * 1024 * 1024;
  private readonly allowedImageMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: 'Submit feedback',
    description:
      'Submit a bug report, feature request, improvement, or other feedback. Matches the UI form (type, title, description, email, url).',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bug', 'feature', 'improvement', 'other'] },
        title: { type: 'string', minLength: 3, maxLength: 500 },
        description: { type: 'string' },
        email: { type: 'string' },
        url: { type: 'string' },
        image: { type: 'string', format: 'binary' },
      },
      required: ['type', 'title'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Feedback submitted successfully',
    type: CreateFeedbackResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (e.g. invalid type, title too short)',
  })
  async create(
    @Body() dto: CreateFeedbackDto,
    @UploadedFile() image?: UploadImageFile,
  ): Promise<CreateFeedbackResponseDto> {
    if (image) {
      if (!this.allowedImageMimeTypes.has(image.mimetype)) {
        throw new BadRequestException('Only image files are allowed');
      }
      if (image.size > this.maxImageSizeBytes) {
        throw new BadRequestException('Image file size must be 5MB or smaller');
      }
    }
    return this.feedbackService.create(dto, image);
  }

  @Get()
  @ApiOperation({
    summary: 'List feedback',
    description:
      'Get a paginated list of feedback with optional filter by type.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['bug', 'feature', 'improvement', 'other'],
    description: 'Filter by feedback type',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of feedback',
    type: GetFeedbackResponseDto,
  })
  async findAll(
    @Query() query: GetFeedbackQueryDto,
  ): Promise<GetFeedbackResponseDto> {
    return this.feedbackService.findAll(query);
  }
}
