// Get Tokens Query DTO: Validates query parameters for token list API
//  (page, limit, sort, order, search) and converts to DTO object

import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetTokensQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 50,
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['ticker', 'holderCount', 'mintCount', 'mtsAdd', 'createdAt', 'rank'],
    default: 'rank',
    example: 'rank',
  })
  @IsOptional()
  @IsString()
  @IsIn(['ticker', 'holderCount', 'mintCount', 'mtsAdd', 'createdAt', 'rank'])
  sort?: string = 'rank';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'asc',
    example: 'asc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({
    description:
      'Filter by protocol (e.g. KRC-20). For now all tokens are KRC-20 so this returns all when set; later will filter by token.protocol when schema has it.',
    example: 'KRC-20',
  })
  @IsOptional()
  @IsString()
  protocol?: string;

  @ApiPropertyOptional({
    description: 'Search term for filtering tokens',
    example: 'KASPA',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'When provided, fetches only the token with exact identifier match (e.g. NACHO only, not NACHOS). Uses identifier column from DB.',
    example: 'NACHO',
  })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({
    description: 'Filter by minting percentage range',
    enum: ['all', '0', '0-10', '10-50', '50-100', '100'],
    default: 'all',
    example: 'all',
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', '0', '0-10', '10-50', '50-100', '100'])
  minting?: string = 'all';

  @ApiPropertyOptional({
    description: 'Sort by supply',
    enum: ['max', 'minted', 'percentage'],
    example: 'max',
  })
  @IsOptional()
  @IsString()
  @IsIn(['max', 'minted', 'percentage'])
  supplySort?: string;

  @ApiPropertyOptional({
    description: 'Sort by age',
    enum: ['newest', 'oldest'],
    example: 'newest',
  })
  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest'])
  ageSort?: string;

  @ApiPropertyOptional({
    description: 'Filter by premint status',
    enum: ['all', 'yes', 'no'],
    default: 'all',
    example: 'all',
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'yes', 'no'])
  premint?: string = 'all';

  @ApiPropertyOptional({
    description:
      'When true, returns top gainers: tokens with change24h > 0, volume24h > $10k, marketCap > $50k, sorted by change24h DESC',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  topGainers?: boolean = false;

  @ApiPropertyOptional({
    description:
      'When true, returns top losers: tokens with change24h < 0, volume24h >= $15k, marketCap >= $50k, sorted by change24h ASC',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  topLosers?: boolean = false;

  @ApiPropertyOptional({
    description:
      'When true, returns trending tokens: weighted score from volume24h (V), price change 24h/7d (C), holder growth 7d (T), optional newness boost; sorted by score DESC',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  trending?: boolean = false;

  @ApiPropertyOptional({
    description:
      'When true, uses the same logic as trending: weighted score (volume + price change + holder growth 7d), sorted by score DESC.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  mostViewed?: boolean = false;

  @ApiPropertyOptional({
    description:
      'When true, returns market (blue chip) tokens: listed on at least one configured market exchange, volume24h and marketCap above thresholds, sorted by marketCap DESC',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  marketTokens?: boolean = false;

  @ApiPropertyOptional({
    description:
      'When true, returns top today: tokens with min volume 5k that have gained in price (change24h > 0) OR are volume leaders (volume24h >= 10k); sorted by volume24h DESC then change24h DESC',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  topToday?: boolean = false;

  @ApiPropertyOptional({
    description:
      'When true, returns fair launch tokens only: max supply equals total available for public minting (preAllocated is 0).',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  fairLaunch?: boolean = false;

  @ApiPropertyOptional({
    description:
      'When true, returns pre sale tokens only: tokens with pre-allocated supply (preAllocated > 0).',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  preSale?: boolean = false;

  @ApiPropertyOptional({
    description: 'Sort by vote count (highest first)',
    enum: ['mostVoted'],
    example: 'mostVoted',
  })
  @IsOptional()
  @IsString()
  @IsIn(['mostVoted'])
  voteSort?: string;

  @ApiPropertyOptional({
    description:
      'When set with favoritesOnly=true, return only tokens in this wallet’s watchlist',
    example: 'kaspa:...',
  })
  @IsOptional()
  @IsString()
  walletAddress?: string;

  @ApiPropertyOptional({
    description:
      'When true and walletAddress is set, return only tokens in that wallet’s favorites',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? true : false,
  )
  @IsBoolean()
  favoritesOnly?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Filter by market cap bracket: large (e.g. >= $10M), mid ($1M–$10M), small (< $1M). Uses aggregated market data.',
    enum: ['large', 'mid', 'small'],
    example: 'large',
  })
  @IsOptional()
  @IsString()
  @IsIn(['large', 'mid', 'small'])
  marketCapBracket?: 'large' | 'mid' | 'small';
}
