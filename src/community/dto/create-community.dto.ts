import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateCommunityDto {
  @ApiProperty({
    description: 'Community name',
    example: 'Kaspa Memes',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Community description',
    example: 'A place for Kaspa meme lovers',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Wallet address of the user creating the community',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;
}
