import { IsIn, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitVoteDto {
  @ApiProperty({ example: 'bullish', enum: ['bullish', 'bearish'] })
  @IsIn(['bullish', 'bearish'])
  voteType: 'bullish' | 'bearish';

  @ApiProperty({ example: 'kaspa:qz...', description: 'Connected wallet address' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  walletAddress: string;
}
