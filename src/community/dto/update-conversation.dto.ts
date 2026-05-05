import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateConversationDto {
  @ApiProperty({
    description: 'New conversation name',
    example: 'General Chat',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Wallet address of the user updating the conversation',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;
}
