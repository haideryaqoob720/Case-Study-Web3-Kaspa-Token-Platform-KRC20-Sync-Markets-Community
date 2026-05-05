import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateConversationDto {
  @ApiProperty({
    description: 'Wallet address of the user updating the conversation',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;

  @ApiProperty({
    description: 'New conversation name',
    example: 'Updated Group Name',
  })
  @IsString()
  name: string;
}

