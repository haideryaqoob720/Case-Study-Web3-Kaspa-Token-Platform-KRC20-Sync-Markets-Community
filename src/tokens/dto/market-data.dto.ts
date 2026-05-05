// Market Data DTO: Defines market data structure (price, volume, marketCap)
// for frontend compatibility

import { Expose, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Currency object for price/volume/marketCap (Kaspa Lens format)
 */
export class CurrencyDto {
  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @Expose()
  code: string;

  @ApiProperty({ description: 'Currency name', example: 'US Dollar' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Currency symbol', example: '$' })
  @Expose()
  symbol: string;
}

/**
 * Price/Volume/MarketCap with currency (Kaspa Lens format)
 */
export class CurrencyAmountDto {
  @ApiProperty({ description: 'Currency information', type: CurrencyDto })
  @Expose()
  @Type(() => CurrencyDto)
  currency: CurrencyDto;

  @ApiProperty({ description: 'Amount value', example: 0.00001769 })
  @Expose()
  amount: number;

  @ApiPropertyOptional({
    description:
      'Source of the aggregated price: exchange data, kasplex_marketplace floor, or none',
    example: 'exchange',
  })
  @Expose()
  priceSource?: 'exchange' | 'kasplex_marketplace' | 'none';
}

/**
 * Per-exchange market data (Kaspa Lens format)
 */
export class ExchangeMarketDataDto {
  @ApiProperty({ description: 'Exchange code', example: 'GATE_IO' })
  @Expose()
  exchange: string;

  @ApiProperty({ description: 'Exchange name', example: 'Gate.io' })
  @Expose()
  exchangeName: string;

  @ApiPropertyOptional({
    description: 'Exchange logo URL',
    example: 'https://...',
  })
  @Expose()
  exchangeLogoUrl?: string | null;

  @ApiProperty({ description: 'Price with currency', type: CurrencyAmountDto })
  @Expose()
  @Type(() => CurrencyAmountDto)
  price: CurrencyAmountDto;

  @ApiProperty({
    description: 'Open price with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  open: CurrencyAmountDto;

  @ApiProperty({
    description: 'Close price with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  close: CurrencyAmountDto;

  @ApiProperty({
    description: 'High price with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  high: CurrencyAmountDto;

  @ApiProperty({
    description: 'Low price with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  low: CurrencyAmountDto;

  @ApiProperty({ description: '24h price change percentage', example: 1.92 })
  @Expose()
  priceChangePercent: number;

  @ApiPropertyOptional({
    description: '7d price change percentage',
    example: -26.4,
  })
  @Expose()
  change7d?: number;

  @ApiPropertyOptional({
    description: '30d price change percentage',
    example: 12.34,
  })
  @Expose()
  change30d?: number;

  @ApiProperty({ description: 'Quote symbol', example: 'USDT' })
  @Expose()
  quoteSymbol: string;

  @ApiProperty({ description: 'Time range', example: 'HOURS_24' })
  @Expose()
  timeRange: string;

  @ApiProperty({ description: 'Volume with currency', type: CurrencyAmountDto })
  @Expose()
  @Type(() => CurrencyAmountDto)
  volume: CurrencyAmountDto;

  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2026-01-05T11:45:05Z',
  })
  @Expose()
  lastUpdated: string;
}

/**
 * Aggregated market data (Kaspa Lens format)
 */
export class MarketDataDto {
  @ApiProperty({ description: 'Price with currency', type: CurrencyAmountDto })
  @Expose()
  @Type(() => CurrencyAmountDto)
  price: CurrencyAmountDto;

  @ApiProperty({ description: '24h price change percentage', example: 1.03 })
  @Expose()
  change24h: number;

  @ApiProperty({ description: '7d price change percentage', example: 41.89 })
  @Expose()
  change7d: number;

  @ApiPropertyOptional({
    description: '30d price change percentage',
    example: 55.12,
  })
  @Expose()
  change30d?: number | null;

  @ApiProperty({
    description: '24h volume with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  volume24h: CurrencyAmountDto;

  @ApiProperty({
    description: 'Market cap with currency',
    type: CurrencyAmountDto,
  })
  @Expose()
  @Type(() => CurrencyAmountDto)
  marketCap: CurrencyAmountDto;

  @ApiProperty({
    description: 'Whether market cap is unverified',
    example: false,
  })
  @Expose()
  marketCapUnverified: boolean;

  @ApiProperty({ description: 'Whether volume is very low', example: false })
  @Expose()
  veryLowVolume: boolean;

  @ApiProperty({
    description: 'Per-exchange market data',
    type: [ExchangeMarketDataDto],
  })
  @Expose()
  @Type(() => ExchangeMarketDataDto)
  exchanges: ExchangeMarketDataDto[];
}
