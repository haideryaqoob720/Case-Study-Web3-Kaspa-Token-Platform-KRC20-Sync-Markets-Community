// Purpose: REST API controller for holder tracking endpoints
// What: Exposes GET endpoints for current and historical holder data,
//      supports interval-based queries (1h, 1d, 7d, 1m, 1y, max),
//      aggregates daily snapshots into weekly/monthly data for charts

import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { HolderSnapshotRepository } from './holder-snapshot.repository';
import { HolderTrend1mService } from './holder-trend-1m.service';

@ApiTags('holders')
@Controller('v1/holders')
export class HolderTrackingController {
  private readonly logger = new Logger(HolderTrackingController.name);

  constructor(
    private readonly snapshotRepository: HolderSnapshotRepository,
    private readonly holderTrend1mService: HolderTrend1mService,
  ) {}

  @Get(':ticker/history')
  @ApiOperation({
    summary: 'Get historical holder data for a token',
    description:
      'Returns time-series data for total holders and top holder percentages. Use interval parameter for relative time ranges (1h, 1d, 7d, 1m, 1y, max) or provide startDate/endDate for custom ranges.',
  })
  @ApiParam({
    name: 'ticker',
    type: String,
    description: 'Token ticker symbol (e.g., NACHO)',
    example: 'NACHO',
  })
  @ApiQuery({
    name: 'interval',
    type: String,
    required: false,
    description:
      'Time interval for data aggregation. Automatically calculates date range: 1h (last hour), 1d (last day), 7d (last 7 days), 1m (last 30 days), 1y (last year), max (all data)',
    enum: ['1h', '1d', '7d', '1m', '1y', 'max'],
    example: '7d',
  })
  @ApiQuery({
    name: 'startDate',
    type: String,
    required: false,
    description:
      'Optional: Start date in YYYY-MM-DD format. If not provided, calculated from interval.',
    example: '2025-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    type: String,
    required: false,
    description:
      'Optional: End date in YYYY-MM-DD format. Defaults to today if not provided.',
    example: '2025-02-13',
  })
  @ApiResponse({
    status: 200,
    description: 'Historical holder data',
    schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', example: 'NACHO' },
        interval: { type: 'string', example: '7d' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', example: '2025-02-13' },
              holders: { type: 'number', example: 63289 },
              top10: { type: 'number', example: 26.24 },
              top20: { type: 'number', example: 31.4 },
              top50: { type: 'number', example: 40.59 },
              top10Delta: {
                type: 'number',
                example: 0.12,
                description:
                  'Day-over-day change in Top 10 percentage. Positive = accumulation, negative = distribution.',
              },
              top20Delta: {
                type: 'number',
                example: 0.18,
                description:
                  'Day-over-day change in Top 20 percentage. Positive = accumulation, negative = distribution.',
              },
              top50Delta: {
                type: 'number',
                example: 0.22,
                description:
                  'Day-over-day change in Top 50 percentage. Positive = accumulation, negative = distribution.',
              },
            },
          },
        },
      },
    },
  })
  async getHistory(
    @Param('ticker') ticker: string,
    @Query('interval') interval: string = '1d',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const startTime = Date.now();

    // Normalize interval to lowercase for consistent matching
    const normalizedInterval = interval?.toLowerCase() || '1d';

    if (normalizedInterval === '1d') {
      const minutePoints = await this.holderTrend1mService.get1dTrend(
        ticker.toUpperCase(),
      );
      if (minutePoints.length > 0) {
        return {
          ticker: ticker.toUpperCase(),
          interval: normalizedInterval,
          data: minutePoints.map((p) => ({
            date: p.bucketStart.toISOString(),
            holders: p.holders,
            top10: p.top10,
            top20: p.top20,
            top50: p.top50,
            top10Delta: p.top10Delta,
            top20Delta: p.top20Delta,
            top50Delta: p.top50Delta,
          })),
        };
      }
    }

    // Calculate date range from interval if dates not provided
    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      // Use provided dates
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      // Calculate from interval
      const now = Date.now();
      switch (normalizedInterval) {
        case '1h':
          start = new Date(now - 60 * 60 * 1000);
          break;
        case '1d':
          // For 1d, return last 2 days to ensure we get at least one daily snapshot
          // Daily snapshots are stored at midnight, so 24 hours might miss the latest snapshot
          start = new Date(now - 2 * 24 * 60 * 60 * 1000);
          break;
        case '7d':
          start = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case '1m':
          start = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          start = new Date(now - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'max':
          start = new Date(0); // Beginning of time
          break;
        default:
          start = new Date(now - 30 * 24 * 60 * 60 * 1000); // Default: 30 days
      }
    }

    try {
      const snapshots = await this.snapshotRepository.findHistory(
        ticker,
        start,
        end,
      );

      let data: Array<{
        snapshotTimestamp: Date;
        holderTotal: number;
        top10Percentage: number | null;
        top20Percentage: number | null;
        top50Percentage: number | null;
      }> = snapshots;

      // Only aggregate if we have enough data points
      // For 7d: aggregate only if we have more than 7 days of data
      // For monthly/yearly: aggregate only if we have more than 30 days of data
      if (normalizedInterval === '7d' && snapshots.length > 7) {
        data = this.aggregateWeekly(snapshots);
      } else if (
        (normalizedInterval === '1m' ||
          normalizedInterval === '1y' ||
          normalizedInterval === 'max') &&
        snapshots.length > 30
      ) {
        data = this.aggregateMonthly(snapshots);
      }
      // Otherwise, return daily snapshots as-is

      // Enrich with simple day-over-day deltas so frontend can show
      // which holder groups are accumulating vs distributing.
      const withDeltas = data.map((s, index) => {
        const prev = index > 0 ? data[index - 1] : null;

        const calcDelta = (
          current: number | null,
          previous: number | null,
        ): number => {
          if (
            current === null ||
            previous === null ||
            Number.isNaN(current) ||
            Number.isNaN(previous)
          ) {
            return 0;
          }
          // Return raw difference without rounding so frontend can apply
          // its own scaling/formatting and preserve small movements.
          return current - previous;
        };

        const top10Delta = prev
          ? calcDelta(s.top10Percentage, prev.top10Percentage)
          : 0;
        const top20Delta = prev
          ? calcDelta(s.top20Percentage, prev.top20Percentage)
          : 0;
        const top50Delta = prev
          ? calcDelta(s.top50Percentage, prev.top50Percentage)
          : 0;

        return {
          ...s,
          top10Delta,
          top20Delta,
          top50Delta,
        };
      });

      return {
        ticker: ticker.toUpperCase(),
        interval: normalizedInterval,
        data: withDeltas.map((s) => ({
          date: s.snapshotTimestamp.toISOString().split('T')[0],
          holders: s.holderTotal,
          top10: s.top10Percentage,
          top20: s.top20Percentage,
          top50: s.top50Percentage,
          top10Delta: s.top10Delta,
          top20Delta: s.top20Delta,
          top50Delta: s.top50Delta,
        })),
      };
    } catch (error) {
      this.logger.error({
        event: 'history_query_failed',
        ticker,
        interval: normalizedInterval,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  @Get(':ticker/current')
  @ApiOperation({
    summary: 'Get current holder data for a token',
    description:
      'Returns the latest snapshot of total holders and top 10/20/50 supply percentages for today (holder addresses are not stored).',
  })
  @ApiParam({
    name: 'ticker',
    type: String,
    description: 'Token ticker symbol (e.g., NACHO)',
    example: 'NACHO',
  })
  @ApiResponse({
    status: 200,
    description: 'Current holder data',
    schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', example: 'NACHO' },
        date: { type: 'string', example: '2025-02-13' },
        holderTotal: { type: 'number', example: 63289 },
        top10Percentage: { type: 'string', example: '26.24' },
        top20Percentage: { type: 'string', example: '31.40' },
        top50Percentage: { type: 'string', example: '40.59' },
      },
    },
  })
  async getCurrent(@Param('ticker') ticker: string) {
    const today = new Date();
    const snapshot = await this.snapshotRepository.findByTickerAndDate(
      ticker,
      today,
    );

    if (!snapshot) {
      return {
        ticker: ticker.toUpperCase(),
        message: 'No snapshot found for today',
      };
    }

    return {
      ticker: snapshot.ticker,
      date: snapshot.snapshotTimestamp.toISOString().split('T')[0],
      holderTotal: snapshot.holderTotal,
      top10Percentage: snapshot.top10Percentage,
      top20Percentage: snapshot.top20Percentage,
      top50Percentage: snapshot.top50Percentage,
    };
  }

  private aggregateWeekly(snapshots: any[]): Array<{
    snapshotTimestamp: Date;
    holderTotal: number;
    top10Percentage: number | null;
    top20Percentage: number | null;
    top50Percentage: number | null;
  }> {
    const weeklyMap = new Map<string, any[]>();

    snapshots.forEach((snapshot) => {
      const date = new Date(snapshot.snapshotTimestamp);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, []);
      }
      weeklyMap.get(weekKey)!.push(snapshot);
    });

    return Array.from(weeklyMap.entries()).map(([weekKey, weekSnapshots]) => {
      const avgHolders =
        weekSnapshots.reduce((sum, s) => sum + s.holderTotal, 0) /
        weekSnapshots.length;
      const avgTop10 =
        weekSnapshots.reduce((sum, s) => sum + (s.top10Percentage || 0), 0) /
        weekSnapshots.length;
      const avgTop20 =
        weekSnapshots.reduce((sum, s) => sum + (s.top20Percentage || 0), 0) /
        weekSnapshots.length;
      const avgTop50 =
        weekSnapshots.reduce((sum, s) => sum + (s.top50Percentage || 0), 0) /
        weekSnapshots.length;

      return {
        snapshotTimestamp: new Date(weekKey + 'T00:00:00Z'),
        holderTotal: Math.round(avgHolders),
        top10Percentage: Math.round(avgTop10 * 100) / 100,
        top20Percentage: Math.round(avgTop20 * 100) / 100,
        top50Percentage: Math.round(avgTop50 * 100) / 100,
      };
    });
  }

  private aggregateMonthly(snapshots: any[]): Array<{
    snapshotTimestamp: Date;
    holderTotal: number;
    top10Percentage: number | null;
    top20Percentage: number | null;
    top50Percentage: number | null;
  }> {
    const monthlyMap = new Map<string, any[]>();

    snapshots.forEach((snapshot) => {
      const date = new Date(snapshot.snapshotTimestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, []);
      }
      monthlyMap.get(monthKey)!.push(snapshot);
    });

    return Array.from(monthlyMap.entries()).map(
      ([monthKey, monthSnapshots]) => {
        const avgHolders =
          monthSnapshots.reduce((sum, s) => sum + s.holderTotal, 0) /
          monthSnapshots.length;
        const avgTop10 =
          monthSnapshots.reduce((sum, s) => sum + (s.top10Percentage || 0), 0) /
          monthSnapshots.length;
        const avgTop20 =
          monthSnapshots.reduce((sum, s) => sum + (s.top20Percentage || 0), 0) /
          monthSnapshots.length;
        const avgTop50 =
          monthSnapshots.reduce((sum, s) => sum + (s.top50Percentage || 0), 0) /
          monthSnapshots.length;

        return {
          snapshotTimestamp: new Date(`${monthKey}-01T00:00:00Z`),
          holderTotal: Math.round(avgHolders),
          top10Percentage: Math.round(avgTop10 * 100) / 100,
          top20Percentage: Math.round(avgTop20 * 100) / 100,
          top50Percentage: Math.round(avgTop50 * 100) / 100,
        };
      },
    );
  }
}
