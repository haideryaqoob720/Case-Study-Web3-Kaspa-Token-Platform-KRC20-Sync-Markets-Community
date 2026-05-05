// Token Response DTO: Defines the structure of token data returned by
//  API (token info, market data, pagination)

import { Expose, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MarketDataDto,
  CurrencyAmountDto,
  ExchangeMarketDataDto,
} from './market-data.dto';

export class TokenResponseDto {
  @ApiProperty({ description: 'Token ticker symbol', example: 'KASPA' })
  @Expose()
  ticker: string;

  @ApiProperty({
    description: 'Maximum supply of the token',
    example: '1000000000',
  })
  @Expose()
  MaximumSupply: string;

  @ApiPropertyOptional({ description: 'Mint limit', example: '1000000' })
  @Expose()
  MintLimit?: string;

  @ApiProperty({ description: 'Premint amount', example: '0' })
  @Expose()
  preAllocated: string;

  @ApiProperty({ description: 'Deployment address', example: 'kaspa:q...' })
  @Expose()
  to: string;

  @ApiProperty({ description: 'Token decimals', example: '8' })
  @Expose()
  decimal: string;

  @ApiProperty({ description: 'Token deployment mode', example: 'mint' })
  @Expose()
  Deploymentmode: string;

  @ApiProperty({
    description: 'Amount of tokens minted (Kasplex format)',
    example: '500000000',
  })
  @Expose()
  minted: string;

  @ApiProperty({
    description: 'Amount of tokens burned (Kasplex format)',
    example: '1000000',
  })
  @Expose()
  burned: string;

  @ApiPropertyOptional({
    description: 'Operation score add (Kasplex format)',
    example: '123456',
  })
  @Expose()
  opScoreAdd?: string;

  @ApiPropertyOptional({
    description: 'Operation score mod (Kasplex format)',
    example: '123456',
  })
  @Expose()
  opScoreMod?: string;

  @ApiProperty({
    description: 'Token state (Kasplex format)',
    example: 'active',
  })
  @Expose()
  state: string;

  @ApiPropertyOptional({
    description: 'Hash revision (Kasplex format)',
    example: 'abc123...',
  })
  @Expose()
  hashRev?: string;

  @ApiProperty({
    description: 'Deployment timestamp (Kasplex format)',
    example: '1704067200',
  })
  @Expose()
  mtsAdd: string;

  @ApiPropertyOptional({
    description: 'Token age in seconds (currentTime - mtsAdd)',
    example: 86400,
  })
  @Expose()
  tokenAge?: number;

  // Note: holders, mintCount, age are NOT in Kasplex token list API
  // They are only in token info API, so we don't include them here

  @ApiPropertyOptional({
    description: 'Contract address (for issue tokens)',
    example: 'abc123...',
  })
  @Expose()
  ContractAddress?: string;

  @ApiPropertyOptional({
    description: 'Token name (from Kasplex API, no fallback)',
    example: 'Nacho Token',
  })
  @Expose()
  name?: string | null;

  @ApiPropertyOptional({
    description: 'Total mint count (Kasplex format)',
    example: '10000000',
  })
  @Expose()
  mintTotal?: string;

  @ApiPropertyOptional({
    description: 'Total holder count (Kasplex format)',
    example: '63269',
  })
  @Expose()
  holderTotal?: string;

  @ApiPropertyOptional({
    description: 'Token identifier (tick or name from Kasplex)',
    example: 'NACHO',
  })
  @Expose()
  identifier?: string;

  @ApiPropertyOptional({
    description: 'Last sync timestamp (when token data was last updated)',
    example: '2026-01-05T02:00:00.00453Z',
  })
  @Expose()
  lastSyncedAt?: string;

  // Root level market data fields (Kaspa Lens format)
  @ApiPropertyOptional({
    description: 'Price with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  price?: CurrencyAmountDto;

  @ApiPropertyOptional({
    description: '24h price change percentage',
    example: -1.82,
  })
  @Expose()
  change24h?: number;

  @ApiPropertyOptional({
    description: '7d price change percentage',
    example: 2.32,
  })
  @Expose()
  change7d?: number;

  @ApiPropertyOptional({
    description: '30d price change percentage',
    example: 12.34,
  })
  @Expose()
  change30d?: number;

  @ApiPropertyOptional({
    description: 'Floor price in KAS (when from marketplace)',
    example: '0.001234',
  })
  @Expose()
  floorPriceKas?: string | number | null;

  @ApiPropertyOptional({
    description: '24h volume with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  volume24h?: CurrencyAmountDto;

  @ApiPropertyOptional({
    description: 'Market cap with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  marketCap?: CurrencyAmountDto;

  @ApiPropertyOptional({
    description: 'Whether market cap is unverified',
    example: false,
  })
  @Expose()
  marketCapUnverified?: boolean;

  @ApiPropertyOptional({
    description: 'Whether volume is very low',
    example: false,
  })
  @Expose()
  veryLowVolume?: boolean;

  @ApiPropertyOptional({
    description: 'Token rank based on market cap (1 = highest market cap)',
    example: 1,
  })
  @Expose()
  rank?: number | null;

  // Market data array (per-exchange data)
  @ApiPropertyOptional({
    description: 'Per-exchange market data array',
    type: [ExchangeMarketDataDto],
  })
  @Expose()
  @Type(() => ExchangeMarketDataDto)
  marketData?: ExchangeMarketDataDto[];
}

export class PaginationDto {
  @ApiProperty({ description: 'Current page number', example: 1 })
  @Expose()
  page: number;

  @ApiProperty({ description: 'Items per page', example: 50 })
  @Expose()
  limit: number;

  @ApiProperty({ description: 'Total number of items', example: 1000 })
  @Expose()
  total: number;

  @ApiProperty({ description: 'Total number of pages', example: 20 })
  @Expose()
  totalPages: number;
}

export class GetTokensResponseDto {
  @ApiProperty({ description: 'Array of tokens', type: [TokenResponseDto] })
  @Expose()
  data: TokenResponseDto[];

  @ApiProperty({ description: 'Pagination information', type: PaginationDto })
  @Expose()
  pagination: PaginationDto;
}
