import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    description: 'Message text content',
    example: 'Hello, how are you?',
  })
  @IsString()
  text: string;

  @ApiPropertyOptional({
    description: 'Array of wallet addresses to tag',
    type: [String],
    default: [],
    example: ['kaspa:qz...'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Wallet address of the user sending the message',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;
}

