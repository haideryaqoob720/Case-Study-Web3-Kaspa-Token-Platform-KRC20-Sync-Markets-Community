import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class UpdateMemberDto {
  @ApiProperty({
    description: 'Wallet address of the requester (admin/owner)',
    example: 'kaspa:qz...',
  })
  @IsString()
  walletAddress: string;

  @ApiProperty({
    description: 'Wallet address of the member to update',
    example: 'kaspa:qr...',
  })
  @IsString()
  targetWallet: string;

  @ApiPropertyOptional({
    description: 'New role for the member',
    enum: ['owner', 'admin', 'member'],
    example: 'admin',
  })
  @IsOptional()
  @IsEnum(['owner', 'admin', 'member'])
  role?: 'owner' | 'admin' | 'member';

  @ApiPropertyOptional({
    description: 'Whether the member can create conversations',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  canCreateConversations?: boolean;
}
