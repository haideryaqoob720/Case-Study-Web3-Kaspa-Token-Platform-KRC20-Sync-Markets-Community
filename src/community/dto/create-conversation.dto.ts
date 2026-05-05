import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    description: 'Conversation name',
    example: 'General',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Wallet address of the user creating the conversation',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;
}
