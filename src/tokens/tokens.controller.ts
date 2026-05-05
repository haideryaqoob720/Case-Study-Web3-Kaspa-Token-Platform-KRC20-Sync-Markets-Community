// Tokens Controller: Handles HTTP requests for token API endpoints
// (GET /api/tokens with pagination, sorting, search)

import {
  Controller,
  Get,
  Query,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TokensService } from './tokens.service';
import { GetTokensQueryDto } from './dto/get-tokens-query.dto';
import { GetTokensResponseDto } from './dto/token-response.dto';

@ApiTags('tokens')
@Controller('tokens')
@UseInterceptors(ClassSerializerInterceptor)
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get()
  @ApiOperation({
    summary: 'Get paginated list of tokens',
    description:
      'Retrieves a paginated list of tokens with optional filtering and sorting',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of tokens',
    type: GetTokensResponseDto,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 50, max: 100)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['ticker', 'holderCount', 'mintCount', 'mtsAdd', 'createdAt', 'rank'],
    description: 'Field to sort by (default: rank)',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order (default: asc for rank, desc for others)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for filtering tokens',
  })
  @ApiQuery({
    name: 'minting',
    required: false,
    enum: ['all', '0', '0-10', '10-50', '50-100', '100'],
    description: 'Filter by minting percentage range (default: all)',
  })
  @ApiQuery({
    name: 'supplySort',
    required: false,
    enum: ['max', 'minted', 'percentage'],
    description:
      'Sort by supply: max (maxSupply), minted (minted supply), or percentage (minting percentage)',
  })
  @ApiQuery({
    name: 'ageSort',
    required: false,
    enum: ['newest', 'oldest'],
    description: 'Sort by age: newest (most recent) or oldest (oldest first)',
  })
  @ApiQuery({
    name: 'premint',
    required: false,
    enum: ['all', 'yes', 'no'],
    description:
      'Filter by premint status: all (no filter), yes (has premint), or no (no premint) (default: all)',
  })
  @ApiQuery({
    name: 'protocol',
    required: false,
    type: String,
    description:
      'Filter by protocol (e.g. KRC-20). For now all tokens are KRC-20 so returns all; later will filter by protocol when schema has it.',
  })
  @ApiQuery({
    name: 'identifier',
    required: false,
    type: String,
    description:
      'When provided, fetches only the token with exact identifier match. Uses identifier column from DB.',
  })
  @ApiQuery({
    name: 'topGainers',
    required: false,
    type: Boolean,
    description:
      'When true, returns top gainers only: change24h > 0, volume24h > $10k USD, marketCap > $50k USD, sorted by change24h DESC.',
  })
  @ApiQuery({
    name: 'topLosers',
    required: false,
    type: Boolean,
    description:
      'When true, returns top losers only: change24h < 0, volume24h >= $15k USD, marketCap >= $50k USD, sorted by change24h ASC.',
  })
  @ApiQuery({
    name: 'trending',
    required: false,
    type: Boolean,
    description:
      'When true, returns trending tokens: weighted score (volume + price change + holder growth 7d), optional newness boost, sorted by score DESC.',
  })
  @ApiQuery({
    name: 'voteSort',
    required: false,
    enum: ['mostVoted'],
    description: 'Sort by total vote count (highest first).',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: false,
    type: String,
    description:
      'When set with favoritesOnly=true, return only tokens in this wallet’s watchlist.',
  })
  @ApiQuery({
    name: 'favoritesOnly',
    required: false,
    type: Boolean,
    description: 'When true and walletAddress is set, return only favorite tokens.',
  })
  async findAll(
    @Query() query: GetTokensQueryDto,
  ): Promise<GetTokensResponseDto> {
    return this.tokensService.findAll(query);
  }
}
