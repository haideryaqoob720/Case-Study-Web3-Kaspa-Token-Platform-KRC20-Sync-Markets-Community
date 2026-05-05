import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeleteMessageDto {
  @ApiProperty({
    description: 'Wallet address of the user deleting the message',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;
}
