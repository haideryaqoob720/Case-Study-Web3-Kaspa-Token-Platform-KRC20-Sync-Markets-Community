import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackEntity } from '../../database/schemas/feedback.schema';

export class FeedbackItemDto {
  @ApiProperty({ description: 'Unique feedback ID', example: 'uuid' })
  id: string;

  @ApiProperty({
    description: 'Feedback type',
    enum: ['bug', 'feature', 'improvement', 'other'],
  })
  type: string;

  @ApiProperty({ description: 'Feedback title' })
  title: string;

  @ApiPropertyOptional({ description: 'Detailed description', nullable: true })
  description: string | null;

  @ApiPropertyOptional({ description: 'Contact email', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ description: 'Related page URL', nullable: true })
  url: string | null;

  @ApiPropertyOptional({ description: 'Optional feedback screenshot URL', nullable: true })
  imageUrl: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

export class GetFeedbackResponseDto {
  @ApiProperty({
    type: [FeedbackItemDto],
    description: 'List of feedback items',
  })
  data: FeedbackItemDto[];

  @ApiProperty({ description: 'Total count of feedback matching the query' })
  total: number;

  @ApiProperty({ description: 'Current page (1-based)' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;
}

export class CreateFeedbackResponseDto {
  @ApiProperty({ description: 'Success flag' })
  success: boolean;

  @ApiProperty({ description: 'Message' })
  message: string;

  @ApiProperty({ type: FeedbackItemDto, description: 'Created feedback' })
  data: FeedbackItemDto;
}

function toFeedbackItemDto(entity: FeedbackEntity): FeedbackItemDto {
  const id = (entity as any).id ?? String((entity as any)._id ?? '');
  return {
    id,
    type: entity.type,
    title: entity.title,
    description: entity.description ?? null,
    email: entity.email ?? null,
    url: entity.url ?? null,
    imageUrl: entity.imageUrl ?? null,
    createdAt: entity.createdAt,
  };
}

export function fromEntity(entity: FeedbackEntity): FeedbackItemDto {
  return toFeedbackItemDto(entity);
}

export function fromEntities(entities: FeedbackEntity[]): FeedbackItemDto[] {
  return entities.map(toFeedbackItemDto);
}
