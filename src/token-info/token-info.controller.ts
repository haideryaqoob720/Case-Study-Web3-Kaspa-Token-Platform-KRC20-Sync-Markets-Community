// Token Info Controller: Handles HTTP requests for token info API endpoints
// (GET /v1/krc20/token/:tick returns detailed token info with holders)
// (GET /v1/krc20/token/:tick/chart — intervals: 1h, 1d, 7d, 1M, 3M, 1Y, ytd, max)

import { Controller, Get, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TokenInfoService } from './token-info.service';
import { TokensService } from '../tokens/tokens.service';

const CHART_INTERVALS = [
  '7d',
  '1h',
  '1d',
  '1M',
  '3M',
  '1Y',
  'ytd',
  'max',
] as const;

/** Accepts exact API values plus common UI aliases (`3m`→`3M`, `1m`→`1M`, `YTD`→`ytd`). */
function normalizeChartIntervalQuery(interval: unknown): string | null {
  const raw = Array.isArray(interval) ? interval[0] : interval;
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if ((CHART_INTERVALS as readonly string[]).includes(t)) return t;
  const lower = t.toLowerCase();
  const aliases: Record<string, string> = {
    '1h': '1h',
    '1d': '1d',
    '7d': '7d',
    '1m': '1M',
    '3m': '3M',
    '1y': '1Y',
    ytd: 'ytd',
    max: 'max',
  };
  const mapped = aliases[lower];
  return mapped && (CHART_INTERVALS as readonly string[]).includes(mapped)
    ? mapped
    : null;
}

@ApiTags('token-info')
@Controller('v1/krc20')
export class TokenInfoController {
  constructor(
    private readonly tokenInfoService: TokenInfoService,
    private readonly tokensService: TokensService,
  ) {}

  // More specific route first so Nest matches /token/:tick/chart before /token/:tick
  @Get('token/:tick/chart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get chart data for a token',
    description:
      'Returns OHLC candles per exchange (byExchange) for the given interval. tick is the token ticker (e.g. NACHO).',
  })
  @ApiParam({
    name: 'tick',
    type: String,
    description: 'Token ticker symbol (e.g., NACHO)',
    example: 'NACHO',
  })
  @ApiQuery({
    name: 'interval',
    required: true,
    enum: ['7d', '1h', '1d', '1M', '3M', '1Y', 'ytd', 'max'],
    description:
      'Chart interval: 7d, 1h, 1d, 1M, 3M (~90d daily), 1Y, ytd (daily since UTC year start), or max.',
  })
  @ApiResponse({
    status: 200,
    description: 'Chart data with byExchange array (per-exchange candles).',
    schema: {
      type: 'object',
      properties: {
        interval: { type: 'string' },
        ticker: { type: 'string' },
        byExchange: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              exchangeCode: { type: 'string' },
              exchangeName: { type: 'string' },
              candles: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Token or chart data not found' })
  async getTokenChart(
    @Param('tick') tick: string,
    @Query('interval') interval: '7d' | '1h' | '1d' | '1M' | '3M' | '1Y' | 'ytd' | 'max',
  ): Promise<any> {
    const normalized = normalizeChartIntervalQuery(interval);
    if (!tick?.trim() || !normalized) {
      return null;
    }
    return this.tokensService.getChartData(tick.trim(), normalized as any);
  }

  @Get('token/:tick/marketcap-chart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get market cap chart data for a token',
    description:
      'Returns market cap candles derived from price candles and maxSupply. Interval is the same as price chart (7d, 1h, 1d, 1M, 1Y, max).',
  })
  @ApiParam({
    name: 'tick',
    type: String,
    description: 'Token ticker symbol (e.g., NACHO)',
    example: 'NACHO',
  })
  @ApiQuery({
    name: 'interval',
    required: true,
    enum: ['7d', '1h', '1d', '1M', '3M', '1Y', 'ytd', 'max'],
    description:
      'Same intervals as price chart. Candles are derived market cap from price × (maxSupply / 10^decimals).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Market cap chart data with root-level candles array (no byExchange).',
    schema: {
      type: 'object',
      properties: {
        interval: { type: 'string' },
        ticker: { type: 'string' },
        candles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              open: { type: 'string' },
              high: { type: 'string' },
              low: { type: 'string' },
              close: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Token or market cap chart data not found',
  })
  async getTokenMarketCapChart(
    @Param('tick') tick: string,
    @Query('interval') interval: '7d' | '1h' | '1d' | '1M' | '3M' | '1Y' | 'ytd' | 'max',
  ): Promise<any> {
    const normalized = normalizeChartIntervalQuery(interval);
    if (!tick?.trim() || !normalized) {
      return null;
    }
    return this.tokensService.getMarketCapChartData(
      tick.trim(),
      normalized as any,
    );
  }

  @Get('token/:tick')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get token info by ticker',
    description:
      'Retrieves detailed token information including holder data, vote sentiment, and favorite state. Pass walletAddress to get userVote and isFavorite.',
  })
  @ApiParam({
    name: 'tick',
    type: String,
    description: 'Token ticker symbol (e.g., NACHO)',
    example: 'NACHO',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: false,
    type: String,
    description: 'Connected wallet address for userVote and isFavorite',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns token info in Kasplex API format',
    schema: {
      type: 'object',
      example: {
        message: 'successful',
        result: [
          {
            tick: 'NACHO',
            max: '28700000000000000000',
            lim: '2870000000000',
            holder: [
              {
                address:
                  'kaspa:qpwztwfam65p88zpw44m6ht6ghpvx8k3qszcwghkgvwe644kzp0g2p8jvych2',
                amount: '2784875682916966325',
              },
            ],
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Token info not found',
    schema: {
      type: 'object',
      example: {
        statusCode: 404,
        message: 'Token info not found for tick: NACHO',
        error: 'Not Found',
      },
    },
  })
  async getTokenInfo(
    @Param('tick') tick: string,
    @Query('walletAddress') walletAddress?: string,
  ): Promise<any> {
    return this.tokenInfoService.getTokenInfo(tick, walletAddress);
  }
}
