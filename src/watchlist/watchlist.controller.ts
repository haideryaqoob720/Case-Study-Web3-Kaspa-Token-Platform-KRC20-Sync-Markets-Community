import { Controller, Get, Post, Delete, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { WatchlistService } from './watchlist.service';

@ApiTags('watchlist')
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  @ApiOperation({
    summary: 'Get watchlist for a wallet',
    description: 'Returns list of favorited token IDs for the given wallet address.',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Connected wallet address',
  })
  @ApiResponse({ status: 200, description: 'List of watchlist items' })
  @ApiResponse({ status: 400, description: 'walletAddress required' })
  async getList(@Query('walletAddress') walletAddress: string) {
    const list = await this.watchlistService.getList(walletAddress);
    return { watchlist: list };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add token to watchlist',
    description: 'Add a token to the wallet’s favorites. Requires walletAddress and tokenId.',
  })
  @ApiResponse({ status: 200, description: 'Added' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async add(
    @Body() body: { walletAddress?: string; tokenId?: string },
  ) {
    return this.watchlistService.add(body?.walletAddress, body?.tokenId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove token from watchlist',
    description: 'Remove a token from the wallet’s favorites.',
  })
  @ApiResponse({ status: 200, description: 'Removed' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async remove(
    @Body() body: { walletAddress?: string; tokenId?: string },
  ) {
    return this.watchlistService.remove(body?.walletAddress, body?.tokenId);
  }
}
