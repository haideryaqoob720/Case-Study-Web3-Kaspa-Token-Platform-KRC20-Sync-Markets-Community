// Tokens Service: Business logic for token operations - fetches tokens from database,
//  aggregates market data from exchanges, handles caching

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance, instanceToPlain } from 'class-transformer';
import { GetTokensQueryDto } from './dto/get-tokens-query.dto';
import {
  GetTokensResponseDto,
  TokenResponseDto,
} from './dto/token-response.dto';
import { CacheService } from '../cache/cache.service';
import { TokensRepository } from './tokens.repository';
import {
  AggregatedMarketData,
  ExchangesService,
} from '../exchanges/services/exchanges.service';
import type { TokenEntity } from '../database/entities/token.entity';
import { WatchlistService } from '../watchlist/watchlist.service';
import { HolderSnapshotService } from '../holder-tracking/holder-snapshot.service';
import { CurrencyDto, ExchangeMarketDataDto } from './dto/market-data.dto';

/** When topGainers, topLosers, or trending=true, fetch this many tokens from DB to filter/sort by market data */
/**
 * Keep candidate pools bounded for secondary filters.
 * Large pools (e.g. 2.5k) cause heavy market-data fan-out and slow responses.
 */
const MARKET_DATA_POOL_SIZE = 100;
const TOP_MOVERS_POOL_SIZE = 200;
const MIN_VOLUME_24H_USD = 10_000;
const MIN_MARKET_CAP_USD = 50_000;
/** Min 24h volume for trending (avoid dust) */
const MIN_VOLUME_24H_TRENDING_USD = 5_000;
/** Min 24h volume for Top Today (avoid dust); token must have this to be considered */
const MIN_VOLUME_24H_TOP_TODAY_USD = 5_000;
/** Volume-leader threshold for Top Today: tokens with volume >= this are in list even without price gain */
const VOLUME_LEADER_24H_TOP_TODAY_USD = 10_000;
/** Market cap bracket thresholds (USD): small < SMALL_CAP_MAX, mid SMALL_CAP_MAX to MID_CAP_MAX, large >= MID_CAP_MAX */
const MARKET_CAP_SMALL_MAX_USD = 1_000_000;
const MARKET_CAP_MID_MAX_USD = 10_000_000;
/** Newness window: tokens deployed in last 48h get score boost (ms) */
const TRENDING_NEWNESS_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Trending score weights: V=volume, C=price change, T=holder growth */
const TRENDING_WEIGHT_V = 0.4;
const TRENDING_WEIGHT_C = 0.3;
const TRENDING_WEIGHT_T = 0.3;
const TRENDING_NEWNESS_MULTIPLIER = 1.1;

@Injectable()
export class TokensService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    private readonly tokensRepository: TokensRepository,
    private readonly cacheService: CacheService,
    private readonly exchangesService: ExchangesService,
    private readonly watchlistService: WatchlistService,
    private readonly holderSnapshotService: HolderSnapshotService,
    private readonly configService: ConfigService,
  ) {}

  /** Pre-compute the home-style list in Redis so the first real user often hits cache. */
  onApplicationBootstrap(): void {
    if (!this.cacheService.isAvailable()) {
      return;
    }
    if (process.env.TOKEN_LISTING_WARM_ON_BOOT === '0') {
      return;
    }
    const query: GetTokensQueryDto = {
      page: 1,
      limit: 100,
      sort: 'rank',
      order: 'asc',
    };
    setImmediate(() => {
      void this.findAll(query).catch((err) =>
        this.logger.debug(
          `Listing warm-up: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    });
  }

  /**
   * Convert raw token value (with decimals) to human-readable format
   * @param rawValue Raw value as string (e.g., "28700000000000000000")
   * @param decimal Decimal places as string (e.g., "8")
   * @returns Converted value as string (e.g., "287000000000")
   */
  private convertFromRawFormat(rawValue: string, decimal: string): string {
    if (!rawValue || rawValue === '0' || rawValue === '') {
      return '0';
    }

    const decimalValue = parseInt(decimal || '8', 10);
    if (isNaN(decimalValue) || decimalValue < 0 || decimalValue > 18) {
      // Invalid decimal, return original value
      return rawValue;
    }

    try {
      // Use BigInt for precision with large numbers
      const rawBigInt = BigInt(rawValue);
      const divisor = BigInt(10) ** BigInt(decimalValue);
      const result = rawBigInt / divisor;
      return result.toString();
    } catch (error) {
      // Fallback to parseFloat if BigInt fails
      this.logger.warn(
        `Failed to convert raw value ${rawValue} with decimal ${decimal}: ${error}`,
      );
      const rawNum = parseFloat(rawValue);
      const divisor = Math.pow(10, decimalValue);
      return (rawNum / divisor).toString();
    }
  }

  /**
   * Normalize deploy timestamp to seconds.
   * Some sources return Unix seconds, others return Unix milliseconds.
   */
  private normalizeTimestampToSeconds(timestamp: number): number | null {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return null;
    }
    // >= 1e12 is likely milliseconds (e.g. 1719757838224)
    return timestamp >= 1_000_000_000_000
      ? Math.floor(timestamp / 1000)
      : Math.floor(timestamp);
  }

  /**
   * Single token row for list responses (Kaspa Lens–shaped), including optional aggregated market data.
   */
  private mapTokenEntityToKasplexToken(
    token: TokenEntity,
    aggregatedMarketData: AggregatedMarketData | null,
    includeExchangeDetails = false,
  ): Record<string, unknown> {
    const kasplexToken: Record<string, unknown> = {};

    kasplexToken.ticker = token.ticker;
    kasplexToken.MaximumSupply = this.convertFromRawFormat(
      token.maxSupply,
      token.decimal,
    );
    kasplexToken.MintLimit = token.MintLimit || null;
    kasplexToken.preAllocated = this.convertFromRawFormat(
      token.preAllocated || '0',
      token.decimal,
    );
    kasplexToken.to = token.to;
    kasplexToken.decimal = token.decimal;
    kasplexToken.Deploymentmode = token.Deploymentmode;
    kasplexToken.minted = this.convertFromRawFormat(
      token.minted,
      token.decimal,
    );
    kasplexToken.burned = token.burned || '0';
    kasplexToken.opScoreAdd = token.opScoreAdd || null;
    kasplexToken.opScoreMod = token.opScoreMod || null;
    kasplexToken.state = token.state;
    kasplexToken.hashRev = token.hashRev || null;
    kasplexToken.mtsAdd = String(token.mtsAdd);
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const deployTimestamp = this.normalizeTimestampToSeconds(
      Number(token.mtsAdd || 0),
    );
    kasplexToken.tokenAge =
      deployTimestamp != null
        ? Math.max(0, currentTimeInSeconds - deployTimestamp)
        : null;
    kasplexToken.mintTotal =
      token.mintCount != null ? String(token.mintCount) : null;
    kasplexToken.holderTotal =
      token.holderCount != null ? String(token.holderCount) : null;
    kasplexToken.ContractAddress = token.ContractAddress || null;
    kasplexToken.name = token.name || null;
    kasplexToken.identifier =
      token.identifier || token.ticker || token.name || null;
    kasplexToken.lastSyncedAt = token.updatedAt
      ? token.updatedAt.toISOString()
      : null;
    kasplexToken.rank = token.rank ?? null;

    if (aggregatedMarketData) {
      const { marketDataArray, rootLevelFields } = this.transformMarketData(
        aggregatedMarketData,
        includeExchangeDetails,
      );
      kasplexToken.price = rootLevelFields.price;
      kasplexToken.change24h = rootLevelFields.change24h;
      kasplexToken.change7d = rootLevelFields.change7d;
      kasplexToken.change30d = rootLevelFields.change30d;
      kasplexToken.floorPriceKas =
        rootLevelFields.floorPriceKas ??
        (token.floorPriceKas != null ? parseFloat(token.floorPriceKas) : null);
      kasplexToken.volume24h = rootLevelFields.volume24h;
      kasplexToken.marketCap = rootLevelFields.marketCap;
      kasplexToken.marketCapUnverified = rootLevelFields.marketCapUnverified;
      kasplexToken.veryLowVolume = rootLevelFields.veryLowVolume;
      kasplexToken.marketData = marketDataArray;
    }

    return kasplexToken;
  }

  async findAll(query: GetTokensQueryDto): Promise<GetTokensResponseDto> {
    const {
      page = 1,
      limit = 50,
      sort = 'rank',
      order = 'asc',
      search,
      minting = 'all',
      supplySort,
      ageSort,
      premint = 'all',
      identifier,
      protocol,
      topGainers = false,
      topLosers = false,
      trending = false,
      mostViewed = false,
      marketTokens = false,
      topToday = false,
      fairLaunch = false,
      preSale = false,
      marketCapBracket,
      voteSort,
      walletAddress,
      favoritesOnly = false,
    } = query;

    // Secondary filters should stack on top of base filters, but only one secondary should run.
    // If multiple are provided, apply by priority to keep behavior deterministic.
    const secondaryFlags = [
      topGainers ? 'topGainers' : null,
      topLosers ? 'topLosers' : null,
      trending ? 'trending' : null,
      mostViewed ? 'mostViewed' : null,
      marketTokens ? 'marketTokens' : null,
      topToday ? 'topToday' : null,
      marketCapBracket ? 'marketCapBracket' : null,
    ].filter(Boolean) as string[];
    if (secondaryFlags.length > 1) {
      this.logger.warn(
        `Multiple secondary filters provided (${secondaryFlags.join(
          ', ',
        )}); applying by priority with else-if chain`,
      );
    }

    const cacheKey = this.cacheService.generateTokenListingCacheKey({
      page,
      limit,
      sort,
      order,
      search,
      identifier,
      protocol,
      topGainers,
      topLosers,
      trending,
      mostViewed,
      marketTokens,
      topToday,
      fairLaunch,
      preSale,
      marketCapBracket,
      minting,
      supplySort,
      ageSort,
      premint,
      voteSort,
      favoritesOnly: favoritesOnly ? walletAddress : undefined,
    });

    return this.cacheService.resolveTokenListingStaleWhileRevalidate(
      cacheKey,
      () => this.computeFindAllUncached(query),
    );
  }

  /** Full DB + market-data path for GET /tokens (used on cache miss and background refresh). */
  private async computeFindAllUncached(
    query: GetTokensQueryDto,
  ): Promise<GetTokensResponseDto> {
    const {
      page = 1,
      limit = 50,
      sort = 'rank',
      order = 'asc',
      search,
      minting = 'all',
      supplySort,
      ageSort,
      premint = 'all',
      identifier,
      protocol,
      topGainers = false,
      topLosers = false,
      trending = false,
      mostViewed = false,
      marketTokens = false,
      topToday = false,
      fairLaunch = false,
      preSale = false,
      marketCapBracket,
      voteSort,
      walletAddress,
      favoritesOnly = false,
    } = query;

    let tickers: string[] | undefined;
    if (favoritesOnly && walletAddress && walletAddress.trim()) {
      try {
        const list = await this.watchlistService.getList(walletAddress.trim());
        tickers = list.map((item) => item.tokenId);
      } catch {
        tickers = [];
      }
    }

    // When topGainers, topLosers, trending, mostViewed, marketTokens, topToday, or marketCapBracket is set, fetch a larger pool so we can filter/sort by market data in memory
    const useMarketDataPool =
      topGainers ||
      topLosers ||
      trending ||
      mostViewed ||
      marketTokens ||
      topToday ||
      !!marketCapBracket;
    const repoPage = useMarketDataPool ? 1 : page;
    const repoLimit =
      topGainers || topLosers
        ? TOP_MOVERS_POOL_SIZE
        : useMarketDataPool
          ? MARKET_DATA_POOL_SIZE
          : limit;

    // Fetch data from repository
    const { data: tokens, total: repoTotal } =
      await this.tokensRepository.findAll({
        page: repoPage,
        limit: repoLimit,
        sort,
        order,
        search,
        minting,
        supplySort,
        ageSort,
        premint,
        identifier,
        voteSort,
        tickers,
        protocol,
        fairLaunch,
        preSale,
        // token_info merge adds an extra query per request and is a major latency source.
        // We rely on counts already stored on token docs for fast list responses.
        skipTokenInfoMerge: true,
        // Secondary-filter flows compute final total after in-memory filtering.
        // Skipping countDocuments here removes an expensive full-scan.
        skipTotalCount: useMarketDataPool,
      });

    // Token table renders a 7D column for list responses, so we must load 7D candles
    // to avoid synthetic/fallback zeros in default list modes.
    const include7dForPool = true;
    const marketDataByIdentifier =
      await this.exchangesService.getAggregatedMarketDataBatch(tokens, {
        include7d: include7dForPool,
      });

    const includeExchangeDetails = Boolean(identifier);
    const kasplexTokens = tokens.map((token) => {
      const identifier = token.identifier || token.ticker || token.name;
      const aggregated = identifier
        ? (marketDataByIdentifier.get(identifier) ?? null)
        : null;
      return this.mapTokenEntityToKasplexToken(
        token,
        aggregated,
        includeExchangeDetails,
      );
    });

    let tokensToSerialize = kasplexTokens;
    let total = repoTotal;

    if (topGainers) {
      const change24hVal = (t: any) =>
        t?.change24h != null ? Number(t.change24h) : -Infinity;

      const filtered = kasplexTokens.filter((t) => change24hVal(t) > 0);
      filtered.sort((a, b) => change24hVal(b) - change24hVal(a));
      total = filtered.length;
      const start = (page - 1) * limit;
      tokensToSerialize = filtered.slice(start, start + limit);
    } else if (topLosers) {
      const change24hVal = (t: any) =>
        t?.change24h != null ? Number(t.change24h) : Infinity;
      // Show all actual losers by 24h change.
      const sorted = kasplexTokens
        .filter((t: any) => change24hVal(t) < 0)
        .sort((a, b) => {
          const aChange = change24hVal(a);
          const bChange = change24hVal(b);
          return aChange - bChange;
        });

      total = sorted.length;
      const start = (page - 1) * limit;
      tokensToSerialize = sorted.slice(start, start + limit);
    } else if (trending || mostViewed) {
      const volumeAmount = (t: any) =>
        t?.volume24h?.amount != null ? Number(t.volume24h.amount) : 0;
      const change24hVal = (t: any) =>
        t?.change24h != null ? Number(t.change24h) : 0;
      const change7dVal = (t: any) =>
        t?.change7d != null ? Number(t.change7d) : 0;

      const poolTickers = kasplexTokens
        .map((t: any) => (t.ticker || t.identifier || '').toUpperCase())
        .filter(Boolean);
      const holderGrowthMap =
        await this.holderSnapshotService.getHolderGrowthMap(
          poolTickers.length > 0
            ? poolTickers
            : kasplexTokens.map((t: any) => t.ticker || t.identifier),
        );

      const nowMs = Date.now();
      const filteredForTrending = kasplexTokens.filter((t: any) => {
        const vol = volumeAmount(t);
        return vol >= MIN_VOLUME_24H_TRENDING_USD;
      });

      if (filteredForTrending.length === 0) {
        total = 0;
        tokensToSerialize = [];
      } else {
        const maxVol = Math.max(
          1,
          ...filteredForTrending.map((t: any) => volumeAmount(t)),
        );
        const maxHolderGrowth = Math.max(
          1,
          ...filteredForTrending.map((t: any) => {
            const ticker = (t.ticker || t.identifier || '').toUpperCase();
            return holderGrowthMap.get(ticker) ?? 0;
          }),
        );
        const clampChange = (x: number) => Math.max(-100, Math.min(100, x));
        const changeRange = 200;
        const changeToNorm = (x: number) =>
          (clampChange(x) + 100) / changeRange;

        const withScores = filteredForTrending.map((t: any) => {
          const vol = volumeAmount(t);
          const ticker = (t.ticker || t.identifier || '').toUpperCase();
          const holderGrowth = holderGrowthMap.get(ticker) ?? 0;
          const change24h = change24hVal(t);
          const change7d = change7dVal(t);
          const priceMomentum = (change24h + change7d) / 2;

          const V = (vol / maxVol) * 100;
          const C = changeToNorm(priceMomentum) * 100;
          const T =
            maxHolderGrowth > 0 ? (holderGrowth / maxHolderGrowth) * 100 : 0;

          let score =
            V * TRENDING_WEIGHT_V +
            C * TRENDING_WEIGHT_C +
            T * TRENDING_WEIGHT_T;
          const mtsAddMs = parseInt(String(t.mtsAdd || '0'), 10) * 1000;
          if (mtsAddMs > 0 && nowMs - mtsAddMs < TRENDING_NEWNESS_WINDOW_MS) {
            score *= TRENDING_NEWNESS_MULTIPLIER;
          }
          return { token: t, score };
        });

        withScores.sort((a, b) => b.score - a.score);
        total = withScores.length;
        const start = (page - 1) * limit;
        tokensToSerialize = withScores
          .slice(start, start + limit)
          .map((x) => x.token);
      }
    } else if (marketTokens) {
      const tokenExchangesConfig = this.configService.get<{
        tokenExchangeMap: Record<string, string[]>;
        marketTokenExchanges: string[];
        minVolume24hMarketUsd: number;
        minMarketCapMarketUsd: number;
      }>('tokenExchanges');
      const tokenExchangeMap = tokenExchangesConfig?.tokenExchangeMap ?? {};
      const marketExchanges = new Set(
        tokenExchangesConfig?.marketTokenExchanges ?? ['gate_io', 'mexc'],
      );
      const minVol = tokenExchangesConfig?.minVolume24hMarketUsd ?? 50_000;
      const minMcap = tokenExchangesConfig?.minMarketCapMarketUsd ?? 100_000;

      const volumeAmount = (t: any) =>
        t?.volume24h?.amount != null ? Number(t.volume24h.amount) : 0;
      const marketCapAmount = (t: any) =>
        t?.marketCap?.amount != null ? Number(t.marketCap.amount) : 0;

      const filtered = kasplexTokens.filter((t: any) => {
        const ticker = (t.ticker || t.identifier || '')
          .toString()
          .toUpperCase();
        if (!ticker) return false;
        const exchanges = tokenExchangeMap[ticker];
        const listedOnMarket =
          Array.isArray(exchanges) &&
          exchanges.some((ex) => marketExchanges.has(ex));
        if (!listedOnMarket) return false;
        return volumeAmount(t) >= minVol && marketCapAmount(t) >= minMcap;
      });
      filtered.sort((a, b) => marketCapAmount(b) - marketCapAmount(a));
      total = filtered.length;
      const start = (page - 1) * limit;
      tokensToSerialize = filtered.slice(start, start + limit);
    } else if (topToday) {
      const volumeAmount = (t: any) =>
        t?.volume24h?.amount != null ? Number(t.volume24h.amount) : 0;
      const change24hVal = (t: any) =>
        t?.change24h != null ? Number(t.change24h) : -Infinity;

      // Include if: min volume bar AND (gained price OR volume leader)
      const filtered = kasplexTokens.filter(
        (t: any) =>
          volumeAmount(t) >= MIN_VOLUME_24H_TOP_TODAY_USD &&
          (change24hVal(t) > 0 ||
            volumeAmount(t) >= VOLUME_LEADER_24H_TOP_TODAY_USD),
      );
      // Sort by volume desc, then by change24h desc
      filtered.sort((a, b) => {
        const volA = volumeAmount(a);
        const volB = volumeAmount(b);
        if (volB !== volA) return volB - volA;
        return change24hVal(b) - change24hVal(a);
      });
      total = filtered.length;
      const start = (page - 1) * limit;
      tokensToSerialize = filtered.slice(start, start + limit);
    } else if (marketCapBracket) {
      const marketCapAmount = (t: any) =>
        t?.marketCap?.amount != null ? Number(t.marketCap.amount) : 0;
      const smallMax = MARKET_CAP_SMALL_MAX_USD;
      const midMax = MARKET_CAP_MID_MAX_USD;

      const filtered = kasplexTokens.filter((t: any) => {
        const mcap = marketCapAmount(t);
        if (mcap <= 0) return false; // exclude tokens without market data
        if (marketCapBracket === 'small') return mcap < smallMax;
        if (marketCapBracket === 'mid')
          return mcap >= smallMax && mcap < midMax;
        if (marketCapBracket === 'large') return mcap >= midMax;
        return false;
      });
      filtered.sort((a, b) => marketCapAmount(b) - marketCapAmount(a));
      total = filtered.length;
      const start = (page - 1) * limit;
      tokensToSerialize = filtered.slice(start, start + limit);
    }

    const data = plainToInstance(TokenResponseDto, tokensToSerialize, {
      excludeExtraneousValues: true,
      exposeDefaultValues: true,
    });

    const plainData = instanceToPlain(data, {
      excludeExtraneousValues: false,
    }) as TokenResponseDto[];

    plainData.forEach((token, index) => {
      if (token && !('lastSyncedAt' in token)) {
        (token as any).lastSyncedAt =
          tokensToSerialize[index].lastSyncedAt ?? null;
      }
    });

    const totalPages = Math.ceil(total / limit);

    const result: GetTokensResponseDto = {
      data: plainData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    // Cache top movers longer to avoid repeated heavy recomputation.
    //const cacheTtlSeconds = topGainers || topLosers || trending ? 600 : 180;
   // await this.cacheService.set(cacheKey, result, cacheTtlSeconds);

    return result;
  }

  /**
   * Transform AggregatedMarketData to exchange array and root level fields (Kaspa Lens format)
   * Returns: { marketDataArray, rootLevelFields }
   */
  private transformMarketData(
    aggregated: any,
    includeExchangeDetails: boolean,
  ): {
    marketDataArray: ExchangeMarketDataDto[];
    rootLevelFields: any;
  } {
    const usdCurrency: CurrencyDto = {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
    };

    const marketDataArray: ExchangeMarketDataDto[] = includeExchangeDetails
      ? aggregated.exchanges.map((ex: any) => ({
          exchange: ex.exchange,
          exchangeName: ex.exchangeName,
          exchangeLogoUrl: ex.exchangeLogoUrl,
          price: {
            currency: usdCurrency,
            amount: parseFloat(ex.price || '0'),
          },
          open: {
            currency: usdCurrency,
            amount: parseFloat(ex.open || '0'),
          },
          close: {
            currency: usdCurrency,
            amount: parseFloat(ex.close || '0'),
          },
          high: {
            currency: usdCurrency,
            amount: parseFloat(ex.high || '0'),
          },
          low: {
            currency: usdCurrency,
            amount: parseFloat(ex.low || '0'),
          },
          priceChangePercent: parseFloat(ex.priceChangePercent || '0'),
          change7d: ex.change7d ? parseFloat(ex.change7d) : undefined,
          change30d: ex.change30d ? parseFloat(ex.change30d) : undefined,
          quoteSymbol: ex.quoteSymbol || 'USDT',
          timeRange: ex.timeRange || 'HOURS_24',
          volume: {
            currency: usdCurrency,
            amount: parseFloat(ex.volume || '0'),
          },
          lastUpdated: ex.lastUpdated,
        }))
      : aggregated.exchanges.map((ex: any) => ({
          exchange: ex.exchange,
          exchangeName: ex.exchangeName,
          exchangeLogoUrl: ex.exchangeLogoUrl,
          quoteSymbol: ex.quoteSymbol || 'USDT',
          timeRange: ex.timeRange || 'HOURS_24',
          lastUpdated: ex.lastUpdated,
        }));

    // Root level fields
    const priceObj: any = {
      currency: usdCurrency,
      amount: aggregated.price ? parseFloat(aggregated.price || '0') : null,
      priceSource: aggregated.priceSource,
    };

    const rootLevelFields = {
      price: priceObj,
      change24h:
        aggregated.change24h !== null
          ? parseFloat(aggregated.change24h || '0')
          : null,
      change7d:
        aggregated.change7d !== null
          ? parseFloat(aggregated.change7d || '0')
          : null,
      change30d:
        aggregated.change30d !== null && aggregated.change30d !== undefined
          ? parseFloat(aggregated.change30d || '0')
          : null,
      floorPriceKas:
        aggregated.floorPriceKas != null
          ? parseFloat(aggregated.floorPriceKas)
          : null,
      volume24h: aggregated.volume24h
        ? {
            currency: usdCurrency,
            amount: parseFloat(aggregated.volume24h || '0'),
          }
        : null,
      marketCap: aggregated.marketCap
        ? {
            currency: usdCurrency,
            amount: parseFloat(aggregated.marketCap || '0'),
          }
        : null,
      marketCapUnverified:
        aggregated.marketCapUnverified !== null
          ? aggregated.marketCapUnverified
          : null,
      veryLowVolume:
        aggregated.veryLowVolume !== null ? aggregated.veryLowVolume : null,
    };

    return { marketDataArray, rootLevelFields };
  }

  /**
   * Resolve identifier or ticker to token identifier (for exchange/chart lookups).
   */
  async resolveIdentifier(identifierOrTicker: string): Promise<string | null> {
    if (!identifierOrTicker?.trim()) return null;
    const s = identifierOrTicker.trim();
    const byId = await this.tokensRepository.findByIdentifier(s);
    if (byId) return byId.identifier;
    const byTicker = await this.tokensRepository.findByTicker(s);
    if (byTicker) return byTicker.identifier;
    return null;
  }

  /**
   * Get chart candles for a token (7d, 1h, 1d, 1M, 1Y, max).
   * identifierOrTicker can be token identifier or ticker.
   * All intervals return byExchange (per-exchange candles).
   */
  async getChartData(
    identifierOrTicker: string,
    interval: '7d' | '1h' | '1d' | '1M' | '3M' | '1Y' | 'ytd' | 'max',
  ): Promise<{
    interval: string;
    ticker?: string;
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
  } | null> {
    const identifier = await this.resolveIdentifier(identifierOrTicker);
    if (!identifier) return null;
    return this.exchangesService.getChartData(identifier, interval);
  }

  /**
   * Get market cap chart data for a token (derived from price candles and maxSupply).
   * Uses the same intervals as price chart: 7d, 1h, 1d, 1M, 1Y, max.
   * Returns aggregated candles (no byExchange), where open/high/low/close represent market cap values.
   */
  async getMarketCapChartData(
    identifierOrTicker: string,
    interval: '7d' | '1h' | '1d' | '1M' | '3M' | '1Y' | 'ytd' | 'max',
  ): Promise<{
    interval: string;
    ticker?: string;
    candles?: Array<{
      timestamp: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume?: string;
    }>;
  } | null> {
    if (!identifierOrTicker?.trim()) {
      return null;
    }

    // Resolve identifier and load token (for maxSupply / decimal)
    const identifier = await this.resolveIdentifier(identifierOrTicker);
    if (!identifier) return null;

    const token = await this.tokensRepository.findByIdentifier(identifier);
    if (!token) return null;

    const maxSupply = token.maxSupply || '0';
    const decimals = token.decimal || '8';

    const supplyNum = parseFloat(maxSupply || '0');
    const decimalsNum = parseFloat(decimals || '8');

    if (!isFinite(supplyNum) || supplyNum <= 0) {
      // Cannot derive market cap without a valid maxSupply
      return null;
    }

    if (!isFinite(decimalsNum) || decimalsNum < 0 || decimalsNum > 18) {
      // Invalid decimals - fall back to 8 as a sensible default
      this.logger.warn(
        `Invalid decimals "${decimals}" for token ${identifier}, falling back to 8`,
      );
    }

    const effectiveDecimals =
      !isFinite(decimalsNum) || decimalsNum < 0 || decimalsNum > 18
        ? 8
        : decimalsNum;

    const divisor = Math.pow(10, effectiveDecimals);
    const effectiveSupply = supplyNum / divisor;

    if (!isFinite(effectiveSupply) || effectiveSupply <= 0) {
      return null;
    }

    // Reuse existing price chart data (per-exchange candles)
    const priceChart = await this.exchangesService.getChartData(
      identifier,
      interval,
    );

    if (
      !priceChart ||
      !Array.isArray(priceChart.byExchange) ||
      priceChart.byExchange.length === 0
    ) {
      return null;
    }

    // For now, derive a single aggregated series using the first exchange's candles.
    // Frontend already treats root-level candles as the primary series.
    const sourceExchange = priceChart.byExchange[0];
    const priceCandles = sourceExchange.candles || [];

    if (priceCandles.length === 0) {
      return null;
    }

    const toMarketCap = (priceStr: string): string => {
      const priceNum = parseFloat(priceStr || '0');
      if (!isFinite(priceNum) || priceNum <= 0) {
        return '0';
      }
      const marketCap = priceNum * effectiveSupply;
      // Market cap is typically displayed with 2 decimal places
      return marketCap.toFixed(2);
    };

    const candles = priceCandles.map((candle) => ({
      timestamp: candle.timestamp,
      open: toMarketCap(candle.open),
      high: toMarketCap(candle.high),
      low: toMarketCap(candle.low),
      close: toMarketCap(candle.close),
      volume: (candle as { volume?: string }).volume ?? '0',
    }));

    return {
      interval: priceChart.interval,
      ticker: priceChart.ticker ?? identifierOrTicker,
      candles,
    };
  }
}
