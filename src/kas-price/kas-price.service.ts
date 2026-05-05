// KAS Price Service: Fetches KAS/USD rate from CoinGecko with Redis cache-first to avoid rate limits.
// When Redis is down: in-memory cache + min interval between API calls to avoid hammering CoinGecko.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';

const KAS_PRICE_CACHE_KEY = 'kas:price:usd';
/** Min ms between CoinGecko calls when Redis is down (1 per 5 min to avoid 429) */
const MIN_API_INTERVAL_MS = 5 * 60_000;
const INITIAL_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;

@Injectable()
export class KasPriceService {
  private readonly logger = new Logger(KasPriceService.name);
  /** In-memory fallback when Redis is unavailable */
  private lastRate: number | null = null;
  private lastRateAt = 0;
  private lastFetchAt = 0;
  private backoffMs = 0;
  private nextRetryAt = 0;
  private inFlightFetch: Promise<number> | null = null;

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get current KAS/USD rate. Uses Redis first, then in-memory fallback when Redis is down,
   * then CoinGecko (throttled by min interval). Falls back to defaultUsdRate on API failure.
   */
  async getKasUsdRate(): Promise<number> {
    const kasConfig = this.configService.get<{
      price?: { defaultUsdRate?: number; cacheTtlSeconds?: number; apiUrl?: string };
    }>('kas');
    const defaultRate = kasConfig?.price?.defaultUsdRate ?? 0.053;
    const cacheTtlSeconds = kasConfig?.price?.cacheTtlSeconds ?? 900;
    const apiUrl = kasConfig?.price?.apiUrl;
    const cacheTtlMs = cacheTtlSeconds * 1000;
    const now = Date.now();

    // Always respect backoff first
    if (this.nextRetryAt && now < this.nextRetryAt) {
      const fallback =
        this.lastRate != null && this.lastRate > 0 ? this.lastRate : defaultRate;
      return fallback;
    }

    // Use in-memory value if still fresh
    if (this.lastRate != null && this.lastRate > 0 && now - this.lastRateAt < cacheTtlMs) {
      return this.lastRate;
    }

    // Global throttle: never hit CoinGecko more often than MIN_API_INTERVAL_MS
    if (now - this.lastFetchAt < MIN_API_INTERVAL_MS) {
      const fallback = this.lastRate != null && this.lastRate > 0 ? this.lastRate : defaultRate;
      return fallback;
    }

    if (!apiUrl || apiUrl.trim() === '') {
      return this.lastRate != null && this.lastRate > 0 ? this.lastRate : defaultRate;
    }

    if (this.inFlightFetch) {
      return this.inFlightFetch;
    }

    const doFetch = async (): Promise<number> => {
      this.lastFetchAt = Date.now();
      try {
        const response = await fetch(apiUrl!.trim());
        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            this.applyBackoff(this.lastFetchAt);
          }
          this.logger.warn(`KAS price API error: ${response.status} ${response.statusText}`);
          return this.lastRate != null && this.lastRate > 0 ? this.lastRate : defaultRate;
        }
        const data = await response.json();
        const rate = data?.kaspa?.usd;
        if (typeof rate !== 'number' || rate <= 0) {
          this.logger.warn('KAS price API returned invalid rate');
          return this.lastRate != null && this.lastRate > 0 ? this.lastRate : defaultRate;
        }
        this.memorySave(rate, this.lastFetchAt);
        this.resetBackoff();
        // Optional: keep set for environments where Redis is configured; harmless when not
        try {
          await this.cacheService.set(KAS_PRICE_CACHE_KEY, rate, cacheTtlSeconds);
        } catch {
          // Redis down; in-memory already set
        }
        return rate;
      } catch (error) {
        this.applyBackoff(Date.now());
        this.logger.warn(
          `KAS price fetch failed: ${error instanceof Error ? error.message : String(error)}. Using fallback rate.`,
        );
        return this.lastRate != null && this.lastRate > 0 ? this.lastRate : defaultRate;
      } finally {
        this.inFlightFetch = null;
      }
    };

    this.inFlightFetch = doFetch();
    return this.inFlightFetch;
  }

  private memorySave(rate: number, at: number): void {
    this.lastRate = rate;
    this.lastRateAt = at;
  }

  private applyBackoff(now: number): void {
    if (this.backoffMs === 0) {
      this.backoffMs = INITIAL_BACKOFF_MS;
    } else {
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    }
    this.nextRetryAt = now + this.backoffMs;
  }

  private resetBackoff(): void {
    this.backoffMs = 0;
    this.nextRetryAt = 0;
  }
}
