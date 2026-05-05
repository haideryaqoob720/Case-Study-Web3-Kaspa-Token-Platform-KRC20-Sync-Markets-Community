import {
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FEEDBACK_TYPES } from '../../database/entities/feedback.entity';

export class CreateFeedbackDto {
  @ApiProperty({
    description: 'Type of feedback',
    enum: FEEDBACK_TYPES,
    example: 'bug',
  })
  @IsString()
  @IsIn(FEEDBACK_TYPES)
  type: (typeof FEEDBACK_TYPES)[number];

  @ApiProperty({
    description: 'Brief summary of the feedback (min 3 characters)',
    minLength: 3,
    maxLength: 500,
    example: 'Login button does not respond on mobile',
  })
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters' })
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({
    description:
      'Detailed description, steps to reproduce, or additional context',
    example: 'When I tap the login button on iOS Safari, nothing happens.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Contact email for follow-up',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsString()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'URL of the page this feedback relates to',
    example: 'https://example.com/dashboard',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;
}
