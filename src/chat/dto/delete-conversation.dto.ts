import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeleteConversationDto {
  @ApiProperty({
    description: 'Wallet address of the user deleting the conversation',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;
}

