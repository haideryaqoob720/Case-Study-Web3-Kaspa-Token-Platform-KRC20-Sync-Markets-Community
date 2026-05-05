import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsArray, IsString, IsOptional } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    description: 'Type of conversation',
    enum: ['direct', 'group'],
    example: 'direct',
  })
  @IsEnum(['direct', 'group'])
  type: 'direct' | 'group';

  @ApiProperty({
    description: 'Array of wallet addresses',
    type: [String],
    example: ['kaspa:qz...', 'kaspa:qr...'],
  })
  @IsArray()
  @IsString({ each: true })
  participants: string[];

  @ApiPropertyOptional({
    description: 'Group name (required when type is group)',
    example: 'Team Chat',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Wallet address of the user creating the conversation',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;
}

