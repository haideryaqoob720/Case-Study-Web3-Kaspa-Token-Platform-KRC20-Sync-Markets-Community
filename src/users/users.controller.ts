import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('by-wallet')
  @ApiOperation({
    summary: 'Get or create profile by wallet',
    description: 'Returns user profile for the given wallet address. Creates one if it does not exist.',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Connected wallet address',
  })
  @ApiResponse({ status: 200, description: 'User profile (id, walletAddress, createdAt)' })
  @ApiResponse({ status: 400, description: 'walletAddress required' })
  async getOrCreateByWallet(@Query('walletAddress') walletAddress: string) {
    const user = await this.usersService.getOrCreateByWallet(walletAddress);
    return {
      user: {
        id: (user as any)._id?.toString?.() ?? (user as any).id,
        walletAddress: user.walletAddress,
        createdAt: (user as any).createdAt,
      },
    };
  }
}
