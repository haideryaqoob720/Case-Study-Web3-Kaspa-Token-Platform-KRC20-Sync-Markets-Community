import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Stored JSON shape for GET /tokens listing cache (stale-while-revalidate). */
export interface TokenListingCacheEnvelope<T> {
  data: T;
  timestamp: number;
}

/** Seconds before listing TTL when we treat cache as stale (background refresh). Default Redis TTL 90 → fresh for 80s. */
const TOKEN_LISTING_STALE_BEFORE_TTL_SEC = 10;
const TOKEN_LISTING_REFRESH_LOCK_SEC = 45;

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redisClient: Redis | null = null;
  private readonly ttl: number;
  private memoryCache = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(private readonly configService: ConfigService) {
    const redisConfig = this.configService.get('redis');
    this.ttl = redisConfig?.ttl || 90;
  }

  async onModuleInit() {
    try {
      const redisConfig = this.configService.get('redis');

      if (!redisConfig || !redisConfig.host) {
        this.logger.log('Redis not configured. Caching will be disabled.');
        return;
      }

      this.redisClient = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        keyPrefix: redisConfig.keyPrefix,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 5000,
      });

      let errorLogged = false;
      this.redisClient.on('error', (error) => {
        if (!errorLogged) {
          this.logger.warn(
            `Redis connection error: ${error.message}. Caching disabled.`,
          );
          errorLogged = true;
        }
        // Mark client as unavailable on error
        if (this.redisClient && this.redisClient.status === 'end') {
          this.redisClient = null;
        }
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis connected successfully');
        errorLogged = false;
      });

      this.redisClient.on('ready', () => {
        this.logger.log('Redis is ready to accept commands');
        errorLogged = false;
      });

      this.redisClient.on('close', () => {
        this.logger.warn('Redis connection closed');
        this.redisClient = null;
      });

      this.redisClient.on('end', () => {
        this.logger.warn('Redis connection ended');
        this.redisClient = null;
      });

      await Promise.race([
        this.redisClient.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 5000),
        ),
      ]).catch(() => {
        this.redisClient = null;
        this.logger.warn('Redis connection timeout. Caching will be disabled.');
      });
    } catch (error) {
      this.logger.warn(
        `Redis not available: ${error instanceof Error ? error.message : 'Unknown error'}. Caching will be disabled.`,
      );
      this.redisClient = null;
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  isAvailable(): boolean {
    if (!this.redisClient) {
      return false;
    }
    // Check if client is in a ready state (connected and ready to accept commands)
    const status = this.redisClient.status;
    return status === 'ready' || status === 'connect';
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      const item = this.memoryCache.get(key);
      if (!item) return null;
      if (Date.now() > item.expiresAt) {
        this.memoryCache.delete(key);
        return null;
      }
      try {
        return JSON.parse(item.value) as T;
      } catch {
        this.memoryCache.delete(key);
        return null;
      }
    }

    try {
      const value = await this.redisClient!.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      this.logger.debug(
        `Error getting key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.isAvailable()) {
      try {
        const ttl = ttlSeconds || this.ttl;
        this.memoryCache.set(key, {
          value: JSON.stringify(value),
          expiresAt: Date.now() + ttl * 1000,
        });
        return true;
      } catch {
        return false;
      }
    }

    try {
      const ttl = ttlSeconds || this.ttl;
      await this.redisClient!.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      this.logger.debug(
        `Error setting key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      this.memoryCache.delete(key);
      return true;
    }

    try {
      await this.redisClient!.del(key);
      return true;
    } catch (error) {
      this.logger.debug(
        `Error deleting key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.redisClient!.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  getConnectionInfo() {
    if (!this.redisClient) {
      return {
        isConnected: false,
        status: 'not_configured',
        host: 'unknown',
        port: 'unknown',
      };
    }

    const options = this.redisClient.options;
    return {
      isConnected: this.isAvailable(),
      status: this.redisClient.status,
      host: options.host || 'unknown',
      port: options.port || 'unknown',
    };
  }

  /**
   * GET /tokens: stale-while-revalidate using { data, timestamp } and a Redis lock for single-flight refresh.
   * Fresh for (REDIS_TTL - 10s) ms; until REDIS_TTL expires serve stale + background refresh; older or missing: await refetch.
   */
  async resolveTokenListingStaleWhileRevalidate<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    if (!this.isAvailable()) {
      return fetcher();
    }

    const redisTtl = this.ttl;
    const freshMaxMs = Math.max(
      0,
      (redisTtl - TOKEN_LISTING_STALE_BEFORE_TTL_SEC) * 1000,
    );
    const maxServeMs = redisTtl * 1000;

    try {
      const raw = await this.redisClient!.get(cacheKey);
      if (!raw) {
        const data = await fetcher();
        await this.setTokenListingEnvelope(cacheKey, data, redisTtl);
        return data;
      }

      let envelope: TokenListingCacheEnvelope<T>;
      try {
        envelope = JSON.parse(raw) as TokenListingCacheEnvelope<T>;
      } catch {
        const data = await fetcher();
        await this.setTokenListingEnvelope(cacheKey, data, redisTtl);
        return data;
      }

      if (
        !envelope ||
        typeof envelope.timestamp !== 'number' ||
        envelope.data === undefined
      ) {
        const data = await fetcher();
        await this.setTokenListingEnvelope(cacheKey, data, redisTtl);
        return data;
      }

      const age = Date.now() - envelope.timestamp;

      if (age < freshMaxMs) {
        return envelope.data;
      }

      if (age < maxServeMs) {
        void this.runTokenListingBackgroundRefresh(cacheKey, redisTtl, fetcher);
        return envelope.data;
      }

      const data = await fetcher();
      await this.setTokenListingEnvelope(cacheKey, data, redisTtl);
      return data;
    } catch (error) {
      this.logger.warn(
        `Listing cache read failed: ${error instanceof Error ? error.message : 'unknown'}; fetching fresh`,
      );
      return fetcher();
    }
  }

  private async setTokenListingEnvelope<T>(
    cacheKey: string,
    data: T,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }
    const body: TokenListingCacheEnvelope<T> = {
      data,
      timestamp: Date.now(),
    };
    try {
      await this.redisClient!.setex(
        cacheKey,
        ttlSeconds,
        JSON.stringify(body),
      );
    } catch (error) {
      this.logger.debug(
        `Error setting listing envelope ${cacheKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async runTokenListingBackgroundRefresh<T>(
    cacheKey: string,
    redisTtl: number,
    fetcher: () => Promise<T>,
  ): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const lockKey = `${cacheKey}:refresh-lock`;
    try {
      const locked = await this.redisClient!.set(
        lockKey,
        '1',
        'EX',
        TOKEN_LISTING_REFRESH_LOCK_SEC,
        'NX',
      );
      if (locked !== 'OK') {
        return;
      }

      try {
        const data = await fetcher();
        await this.setTokenListingEnvelope(cacheKey, data, redisTtl);
        this.logger.debug(`Background refresh completed for ${cacheKey}`);
      } catch (error) {
        this.logger.warn(
          `Background listing refresh failed for ${cacheKey}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      } finally {
        await this.redisClient!.del(lockKey).catch(() => undefined);
      }
    } catch (error) {
      this.logger.debug(
        `Listing refresh lock error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  /** Clear all GET /tokens listing cache entries (new `token:listing:*` and legacy `tokens:list:*`). */
  async invalidateTokenListingCaches(): Promise<void> {
    await this.deletePattern('token:listing:*');
    await this.deletePattern('tokens:list:*');
  }

  async deletePattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) {
      if (!pattern.endsWith('*')) {
        return this.memoryCache.delete(pattern) ? 1 : 0;
      }
      const prefix = pattern.slice(0, -1);
      let deleted = 0;
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(prefix)) {
          this.memoryCache.delete(key);
          deleted++;
        }
      }
      return deleted;
    }

    try {
      // Use SCAN instead of KEYS for production safety (non-blocking)
      const stream = this.redisClient!.scanStream({
        match: pattern,
        count: 100,
      });

      const keys: string[] = [];

      return new Promise((resolve) => {
        stream.on('data', (resultKeys: string[]) => {
          keys.push(...resultKeys);
        });

        stream.on('end', async () => {
          if (keys.length === 0) {
            resolve(0);
            return;
          }

          try {
            // Delete in batches to avoid overwhelming Redis
            const batchSize = 100;
            let deleted = 0;

            for (let i = 0; i < keys.length; i += batchSize) {
              const batch = keys.slice(i, i + batchSize);
              await this.redisClient!.del(...batch);
              deleted += batch.length;
            }

            resolve(deleted);
          } catch (error) {
            this.logger.warn(
              `Error deleting keys: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            resolve(0);
          }
        });

        stream.on('error', (error) => {
          this.logger.warn(
            `Error scanning keys: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          resolve(0);
        });
      });
    } catch (error) {
      this.logger.warn(
        `Error in deletePattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return 0;
    }
  }

  /**
   * Redis key body (after keyPrefix): token:listing:... includes all list filters.
   * Detail routes may use token:detail:{id} (same prefix pattern).
   */
  generateTokenListingCacheKey(query: {
    page?: number;
    limit?: number;
    sort?: string;
    order?: string;
    search?: string;
    identifier?: string;
    protocol?: string;
    topGainers?: boolean;
    topLosers?: boolean;
    trending?: boolean;
    mostViewed?: boolean;
    marketTokens?: boolean;
    topToday?: boolean;
    fairLaunch?: boolean;
    preSale?: boolean;
    marketCapBracket?: string;
    minting?: string;
    supplySort?: string;
    ageSort?: string;
    premint?: string;
    voteSort?: string;
    favoritesOnly?: string;
  }): string {
    const normalizedProtocol =
      query.protocol?.trim().toUpperCase() === 'KRC-20'
        ? undefined
        : query.protocol;
    const parts = [
      'token:listing',
      `page:${query.page || 1}`,
      `limit:${query.limit || 50}`,
      `sort:${query.sort || 'holderCount'}`,
      `order:${query.order || 'desc'}`,
      query.search ? `search:${query.search}` : 'search:none',
      query.identifier ? `identifier:${query.identifier}` : 'identifier:none',
      normalizedProtocol ? `protocol:${normalizedProtocol}` : 'protocol:none',
      query.topGainers ? 'topGainers:true' : 'topGainers:false',
      query.topLosers ? 'topLosers:true' : 'topLosers:false',
      query.trending ? 'trending:true' : 'trending:false',
      query.mostViewed ? 'mostViewed:true' : 'mostViewed:false',
      query.marketTokens ? 'marketTokens:true' : 'marketTokens:false',
      query.topToday ? 'topToday:true' : 'topToday:false',
      query.fairLaunch ? 'fairLaunch:true' : 'fairLaunch:false',
      query.preSale ? 'preSale:true' : 'preSale:false',
      query.marketCapBracket ? `marketCapBracket:${query.marketCapBracket}` : 'marketCapBracket:none',
      `minting:${query.minting ?? 'all'}`,
      `supplySort:${query.supplySort ?? 'none'}`,
      `ageSort:${query.ageSort ?? 'none'}`,
      `premint:${query.premint ?? 'all'}`,
      `voteSort:${query.voteSort ?? 'none'}`,
      query.favoritesOnly ? `favorites:${query.favoritesOnly}` : 'favorites:none',
    ];
    return parts.join(':');
  }
}
