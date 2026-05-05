import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    description: 'Message text content',
    example: 'Hello everyone!',
  })
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Wallet address of the user sending the message',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;

  @ApiPropertyOptional({
    description: 'Array of tags',
    type: [String],
    example: ['announcement'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
