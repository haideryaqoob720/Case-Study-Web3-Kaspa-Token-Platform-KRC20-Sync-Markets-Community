import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateCommunityDto {
  @ApiProperty({
    description: 'Wallet address of the user updating the community',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;

  @ApiPropertyOptional({
    description: 'New community name',
    example: 'Kaspa Memes Updated',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'New community description',
    example: 'Updated description',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
