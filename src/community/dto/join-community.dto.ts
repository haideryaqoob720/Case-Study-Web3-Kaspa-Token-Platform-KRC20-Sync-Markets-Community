import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class JoinCommunityDto {
  @ApiProperty({
    description: 'Wallet address of the user joining the community',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;
}
