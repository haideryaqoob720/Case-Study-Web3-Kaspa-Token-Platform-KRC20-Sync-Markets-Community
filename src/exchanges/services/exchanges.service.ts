// Exchanges Service: Business logic for market data operations - aggregates market data
// from multiple exchanges, calculates best prices, weighted averages, and market cap

import { Injectable } from '@nestjs/common';
import {
  ExchangesRepository,
  ExchangeMarketData24hWithExchange,
  ExchangeMarketData7dWithExchange,
} from '../repositories/exchanges.repository';
import type { ExchangeMarketData24hEntity } from '../../database/entities/exchange-market-data-24h.entity';
import { ExchangeMarketData7dEntity } from '../../database/entities/exchange-market-data-7d.entity';
import { TokenEntity } from '../../database/entities/token.entity';

/** Parallel $in batches avoid one huge query + improve throughput for 5k+ identifiers. */
const MARKET_DATA_IDS_CHUNK = 500;

const CHART_HOUR_MS = 60 * 60 * 1000;
const CHART_MINUTE_MS = 60 * 1000;
const CHART_FIVE_MINUTE_MS = 5 * CHART_MINUTE_MS;
const CHART_FIFTEEN_MINUTE_MS = 15 * CHART_MINUTE_MS;
const CHART_THIRTY_MINUTE_MS = 30 * CHART_MINUTE_MS;
const CHART_FOUR_HOUR_MS = 4 * CHART_HOUR_MS;
const CHART_DAY_MS = 24 * CHART_HOUR_MS;
const CHART_CACHE_TTL_MS = 15 * 1000;

/** Raw kline row from Mongo (chart path). */
type ChartRawKlineRow = {
  date: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

/** Canonical time bucket for chart aggregation (end instant = exclusive period end). */
type ChartBucket = {
  bucketEndMs: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type ChartInterval = '7d' | '1h' | '1d' | '1M' | '3M' | '1Y' | 'ytd' | 'max';

type ChartBucketKind = 'hourly' | 'fourHour' | 'daily' | 'fourDay';

type ChartDataSource = 'hourly' | 'longRange';

type ChartIntervalPlan = {
  source: ChartDataSource;
  bucket: ChartBucketKind;
  fromMs: number | null;
  toMs: number;
};

type ChartResponse = {
  interval: string;
  ticker?: string;
  candles?: Array<{
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  byExchange?: Array<{
    exchangeCode: string;
    exchangeName: string;
    candles: Array<{
      timestamp: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>;
  }>;
};

/**
 * Aggregated market data interface (matches Kaspa Lens format)
 */
export interface AggregatedMarketData {
  // Per-exchange data
  exchanges: ExchangeMarketData[];
  // Aggregated values
  price: string; // Best price or volume-weighted average
  change24h: string | null; // Weighted average or best exchange (null for floor price)
  change7d: string | null; // Calculated from 7d K-line: ((day7_close - day1_close) / day1_close) × 100 (null for floor price)
  change30d: string | null;
  volume24h: string | null; // SUM of all exchange volumes (null for floor price)
  marketCap: string | null; // Price × MaximumSupply (null for floor price)
  marketCapUnverified: boolean | null; // (null for floor price)
  veryLowVolume: boolean | null; // (null for floor price)
  // Floor price value in KAS (present when we have a Kasplex floor)
  floorPriceKas?: string | null;
  // Source for the aggregated price: exchange data vs Kasplex floor vs none
  priceSource: 'exchange' | 'kasplex_marketplace' | 'none';
}

export interface ExchangeMarketData {
  exchange: string; // Exchange code
  exchangeName: string;
  exchangeLogoUrl: string | null;
  price: string;
  open: string;
  close: string;
  high: string;
  low: string;
  priceChangePercent: string;
  change7d?: string;
  change30d?: string;
  quoteSymbol: string;
  timeRange: string;
  volume: string;
  lastUpdated: string;
}

@Injectable()
export class ExchangesService {
  private readonly chartResponseCache = new Map<
    string,
    { value: ChartResponse | null; expiresAt: number }
  >();

  constructor(private readonly exchangesRepository: ExchangesRepository) {}

  private chartCacheKey(identifier: string, interval: ChartInterval): string {
    return `${identifier}|${interval}`;
  }

  private getCachedChart(
    identifier: string,
    interval: ChartInterval,
  ): ChartResponse | null | undefined {
    const key = this.chartCacheKey(identifier, interval);
    const cached = this.chartResponseCache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.chartResponseCache.delete(key);
      return undefined;
    }
    return cached.value;
  }

  private setCachedChart(
    identifier: string,
    interval: ChartInterval,
    value: ChartResponse | null,
  ): void {
    this.chartResponseCache.set(this.chartCacheKey(identifier, interval), {
      value,
      expiresAt: Date.now() + CHART_CACHE_TTL_MS,
    });
  }

  private async loadMarketData24hChunked(
    uniqueIds: string[],
  ): Promise<ExchangeMarketData24hWithExchange[]> {
    if (uniqueIds.length === 0) return [];
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += MARKET_DATA_IDS_CHUNK) {
      chunks.push(uniqueIds.slice(i, i + MARKET_DATA_IDS_CHUNK));
    }
    const parts = await Promise.all(
      chunks.map((ids) =>
        this.exchangesRepository.findMarketData24hByIdentifiers(ids),
      ),
    );
    return parts.flat();
  }

  private async loadMarketData7dChunked(
    uniqueIds: string[],
  ): Promise<ExchangeMarketData7dWithExchange[]> {
    if (uniqueIds.length === 0) return [];
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += MARKET_DATA_IDS_CHUNK) {
      chunks.push(uniqueIds.slice(i, i + MARKET_DATA_IDS_CHUNK));
    }
    const parts = await Promise.all(
      chunks.map((ids) =>
        this.exchangesRepository.findMarketData7dByIdentifiers(ids),
      ),
    );
    return parts.flat();
  }

  /**
   * Generate Cloudinary logo URL for an exchange
   * Format: https://res.cloudinary.com/dil4rwuxa/image/upload/v1767124058/krc20/logos/{EXCHANGE_CODE}.webp
   */
  private getExchangeLogoUrl(
    exchangeCode: string,
    storedLogoUrl: string | null,
  ): string {
    // If custom logo exists in DB, use it
    if (storedLogoUrl) {
      return storedLogoUrl;
    }
    // Otherwise, generate from Cloudinary
    // Convert exchange code to uppercase (e.g., 'gate_io' -> 'GATE_IO', 'coinex' -> 'COINEX')
    const upperCode = exchangeCode.toUpperCase();
    return `https://res.cloudinary.com/dil4rwuxa/image/upload/v1767124058/krc20/logos/${upperCode}.webp`;
  }

  /**
   * Public helper: logo URL for an exchange (same as marketData.exchangeLogoUrl).
   * Used by recent-trades API so frontend can show exchange icon.
   */
  getExchangeLogoUrlForCode(
    exchangeCode: string,
    storedLogoUrl: string | null | undefined,
  ): string {
    return this.getExchangeLogoUrl(exchangeCode ?? '', storedLogoUrl ?? null);
  }

  /**
   * Build floor-price-only aggregated result (no exchange data).
   */
  private buildFloorPriceOnlyAggregated(
    token: TokenEntity,
  ): AggregatedMarketData {
    const floorPriceUsd = parseFloat(token.floorPriceUsd || '0');
    const floorPriceKas = token.floorPriceKas
      ? parseFloat(token.floorPriceKas)
      : null;
    return {
      exchanges: [],
      price: floorPriceUsd.toString(),
      change24h: null,
      change7d: null,
      change30d: null,
      volume24h: null,
      marketCap: null,
      marketCapUnverified: null,
      veryLowVolume: null,
      floorPriceKas: floorPriceKas?.toString() || null,
      priceSource: 'kasplex_marketplace',
    };
  }

  /**
   * Aggregate 24h + 7d market data into Kaspa Lens format (single token).
   * Caller must ensure marketData24h.length > 0.
   */
  private aggregateMarketDataFrom(
    marketData24h: ExchangeMarketData24hEntity[],
    marketData7d: ExchangeMarketData7dEntity[],
    token: TokenEntity,
  ): AggregatedMarketData {
    const exchange7dMap = new Map<string, ExchangeMarketData7dWithExchange[]>();
    for (const data of marketData7d) {
      const key = data.exchangeId;
      if (!exchange7dMap.has(key)) {
        exchange7dMap.set(key, []);
      }
      exchange7dMap.get(key)!.push(data);
    }

    const exchanges: ExchangeMarketData[] = marketData24h.map(
      (data: ExchangeMarketData24hWithExchange) => {
        const exchange7dCandles = exchange7dMap.get(data.exchangeId) || [];
        const change7d = this.calculateExchangeChange7d(
          data,
          exchange7dCandles,
        );
        const change30d = this.calculateExchangeChange30d(
          data,
          exchange7dCandles,
        );
        const ex = data.exchange;
        return {
          exchange: ex?.code ?? data.exchangeId,
          exchangeName: ex?.name ?? '',
          exchangeLogoUrl: this.getExchangeLogoUrl(
            ex?.code ?? data.exchangeId,
            ex?.logoUrl ?? null,
          ),
          price: data.price,
          open: data.open24h,
          close: data.close24h,
          high: data.high24h,
          low: data.low24h,
          priceChangePercent: data.change24h,
          change7d: change7d,
          change30d: change30d,
          quoteSymbol: 'USDT',
          timeRange: 'HOURS_24',
          volume: data.volume24h,
          lastUpdated: data.lastUpdated.toISOString(),
        };
      },
    );

    const price = this.calculatePrice(marketData24h);
    const change24h = this.calculateChange24h(marketData24h);
    const change7d = this.calculateChange7d(marketData24h, marketData7d);
    const change30d = this.calculateChange30d(marketData24h, marketData7d);
    const volume24h = this.calculateVolume24h(marketData24h);
    const volume7d = this.calculateVolume7d(marketData7d);
    const marketCap = this.calculateMarketCap(
      price,
      token.maxSupply,
      token.decimal,
    );
    const veryLowVolume = this.isVeryLowVolume(volume24h);
    const marketCapUnverified = this.isMarketCapUnverified(marketCap, volume7d);

    return {
      exchanges,
      price,
      change24h,
      change7d,
      change30d,
      volume24h,
      marketCap,
      marketCapUnverified,
      veryLowVolume,
      floorPriceKas: token.floorPriceKas ?? null,
      priceSource: 'exchange',
    };
  }

  /**
   * Get aggregated market data for a token
   * @param identifier Token identifier
   * @param token Token entity (for MaximumSupply calculation)
   * @returns Aggregated market data matching Kaspa Lens format
   */
  async getAggregatedMarketData(
    identifier: string,
    token: TokenEntity,
  ): Promise<AggregatedMarketData | null> {
    const marketData24h =
      await this.exchangesRepository.findMarketData24hByIdentifier(identifier);
    const marketData7d =
      await this.exchangesRepository.findMarketData7dByIdentifier(identifier);

    if (marketData24h.length === 0) {
      if (token.floorPriceUsd) {
        return this.buildFloorPriceOnlyAggregated(token);
      }
      return null;
    }

    return this.aggregateMarketDataFrom(marketData24h, marketData7d, token);
  }

  /**
   * Get aggregated market data for many tokens in 1–2 queries (batch).
   * Loads 24h data with WHERE token_identifier IN (...), optionally 7d klines for the same set, then groups in memory.
   * @param options.include7d When false, skips the 7d collection query (large). Root change7d/30d and per-exchange 7d fields are then minimal. Use for sorting pools where only 24h fields (e.g. change24h) are needed.
   * @param tokens Tokens to load market data for
   * @returns Map of identifier -> AggregatedMarketData | null (same order as tokens by identifier)
   */
  async getAggregatedMarketDataBatch(
    tokens: TokenEntity[],
    options?: { include7d?: boolean },
  ): Promise<Map<string, AggregatedMarketData | null>> {
    const result = new Map<string, AggregatedMarketData | null>();
    const identifiers = tokens
      .map((t) => t.identifier || t.ticker || t.name)
      .filter((id): id is string => !!id);
    if (identifiers.length === 0) {
      return result;
    }

    const include7d = options?.include7d !== false;
    const uniqueIds = [...new Set(identifiers)];
    const [all24h, all7d] = await Promise.all([
      this.loadMarketData24hChunked(uniqueIds),
      include7d
        ? this.loadMarketData7dChunked(uniqueIds)
        : Promise.resolve([] as ExchangeMarketData7dWithExchange[]),
    ]);

    const byId24h = new Map<string, ExchangeMarketData24hEntity[]>();
    const byId7d = new Map<string, ExchangeMarketData7dEntity[]>();
    for (const row of all24h) {
      const id = row.tokenIdentifier;
      if (!byId24h.has(id)) byId24h.set(id, []);
      byId24h.get(id)!.push(row);
    }
    for (const row of all7d) {
      const id = row.tokenIdentifier;
      if (!byId7d.has(id)) byId7d.set(id, []);
      byId7d.get(id)!.push(row);
    }

    const tokenByIdentifier = new Map<string, TokenEntity>();
    for (const t of tokens) {
      const id = t.identifier || t.ticker || t.name;
      if (id && !tokenByIdentifier.has(id)) {
        tokenByIdentifier.set(id, t);
      }
    }

    for (const identifier of uniqueIds) {
      const token = tokenByIdentifier.get(identifier);
      if (!token) continue;

      const marketData24h = byId24h.get(identifier) || [];
      const marketData7d = byId7d.get(identifier) || [];

      if (marketData24h.length === 0) {
        if (token.floorPriceUsd) {
          result.set(identifier, this.buildFloorPriceOnlyAggregated(token));
        } else {
          result.set(identifier, null);
        }
      } else {
        result.set(
          identifier,
          this.aggregateMarketDataFrom(marketData24h, marketData7d, token),
        );
      }
    }

    return result;
  }

  /**
   * Calculate best price (highest volume exchange, or average if volumes are similar)
   */
  private calculatePrice(marketData: ExchangeMarketData24hEntity[]): string {
    if (marketData.length === 0) return '0';
    if (marketData.length === 1) return marketData[0].price;

    // Find exchange with highest volume
    const highestVolume = marketData.reduce((max, data) => {
      const volume = parseFloat(data.volume24h || '0');
      const maxVolume = parseFloat(max.volume24h || '0');
      return volume > maxVolume ? data : max;
    }, marketData[0]);

    return highestVolume.price;
  }

  /**
   * Calculate 24h change (simple average of all exchanges)
   */
  private calculateChange24h(
    marketData: ExchangeMarketData24hEntity[],
  ): string {
    if (marketData.length === 0) return '0';
    if (marketData.length === 1) return marketData[0].change24h;

    // Simple average: sum of all exchange changes / number of exchanges
    const sum = marketData.reduce(
      (acc, data) => acc + parseFloat(data.change24h || '0'),
      0,
    );
    const avg = sum / marketData.length;
    return avg.toFixed(2);
  }

  /**
   * Calculate 7d change for a single exchange
   * Formula: ((current_price - price_7d_ago) / price_7d_ago) × 100
   */
  private calculateExchangeChange7d(
    marketData24h: ExchangeMarketData24hEntity,
    marketData7d: ExchangeMarketData7dEntity[],
  ): string | undefined {
    if (marketData7d.length === 0) {
      return undefined;
    }

    const currentPrice = parseFloat(marketData24h.price || '0');
    if (currentPrice === 0) {
      return undefined;
    }

    // Sort by date (oldest first)
    const sortedCandles = [...marketData7d].sort((a, b) => {
      const dateA =
        a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
      const dateB =
        b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
      return dateA - dateB;
    });

    // Get price from oldest candle (7 days ago)
    const price7dAgo = parseFloat(
      sortedCandles[0].close || sortedCandles[0].open || '0',
    );
    if (price7dAgo === 0) {
      return undefined;
    }

    // Calculate change: (current_price - price_7d_ago) / price_7d_ago × 100
    const change = ((currentPrice - price7dAgo) / price7dAgo) * 100;
    return change.toFixed(2);
  }

  private calculateExchangeChange30d(
    marketData24h: ExchangeMarketData24hEntity,
    marketData7d: ExchangeMarketData7dEntity[],
  ): string | undefined {
    if (marketData7d.length === 0) {
      return undefined;
    }

    const currentPrice = parseFloat(marketData24h.price || '0');
    if (currentPrice === 0) {
      return undefined;
    }

    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const MAX_STALENESS_MS = 2 * 24 * 60 * 60 * 1000;
    const MIN_CANDLES_30D = 20;

    const recentCandlesWithTs = marketData7d
      .map((candle) => {
        const ts =
          candle.date instanceof Date
            ? candle.date.getTime()
            : new Date(candle.date).getTime();
        return { candle, ts };
      })
      .filter(({ ts }) => now - ts <= THIRTY_DAYS_MS);

    if (recentCandlesWithTs.length < MIN_CANDLES_30D) {
      return undefined;
    }

    const mostRecentTs = Math.max(
      ...recentCandlesWithTs.map((entry) => entry.ts),
    );
    if (now - mostRecentTs > MAX_STALENESS_MS) {
      return undefined;
    }

    const sortedRecent = [...recentCandlesWithTs].sort((a, b) => {
      return a.ts - b.ts;
    });

    const oldest = sortedRecent[0].candle;
    const price30dAgo = parseFloat(oldest.close || oldest.open || '0');
    if (price30dAgo === 0) {
      return undefined;
    }

    const change = ((currentPrice - price30dAgo) / price30dAgo) * 100;
    return change.toFixed(2);
  }

  /**
   * Calculate 7d change from K-line data (simple average of all exchanges)
   * Formula: Simple average of all exchange 7d changes
   */
  private calculateChange7d(
    marketData24h: ExchangeMarketData24hEntity[],
    marketData7d: ExchangeMarketData7dEntity[],
  ): string | null {
    if (marketData7d.length === 0 || marketData24h.length === 0) return null;

    // Create a map of exchange ID to 24h data (for current price)
    const exchange24hMap = new Map<string, ExchangeMarketData24hEntity>();
    for (const data of marketData24h) {
      exchange24hMap.set(data.exchangeId, data);
    }

    // Group 7d data by exchange
    const exchangeGroups = new Map<string, ExchangeMarketData7dEntity[]>();

    for (const data of marketData7d) {
      const key = data.exchangeId;
      if (!exchangeGroups.has(key)) {
        exchangeGroups.set(key, []);
      }
      exchangeGroups.get(key)!.push(data);
    }

    // Calculate 7d change for each exchange and collect them
    const exchangeChanges: number[] = [];
    const targetMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const [exchangeId, candles] of exchangeGroups) {
      if (candles.length === 0) continue;

      // Get current price for this exchange
      const exchange24h = exchange24hMap.get(exchangeId);
      if (!exchange24h) continue;

      const currentPriceExchange = parseFloat(exchange24h.price || '0');
      if (currentPriceExchange === 0) continue;

      const sortedCandles = [...candles].sort((a, b) => {
        const dateA = this.candleTimestampMs(a);
        const dateB = this.candleTimestampMs(b);
        if (!Number.isFinite(dateA) && !Number.isFinite(dateB)) return 0;
        if (!Number.isFinite(dateA)) return 1;
        if (!Number.isFinite(dateB)) return -1;
        return dateA - dateB;
      });

      const referenceCandle = this.pickReferenceCandleForLookback(
        sortedCandles,
        targetMs,
      );
      if (!referenceCandle) continue;

      const referencePrice = this.parseReferencePrice(referenceCandle);
      if (referencePrice === null) continue;

      // Calculate change for this exchange: (current_price - price_7d_ago) / price_7d_ago × 100
      const change =
        ((currentPriceExchange - referencePrice) / referencePrice) * 100;
      exchangeChanges.push(change);
    }

    if (exchangeChanges.length === 0) return null;

    // Return simple average: sum of all exchange changes / number of exchanges
    const sum = exchangeChanges.reduce((acc, change) => acc + change, 0);
    const avg = sum / exchangeChanges.length;
    return avg.toFixed(2);
  }

  private candleTimestampMs(candle: ExchangeMarketData7dEntity): number {
    const raw = candle.date;
    const date = raw instanceof Date ? raw : new Date(raw);
    const ts = date.getTime();
    return Number.isFinite(ts) ? ts : NaN;
  }

  private parseReferencePrice(candle: ExchangeMarketData7dEntity): number | null {
    const close = parseFloat(candle.close || '0');
    if (Number.isFinite(close) && close > 0) {
      return close;
    }
    const open = parseFloat(candle.open || '0');
    if (Number.isFinite(open) && open > 0) {
      return open;
    }
    return null;
  }

  private pickReferenceCandleForLookback(
    sortedCandles: ExchangeMarketData7dEntity[],
    targetMs: number,
  ): ExchangeMarketData7dEntity | null {
    if (sortedCandles.length === 0) return null;

    let atOrBefore: ExchangeMarketData7dEntity | null = null;
    for (const candle of sortedCandles) {
      const ts = this.candleTimestampMs(candle);
      if (!Number.isFinite(ts)) continue;
      if (ts <= targetMs) {
        atOrBefore = candle;
      } else {
        break;
      }
    }
    if (atOrBefore) return atOrBefore;

    for (const candle of sortedCandles) {
      const ts = this.candleTimestampMs(candle);
      if (!Number.isFinite(ts)) continue;
      if (ts > targetMs) {
        return candle;
      }
    }

    return sortedCandles[0] ?? null;
  }

  private calculateChange30d(
    marketData24h: ExchangeMarketData24hEntity[],
    marketData7d: ExchangeMarketData7dEntity[],
  ): string | null {
    if (marketData7d.length === 0 || marketData24h.length === 0) {
      return null;
    }

    const exchange24hMap = new Map<string, ExchangeMarketData24hEntity>();
    for (const data of marketData24h) {
      exchange24hMap.set(data.exchangeId, data);
    }

    const exchangeGroups = new Map<string, ExchangeMarketData7dEntity[]>();
    for (const data of marketData7d) {
      const key = data.exchangeId;
      if (!exchangeGroups.has(key)) {
        exchangeGroups.set(key, []);
      }
      exchangeGroups.get(key)!.push(data);
    }

    const exchangeChanges: number[] = [];

    for (const [exchangeId, candles] of exchangeGroups) {
      if (candles.length === 0) continue;

      const exchange24h = exchange24hMap.get(exchangeId);
      if (!exchange24h) continue;

      const change = this.calculateExchangeChange30d(exchange24h, candles);
      if (change === undefined) continue;

      const num = parseFloat(change);
      if (Number.isNaN(num)) continue;
      exchangeChanges.push(num);
    }

    if (exchangeChanges.length === 0) {
      return null;
    }

    const sum = exchangeChanges.reduce((acc, value) => acc + value, 0);
    const avg = sum / exchangeChanges.length;
    return avg.toFixed(2);
  }

  /**
   * Calculate total 24h volume (SUM of all exchange volumes)
   */
  private calculateVolume24h(
    marketData: ExchangeMarketData24hEntity[],
  ): string {
    const total = marketData.reduce((sum, data) => {
      return sum + parseFloat(data.volume24h || '0');
    }, 0);

    return total.toFixed(2);
  }

  /**
   * Calculate market cap: Price × (MaximumSupply / 10^decimals)
   * maxSupply is stored in smallest unit, need to divide by 10^decimals
   */
  private calculateMarketCap(
    price: string,
    maxSupply: string,
    decimals: string = '8',
  ): string {
    const priceNum = parseFloat(price || '0');
    const supplyNum = parseFloat(maxSupply || '0');
    const decimalsNum = parseFloat(decimals || '8');

    if (priceNum === 0 || supplyNum === 0) return '0';

    // Convert maxSupply from smallest unit to actual token count
    const actualSupply = supplyNum / Math.pow(10, decimalsNum);
    const marketCap = priceNum * actualSupply;
    return marketCap.toFixed(2);
  }

  /**
   * Calculate 7-day volume from K-line data
   */
  private calculateVolume7d(
    marketData7d: ExchangeMarketData7dEntity[],
  ): string {
    if (marketData7d.length === 0) return '0';

    const totalVolume = marketData7d.reduce((sum, data) => {
      return sum + parseFloat(data.volume || '0');
    }, 0);

    return totalVolume.toFixed(2);
  }

  /**
   * Check if volume is very low (less than $1000)
   */
  private isVeryLowVolume(volume24h: string): boolean {
    const volume = parseFloat(volume24h || '0');
    return volume < 1000;
  }

  /**
   * Check if market cap is unverified (Kaspa Lens logic)
   * Market cap is unverified if: market cap > $100,000 AND 7d volume < $1,000
   * OR market cap is extremely high (> $1B) with low volume ratio
   */
  private isMarketCapUnverified(marketCap: string, volume7d: string): boolean {
    const cap = parseFloat(marketCap || '0');
    const volume = parseFloat(volume7d || '0');

    // Standard check: market cap > $100K AND 7d volume < $1K
    if (cap > 100000 && volume < 1000) {
      return true;
    }

    // Additional check for extremely high market caps with suspiciously low volume
    // If market cap > $1B and volume/market cap ratio < 0.001 (0.1%), mark as unverified
    if (cap > 1000000000) {
      const volumeRatio = volume / cap;
      if (volumeRatio < 0.00001) {
        // Volume is less than 0.001% of market cap - suspicious
        return true;
      }
    }

    return false;
  }

  /** Parse kline `date` from Mongo (Date, ISO string, or epoch ms). */
  private candleTimeMs(c: { date: unknown }): number {
    const v = c.date;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const t = Date.parse(v);
      return Number.isNaN(t) ? NaN : t;
    }
    if (v == null) return NaN;
    const t = new Date(v as string | number | Date).getTime();
    return Number.isNaN(t) ? NaN : t;
  }

  /** Drop rows with non-finite OHLC or negative volume. */
  private chartRowInvalid(c: ChartRawKlineRow): boolean {
    const o = parseFloat(c.open);
    const h = parseFloat(c.high);
    const l = parseFloat(c.low);
    const cl = parseFloat(c.close);
    const v = parseFloat(c.volume ?? '0');
    if (![o, h, l, cl].every((x) => Number.isFinite(x))) return true;
    if (!Number.isFinite(v) || v < 0) return true;
    return false;
  }

  private chartLatestAnchorMs(
    grouped: Array<{ candles?: ChartRawKlineRow[] }>,
  ): number {
    let max = 0;
    for (const g of grouped) {
      for (const c of g.candles || []) {
        const t = this.candleTimeMs(c);
        if (!Number.isNaN(t)) max = Math.max(max, t);
      }
    }
    return max > 0 ? max : Date.now();
  }

  private chartOldestMs(
    grouped: Array<{ candles?: ChartRawKlineRow[] }>,
  ): number | null {
    let oldest = Number.POSITIVE_INFINITY;
    for (const g of grouped) {
      for (const c of g.candles || []) {
        const t = this.candleTimeMs(c);
        if (!Number.isNaN(t)) oldest = Math.min(oldest, t);
      }
    }
    return Number.isFinite(oldest) ? oldest : null;
  }

  private chartSortRaw(raw: ChartRawKlineRow[]): ChartRawKlineRow[] {
    return [...raw].sort(
      (a, b) => this.candleTimeMs(a) - this.candleTimeMs(b),
    );
  }

  private chartFilterYtdRaw(raw: ChartRawKlineRow[]): ChartRawKlineRow[] {
    const startOfCurrentUtcYear = Date.UTC(
      new Date().getUTCFullYear(),
      0,
      1,
    );
    let ytdCandles = raw.filter((c) => {
      const t = this.candleTimeMs(c);
      return !Number.isNaN(t) && t >= startOfCurrentUtcYear;
    });
    if (ytdCandles.length === 0 && raw.length > 0) {
      const times = raw
        .map((c) => this.candleTimeMs(c))
        .filter((t) => !Number.isNaN(t));
      if (times.length > 0) {
        const maxT = Math.max(...times);
        const y = new Date(maxT).getUTCFullYear();
        const startThatYear = Date.UTC(y, 0, 1);
        ytdCandles = raw.filter((c) => {
          const t = this.candleTimeMs(c);
          return !Number.isNaN(t) && t >= startThatYear;
        });
      }
    }
    if (ytdCandles.length === 0) {
      ytdCandles = raw.slice(-365);
    }
    return ytdCandles;
  }

  /**
   * Interval resolver: defines source table, explicit time window, and target bucket size.
   * Note: 1d prefers 30m in CoinGecko, but current backend source granularity is 1h.
   */
  private chartResolveIntervalPlan(
    interval: ChartInterval,
    nowMs: number,
  ): ChartIntervalPlan {
    const utcYearStartMs = Date.UTC(new Date(nowMs).getUTCFullYear(), 0, 1);

    switch (interval) {
      case '1h':
        return {
          source: 'hourly',
          bucket: 'hourly',
          fromMs: nowMs - CHART_HOUR_MS,
          toMs: nowMs,
        };
      case '1d':
        return {
          source: 'hourly',
          bucket: 'hourly',
          fromMs: nowMs - CHART_DAY_MS,
          toMs: nowMs,
        };
      case '7d':
        return {
          source: 'hourly',
          bucket: 'hourly',
          fromMs: nowMs - 7 * CHART_DAY_MS,
          toMs: nowMs,
        };
      case '1M':
        return {
          source: 'hourly',
          bucket: 'hourly',
          fromMs: nowMs - 30 * CHART_DAY_MS,
          toMs: nowMs,
        };
      case '3M':
        return {
          source: 'hourly',
          bucket: 'fourHour',
          fromMs: nowMs - 90 * CHART_DAY_MS,
          toMs: nowMs,
        };
      case 'ytd':
        return {
          source: 'longRange',
          bucket: 'daily',
          fromMs: utcYearStartMs,
          toMs: nowMs,
        };
      case '1Y':
        return {
          source: 'longRange',
          bucket: 'daily',
          fromMs: nowMs - 365 * CHART_DAY_MS,
          toMs: nowMs,
        };
      case 'max':
      default:
        return {
          source: 'longRange',
          bucket: 'fourDay',
          fromMs: null,
          toMs: nowMs,
        };
    }
  }

  /** Explicitly enforce interval range; max uses full available history. */
  private chartFilterRawByRange(
    raw: ChartRawKlineRow[],
    fromMs: number | null,
    toMs: number,
  ): ChartRawKlineRow[] {
    return raw.filter((c) => {
      const t = this.candleTimeMs(c);
      if (Number.isNaN(t)) return false;
      if (fromMs !== null && t < fromMs) return false;
      if (t > toMs) return false;
      return true;
    });
  }

  /** One bar per UTC hour; timestamp = hour end (closest to candle “close”). */
  private chartHourlyBucketsFromRaw(raw: ChartRawKlineRow[]): ChartBucket[] {
    const groups = new Map<number, ChartRawKlineRow[]>();
    for (const c of raw) {
      if (this.chartRowInvalid(c)) continue;
      const t = this.candleTimeMs(c);
      if (Number.isNaN(t)) continue;
      const start = Math.floor(t / CHART_HOUR_MS) * CHART_HOUR_MS;
      if (!groups.has(start)) groups.set(start, []);
      groups.get(start)!.push(c);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const out: ChartBucket[] = [];
    for (const start of keys) {
      const arr = this.chartSortRaw(groups.get(start)!);
      const o = arr[0].open;
      const cl = arr[arr.length - 1].close;
      const high = Math.max(
        ...arr.map((x) => parseFloat(x.high) || 0),
      );
      const low = Math.min(
        ...arr.map((x) => parseFloat(x.low) || 0),
      );
      const vol = arr.reduce(
        (s, x) => s + (parseFloat(x.volume ?? '0') || 0),
        0,
      );
      out.push({
        bucketEndMs: start + CHART_HOUR_MS,
        open: o,
        high: String(high),
        low: String(low),
        close: cl,
        volume: String(vol),
      });
    }
    return out;
  }

  /**
   * Keep source granularity (e.g. 1m/5m/15m) for 1h view.
   * Rows are normalized to minute boundaries so cross-exchange merge remains deterministic.
   */
  private chartNativeSmallBucketsFromRaw(raw: ChartRawKlineRow[]): ChartBucket[] {
    const groups = new Map<number, ChartRawKlineRow[]>();
    for (const c of raw) {
      if (this.chartRowInvalid(c)) continue;
      const t = this.candleTimeMs(c);
      if (Number.isNaN(t)) continue;
      const start = Math.floor(t / CHART_MINUTE_MS) * CHART_MINUTE_MS;
      if (!groups.has(start)) groups.set(start, []);
      groups.get(start)!.push(c);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const out: ChartBucket[] = [];
    for (const start of keys) {
      const arr = this.chartSortRaw(groups.get(start)!);
      const o = arr[0].open;
      const cl = arr[arr.length - 1].close;
      const high = Math.max(...arr.map((x) => parseFloat(x.high) || 0));
      const low = Math.min(...arr.map((x) => parseFloat(x.low) || 0));
      const vol = arr.reduce(
        (s, x) => s + (parseFloat(x.volume ?? '0') || 0),
        0,
      );
      out.push({
        bucketEndMs: start + CHART_MINUTE_MS,
        open: o,
        high: String(high),
        low: String(low),
        close: cl,
        volume: String(vol),
      });
    }
    return out;
  }

  /** Aggregate raw rows into fixed UTC minute buckets (used by 1d chart path). */
  private chartMinuteBucketsFromRaw(
    raw: ChartRawKlineRow[],
    bucketMs: number,
  ): ChartBucket[] {
    const groups = new Map<number, ChartRawKlineRow[]>();
    for (const c of raw) {
      if (this.chartRowInvalid(c)) continue;
      const t = this.candleTimeMs(c);
      if (Number.isNaN(t)) continue;
      const start = Math.floor(t / bucketMs) * bucketMs;
      if (!groups.has(start)) groups.set(start, []);
      groups.get(start)!.push(c);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const out: ChartBucket[] = [];
    for (const start of keys) {
      const arr = this.chartSortRaw(groups.get(start)!);
      const o = arr[0].open;
      const cl = arr[arr.length - 1].close;
      const high = Math.max(...arr.map((x) => parseFloat(x.high) || 0));
      const low = Math.min(...arr.map((x) => parseFloat(x.low) || 0));
      const vol = arr.reduce(
        (s, x) => s + (parseFloat(x.volume ?? '0') || 0),
        0,
      );
      out.push({
        bucketEndMs: start + bucketMs,
        open: o,
        high: String(high),
        low: String(low),
        close: cl,
        volume: String(vol),
      });
    }
    return out;
  }

  /**
   * 1d granularity selector (CoinGecko-like preference):
   * prefer 5m, then 15m, then 30m, else 1h when source is too coarse.
   */
  private chartResolve1dBucketMs(raw: ChartRawKlineRow[]): number {
    const sorted = this.chartSortRaw(raw).filter((c) => !this.chartRowInvalid(c));
    let minDelta = Number.POSITIVE_INFINITY;
    for (let i = 1; i < sorted.length; i++) {
      const prev = this.candleTimeMs(sorted[i - 1]);
      const curr = this.candleTimeMs(sorted[i]);
      if (Number.isNaN(prev) || Number.isNaN(curr)) continue;
      const d = curr - prev;
      if (d > 0) minDelta = Math.min(minDelta, d);
    }
    if (!Number.isFinite(minDelta)) return CHART_HOUR_MS;
    if (minDelta <= CHART_MINUTE_MS) return CHART_MINUTE_MS;
    if (minDelta <= CHART_FIVE_MINUTE_MS) return CHART_FIVE_MINUTE_MS;
    if (minDelta <= CHART_FIFTEEN_MINUTE_MS) return CHART_FIFTEEN_MINUTE_MS;
    if (minDelta <= CHART_THIRTY_MINUTE_MS) return CHART_THIRTY_MINUTE_MS;
    return CHART_HOUR_MS;
  }

  /** 1d cleaning: invalid/zero rows removed, timestamp duplicates collapsed, obvious flat noise dropped. */
  private chartClean1dRaw(raw: ChartRawKlineRow[]): ChartRawKlineRow[] {
    const sorted = this.chartSortRaw(raw);
    const dedup = new Map<number, ChartRawKlineRow>();
    for (const c of sorted) {
      const t = this.candleTimeMs(c);
      if (Number.isNaN(t)) continue;
      const o = parseFloat(c.open);
      const h = parseFloat(c.high);
      const l = parseFloat(c.low);
      const cl = parseFloat(c.close);
      const v = parseFloat(c.volume ?? '0');
      if (![o, h, l, cl, v].every((x) => Number.isFinite(x))) continue;
      if (o <= 0 || h <= 0 || l <= 0 || cl <= 0) continue;
      if (v < 0) continue;
      const prev = dedup.get(t);
      if (!prev) {
        dedup.set(t, c);
        continue;
      }
      const prevVol = parseFloat(prev.volume ?? '0');
      if ((Number.isFinite(v) ? v : 0) >= (Number.isFinite(prevVol) ? prevVol : 0)) {
        dedup.set(t, c);
      }
    }
    const compact = [...dedup.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => c);
    const out: ChartRawKlineRow[] = [];
    let prev: ChartRawKlineRow | null = null;
    for (const c of compact) {
      if (!prev) {
        out.push(c);
        prev = c;
        continue;
      }
      const sameOhlc =
        c.open === prev.open &&
        c.high === prev.high &&
        c.low === prev.low &&
        c.close === prev.close;
      const v = parseFloat(c.volume ?? '0');
      const pv = parseFloat(prev.volume ?? '0');
      if (sameOhlc && v === 0 && pv === 0) continue;
      out.push(c);
      prev = c;
    }
    return out;
  }

  private chartMedian(values: number[]): number | null {
    const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 1) return nums[mid];
    return (nums[mid - 1] + nums[mid]) / 2;
  }

  /** 1d root combiner: median OHLCV across exchanges per aligned bucket end. */
  private chartMedianMergeBuckets(
    perExchange: ChartBucket[][],
  ): ChartBucket[] {
    const byEnd = new Map<number, ChartBucket[]>();
    for (const series of perExchange) {
      for (const b of series) {
        if (!Number.isFinite(b.bucketEndMs)) continue;
        if (!byEnd.has(b.bucketEndMs)) byEnd.set(b.bucketEndMs, []);
        byEnd.get(b.bucketEndMs)!.push(b);
      }
    }
    const out: ChartBucket[] = [];
    const ends = [...byEnd.keys()].sort((a, b) => a - b);
    for (const end of ends) {
      const group = byEnd.get(end) ?? [];
      const opens = group
        .map((b) => parseFloat(b.open))
        .filter((v) => Number.isFinite(v) && v > 0);
      const highs = group
        .map((b) => parseFloat(b.high))
        .filter((v) => Number.isFinite(v) && v > 0);
      const lows = group
        .map((b) => parseFloat(b.low))
        .filter((v) => Number.isFinite(v) && v > 0);
      const closes = group
        .map((b) => parseFloat(b.close))
        .filter((v) => Number.isFinite(v) && v > 0);
      const volumes = group
        .map((b) => parseFloat(b.volume))
        .filter((v) => Number.isFinite(v) && v >= 0);
      const o = this.chartMedian(opens);
      const h = this.chartMedian(highs);
      const l = this.chartMedian(lows);
      const cl = this.chartMedian(closes);
      const vol = this.chartMedian(volumes);
      if (o === null || h === null || l === null || cl === null || vol === null) {
        continue;
      }
      out.push({
        bucketEndMs: end,
        open: String(o),
        high: String(h),
        low: String(l),
        close: String(cl),
        volume: String(vol),
      });
    }
    return out;
  }

  /** Aggregate existing buckets into larger UTC buckets (e.g. 1m -> 5m). */
  private chartResampleBuckets(
    buckets: ChartBucket[],
    targetBucketMs: number,
  ): ChartBucket[] {
    const groups = new Map<number, ChartBucket[]>();
    for (const b of buckets) {
      if (!Number.isFinite(b.bucketEndMs)) continue;
      const t = b.bucketEndMs - 1;
      const start = Math.floor(t / targetBucketMs) * targetBucketMs;
      if (!groups.has(start)) groups.set(start, []);
      groups.get(start)!.push(b);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const out: ChartBucket[] = [];
    for (const start of keys) {
      const arr = [...(groups.get(start) ?? [])].sort(
        (a, b) => a.bucketEndMs - b.bucketEndMs,
      );
      if (arr.length === 0) continue;
      const o = parseFloat(arr[0].open);
      const cl = parseFloat(arr[arr.length - 1].close);
      const high = Math.max(...arr.map((x) => parseFloat(x.high) || 0));
      const low = Math.min(...arr.map((x) => parseFloat(x.low) || 0));
      const vol = arr.reduce((s, x) => s + (parseFloat(x.volume) || 0), 0);
      if (![o, cl, high, low, vol].every((v) => Number.isFinite(v))) continue;
      out.push({
        bucketEndMs: start + targetBucketMs,
        open: String(o),
        high: String(high),
        low: String(low),
        close: String(cl),
        volume: String(vol),
      });
    }
    return out;
  }

  /** Aggregate 1h rows into 4h bars (UTC buckets). */
  private chartFourHourBucketsFromRaw(raw: ChartRawKlineRow[]): ChartBucket[] {
    const groups = new Map<number, ChartRawKlineRow[]>();
    for (const c of raw) {
      if (this.chartRowInvalid(c)) continue;
      const t = this.candleTimeMs(c);
      if (Number.isNaN(t)) continue;
      const start4 =
        Math.floor(t / CHART_FOUR_HOUR_MS) * CHART_FOUR_HOUR_MS;
      if (!groups.has(start4)) groups.set(start4, []);
      groups.get(start4)!.push(c);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const out: ChartBucket[] = [];
    for (const start4 of keys) {
      const arr = this.chartSortRaw(groups.get(start4)!);
      const o = arr[0].open;
      const cl = arr[arr.length - 1].close;
      const high = Math.max(
        ...arr.map((x) => parseFloat(x.high) || 0),
      );
      const low = Math.min(
        ...arr.map((x) => parseFloat(x.low) || 0),
      );
      const vol = arr.reduce(
        (s, x) => s + (parseFloat(x.volume ?? '0') || 0),
        0,
      );
      out.push({
        bucketEndMs: start4 + CHART_FOUR_HOUR_MS,
        open: o,
        high: String(high),
        low: String(low),
        close: cl,
        volume: String(vol),
      });
    }
    return out;
  }

  /** Aggregate rows into 1-day UTC buckets. */
  private chartDailyBucketsFromRaw(raw: ChartRawKlineRow[]): ChartBucket[] {
    const groups = new Map<number, ChartRawKlineRow[]>();
    for (const c of raw) {
      if (this.chartRowInvalid(c)) continue;
      const t = this.candleTimeMs(c);
      if (Number.isNaN(t)) continue;
      const startDay = Math.floor(t / CHART_DAY_MS) * CHART_DAY_MS;
      if (!groups.has(startDay)) groups.set(startDay, []);
      groups.get(startDay)!.push(c);
    }
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const out: ChartBucket[] = [];
    for (const startDay of keys) {
      const arr = this.chartSortRaw(groups.get(startDay)!);
      const o = arr[0].open;
      const cl = arr[arr.length - 1].close;
      const high = Math.max(...arr.map((x) => parseFloat(x.high) || 0));
      const low = Math.min(...arr.map((x) => parseFloat(x.low) || 0));
      const vol = arr.reduce(
        (s, x) => s + (parseFloat(x.volume ?? '0') || 0),
        0,
      );
      out.push({
        bucketEndMs: startDay + CHART_DAY_MS,
        open: o,
        high: String(high),
        low: String(low),
        close: cl,
        volume: String(vol),
      });
    }
    return out;
  }

  /** Chunk sorted daily rows into groups of 4; incomplete tail still forms one bar. */
  private chartFourDayBucketsFromDailyRaw(
    raw: ChartRawKlineRow[],
  ): ChartBucket[] {
    const sorted = this.chartSortRaw(raw).filter(
      (c) => !this.chartRowInvalid(c),
    );
    const out: ChartBucket[] = [];
    for (let i = 0; i < sorted.length; i += 4) {
      const chunk = sorted.slice(i, i + 4);
      if (chunk.length === 0) break;
      const last = chunk[chunk.length - 1];
      const ld = last.date instanceof Date ? last.date : new Date(last.date);
      const lastDayStart = Date.UTC(
        ld.getUTCFullYear(),
        ld.getUTCMonth(),
        ld.getUTCDate(),
      );
      const bucketEndMs = lastDayStart + CHART_DAY_MS;
      const o = chunk[0].open;
      const cl = last.close;
      const high = Math.max(
        ...chunk.map((x) => parseFloat(x.high) || 0),
      );
      const low = Math.min(
        ...chunk.map((x) => parseFloat(x.low) || 0),
      );
      const vol = chunk.reduce(
        (s, x) => s + (parseFloat(x.volume ?? '0') || 0),
        0,
      );
      out.push({
        bucketEndMs,
        open: o,
        high: String(high),
        low: String(low),
        close: cl,
        volume: String(vol),
      });
    }
    return out;
  }

  private chartBucketToApi(b: ChartBucket): {
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  } {
    return {
      timestamp: new Date(b.bucketEndMs).toISOString(),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    };
  }

  /** Final payload-level range guard (used for strict 1h response enforcement). */
  private chartFilterApiCandlesByRange(
    candles: Array<{
      timestamp: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
    fromMs: number,
    toMs: number,
  ): Array<{
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }> {
    return candles.filter((c) => {
      const t = Date.parse(c.timestamp);
      return !Number.isNaN(t) && t >= fromMs && t <= toMs;
    });
  }


  /** Same bucketEndMs across exchanges: VWAP open/close, max high, min low, sum volume. */
  private chartMergeRootFromBuckets(
    perExchange: ChartBucket[][],
  ): Array<{
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }> {
    const byEnd = new Map<number, ChartBucket[]>();
    for (const series of perExchange) {
      for (const b of series) {
        if (!Number.isFinite(b.bucketEndMs)) continue;
        if (!byEnd.has(b.bucketEndMs)) byEnd.set(b.bucketEndMs, []);
        byEnd.get(b.bucketEndMs)!.push(b);
      }
    }
    const ends = [...byEnd.keys()].sort((a, b) => a - b);
    const merged: Array<{
      timestamp: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }> = [];
    for (const endMs of ends) {
      const group = byEnd.get(endMs)!;
      const vols = group.map((b) => parseFloat(b.volume) || 0);
      const sumV = vols.reduce((s, v) => s + v, 0);
      const opens = group.map((b) => parseFloat(b.open));
      const closes = group.map((b) => parseFloat(b.close));
      let openW: number;
      let closeW: number;
      if (sumV > 0) {
        openW =
          group.reduce(
            (s, b, i) => s + (parseFloat(b.open) || 0) * vols[i],
            0,
          ) / sumV;
        closeW =
          group.reduce(
            (s, b, i) => s + (parseFloat(b.close) || 0) * vols[i],
            0,
          ) / sumV;
      } else {
        const fo = opens.filter((x) => Number.isFinite(x));
        const fc = closes.filter((x) => Number.isFinite(x));
        openW = fo.length ? fo.reduce((a, b) => a + b, 0) / fo.length : NaN;
        closeW = fc.length ? fc.reduce((a, b) => a + b, 0) / fc.length : NaN;
      }
      const high = Math.max(...group.map((b) => parseFloat(b.high) || 0));
      const low = Math.min(...group.map((b) => parseFloat(b.low) || 0));
      if (
        !Number.isFinite(openW) ||
        !Number.isFinite(closeW) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low)
      ) {
        continue;
      }
      merged.push({
        timestamp: new Date(endMs).toISOString(),
        open: String(openW),
        high: String(high),
        low: String(low),
        close: String(closeW),
        volume: String(sumV),
      });
    }
    return merged;
  }

  /**
   * Chart OHLC: per-exchange series rebucketed to a CoinGecko-style ladder where possible.
   * Root `candles` = volume-weighted open/close, max high, min low, sum volume across exchanges.
   * - 1d: ~48×1h (stored granularity; true 30m needs finer source data)
   * - 7d: 1h from 1h table
   * - 1M: 4h from 1h table
   * - 3M / ytd: 4d from long-range table
   * - 1Y / max: 4d from daily `max` history
   */
  async getChartData(
    identifier: string,
    interval: ChartInterval,
  ): Promise<ChartResponse | null> {
    const cached = this.getCachedChart(identifier, interval);
    if (cached !== undefined) {
      return cached;
    }

    const precomputed =
      await this.exchangesRepository.findAggregatedChartByTokenAndInterval(
        identifier,
        interval,
      );
    if (precomputed) {
      const response: ChartResponse = {
        interval,
        ticker: identifier,
        candles: precomputed.candles,
        byExchange: precomputed.byExchange,
      };
      this.setCachedChart(identifier, interval, response);
      return response;
    }

    // Fallback path: compute once, persist, and serve.
    const computed = await this.computeChartDataRuntime(identifier, interval);
    if (computed) {
      await this.exchangesRepository.upsertAggregatedChart(identifier, interval, {
        candles: computed.candles ?? [],
        byExchange: computed.byExchange ?? [],
      });
    }
    this.setCachedChart(identifier, interval, computed);
    return computed;
  }

  async precomputeChartData(
    identifier: string,
    interval: ChartInterval,
  ): Promise<ChartResponse | null> {
    const computed = await this.computeChartDataRuntime(identifier, interval);
    if (computed) {
      await this.exchangesRepository.upsertAggregatedChart(identifier, interval, {
        candles: computed.candles ?? [],
        byExchange: computed.byExchange ?? [],
      });
      this.setCachedChart(identifier, interval, computed);
    }
    return computed;
  }

  private async computeChartDataRuntime(
    identifier: string,
    interval: ChartInterval,
  ): Promise<ChartResponse | null> {
    const nowMs = Date.now();
    const plan = this.chartResolveIntervalPlan(interval, nowMs);
    let useHourlySource = plan.source === 'hourly';
    let effectiveBucket = plan.bucket;
    let grouped: Array<{
      exchangeCode: string;
      exchangeName: string;
      candles: ChartRawKlineRow[];
    }> = [];

    // Keep 3M at 4h when hourly depth is enough; fallback to long-range daily to preserve full 90d.
    if (interval === '3M' && useHourlySource) {
      const hourlyGrouped =
        await this.exchangesRepository.findMarketData1hByIdentifierGroupedByExchange(
          identifier,
        );
      const oldestHourly = this.chartOldestMs(
        hourlyGrouped as Array<{ candles?: ChartRawKlineRow[] }>,
      );
      const hasNinetyDayCoverage =
        plan.fromMs !== null &&
        oldestHourly !== null &&
        oldestHourly <= plan.fromMs;
      if (hasNinetyDayCoverage) {
        grouped = hourlyGrouped as Array<{
          exchangeCode: string;
          exchangeName: string;
          candles: ChartRawKlineRow[];
        }>;
      } else {
        useHourlySource = false;
        effectiveBucket = 'daily';
        grouped =
          await this.exchangesRepository.findMarketDataMaxByIdentifierGroupedByExchange(
            identifier,
          );
        if (grouped.length === 0) {
          grouped =
            await this.exchangesRepository.findMarketData1dByIdentifierGroupedByExchange(
              identifier,
            );
        }
      }
    } else {
      grouped = useHourlySource
        ? await this.exchangesRepository.findMarketData1hByIdentifierGroupedByExchange(
            identifier,
          )
        : await this.exchangesRepository.findMarketDataMaxByIdentifierGroupedByExchange(
            identifier,
          );

      if (grouped.length === 0 && plan.source === 'longRange') {
        grouped =
          await this.exchangesRepository.findMarketData1dByIdentifierGroupedByExchange(
            identifier,
          );
      }
    }

    if (grouped.length === 0) return null;

    if (interval === '1d') {
      const cleanedPerExchange = grouped.map((g) => {
        const rawAll: ChartRawKlineRow[] = (g.candles || []) as ChartRawKlineRow[];
        const raw = this.chartSortRaw(
          this.chartFilterRawByRange(rawAll, plan.fromMs, plan.toMs),
        );
        return this.chartClean1dRaw(raw);
      });
      const nonEmpty = cleanedPerExchange.filter((rows) => rows.length > 0);
      if (nonEmpty.length === 0) return null;
      const finestSourceMs = this.chartResolve1dBucketMs(nonEmpty.flat());
      const perExchangeAligned = cleanedPerExchange.map((rows) =>
        this.chartMinuteBucketsFromRaw(rows, finestSourceMs),
      );
      const mergedMedian = this.chartMedianMergeBuckets(perExchangeAligned);
      const rootResampled = this.chartResampleBuckets(
        mergedMedian,
        CHART_FIVE_MINUTE_MS,
      );
      const fromMs = nowMs - CHART_DAY_MS;
      const toMs = nowMs;
      const toApiAt5mBucketStart = (b: ChartBucket) =>
        this.chartBucketToApi({
          ...b,
          // 1d candles are 5m-resampled; expose bucket start so x-axis aligns to clean clock boundaries.
          bucketEndMs: b.bucketEndMs - CHART_FIVE_MINUTE_MS,
        });
      const rootCandles = this.chartFilterApiCandlesByRange(
        rootResampled.map((b) => toApiAt5mBucketStart(b)),
        fromMs,
        toMs,
      );
      const byExchange = grouped.map((g, i) => {
        const resampled = this.chartResampleBuckets(
          perExchangeAligned[i] ?? [],
          CHART_FIVE_MINUTE_MS,
        );
        return {
          exchangeCode: g.exchangeCode,
          exchangeName: g.exchangeName,
          candles: this.chartFilterApiCandlesByRange(
            resampled.map((b) => toApiAt5mBucketStart(b)),
            fromMs,
            toMs,
          ),
        };
      });
      return {
        interval,
        ticker: identifier,
        candles: rootCandles,
        byExchange,
      };
    }

    const perExchangeBuckets: ChartBucket[][] = [];

    for (const g of grouped) {
      const rawAll: ChartRawKlineRow[] = (g.candles || []) as ChartRawKlineRow[];
      const raw = this.chartSortRaw(
        this.chartFilterRawByRange(rawAll, plan.fromMs, plan.toMs),
      );

      if (useHourlySource) {
        const buckets =
          interval === '1h'
            ? this.chartNativeSmallBucketsFromRaw(raw)
            : effectiveBucket === 'hourly'
              ? this.chartHourlyBucketsFromRaw(raw)
              : this.chartFourHourBucketsFromRaw(raw);
        perExchangeBuckets.push(buckets);
      } else {
        const buckets =
          effectiveBucket === 'daily'
            ? this.chartDailyBucketsFromRaw(raw)
            : this.chartFourDayBucketsFromDailyRaw(raw);
        perExchangeBuckets.push(buckets);
      }
    }

    let byExchange = grouped.map((g, i) => ({
      exchangeCode: g.exchangeCode,
      exchangeName: g.exchangeName,
      candles: perExchangeBuckets[i].map((b) => this.chartBucketToApi(b)),
    }));

    let rootCandles = this.chartMergeRootFromBuckets(perExchangeBuckets);

    // Strict 1h guard: ensure final payload never leaks broader history.
    if (interval === '1h') {
      const fromMs = nowMs - CHART_HOUR_MS;
      const toMs = nowMs;
      rootCandles = this.chartFilterApiCandlesByRange(rootCandles, fromMs, toMs);
      byExchange = byExchange.map((ex) => ({
        ...ex,
        candles: this.chartFilterApiCandlesByRange(ex.candles, fromMs, toMs),
      }));
    }

    return {
      interval,
      ticker: identifier,
      candles: rootCandles,
      byExchange,
    };
  }
}
