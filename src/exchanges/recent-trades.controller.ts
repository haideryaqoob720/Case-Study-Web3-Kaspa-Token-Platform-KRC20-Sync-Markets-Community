// Recent Trades API: Returns latest trades with price/total in KAS and USD (same KAS rate as token APIs).

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { RecentTradesService } from './services/recent-trades.service';
import { RecentTradesApiResponse } from './dto/recent-trade-response.dto';
import { KasplexRecentTradeDocument } from '../database/schemas/kasplex-recent-trade.schema';

@ApiTags('exchanges')
@Controller('v1/exchanges')
export class RecentTradesController {
  constructor(private readonly recentTradesService: RecentTradesService) {}

  @Get('recent-trades')
  @ApiOperation({
    summary: 'Get recent trades',
    description:
      'Returns the 50 latest trades (or by token). Each trade has quantity, price, total in KAS and USD (using same KAS rate as token API).',
  })
  @ApiQuery({
    name: 'tokenIdentifier',
    required: false,
    type: String,
    description: 'Filter by token ticker (e.g. NACHO). Omit for all tokens.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of trades (default 50).',
  })
  @ApiResponse({
    status: 200,
    description:
      'KAS/USD rate + list of recent trades with price/total in KAS and USD',
  })
  async getRecentTrades(
    @Query('tokenIdentifier') tokenIdentifier?: string,
    @Query('limit') limit?: number,
  ): Promise<RecentTradesApiResponse> {
    return this.recentTradesService.getRecentTrades({
      tokenIdentifier: tokenIdentifier?.trim() || undefined,
      limit: limit != null && limit > 0 ? Math.min(limit, 100) : 50,
    });
  }

  @Get('kasplex-recent-trades/:ticker')
  @ApiOperation({
    summary: 'Get latest Kasplex recent trades by ticker',
    description:
      'Returns latest 20 trades from kasplex_recent_trades sorted by txTime descending.',
  })
  @ApiParam({
    name: 'ticker',
    required: true,
    type: String,
    description: 'Token ticker (e.g. NACHO).',
  })
  @ApiResponse({
    status: 200,
    description: 'Latest Kasplex recent trades sorted by txTime desc.',
  })
  async getKasplexRecentTrades(
    @Param('ticker') ticker: string,
  ): Promise<KasplexRecentTradeDocument[]> {
    return this.recentTradesService.getKasplexRecentTrades(ticker, 20);
  }
}
