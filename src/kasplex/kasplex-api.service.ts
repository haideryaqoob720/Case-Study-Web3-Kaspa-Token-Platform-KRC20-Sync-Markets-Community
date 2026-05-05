// Kasplex API Service: External API client for Kasplex API - fetches token list and detailed
// token info, handles retries, 429 rate limiting (Retry-After), and transforms API responses.

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';

export interface KasplexToken {
  ticker: string;
  name?: string | null;
  maxSupply: string;
  mintedSupply: string;
  burnedSupply?: string;
  holderCount: number;
  mintCount: number;
  premintAmount?: string;
  state: string;
  decimals: string;
  mode: string;
  deployAddress: string;
  deployTimestamp: number;
  lim: string | null;
  opScoreAdd: string | null;
  opScoreMod: string | null;
  hashRev: string | null;
  ContractAddress?: string | null;
}

// Raw API response structure
interface KasplexApiToken {
  tick?: string; // Some tokens might use 'name' instead
  name?: string; // Alternative to 'tick'
  ca?: string; // Contract address (some tokens have this)
  max: string;
  lim?: string;
  pre?: string;
  to: string;
  dec: string;
  mod: string;
  minted: string;
  burned?: string;
  opScoreAdd?: number;
  opScoreMod?: number;
  state: string;
  hashRev?: string;
  mtsAdd?: number;
  mtsMod?: number;
  holders?: number;
  mintCount?: number;
}

interface KasplexApiResponse {
  message?: string;
  result?: KasplexApiToken[];
  next?: string;
  prev?: string;
}

export interface KasplexResponse {
  data: KasplexToken[];
  next?: string;
  prev?: string;
}

@Injectable()
export class KasplexApiService {
  private readonly logger = new Logger(KasplexApiService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://api.kasplex.org/v1/krc20';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // Base delay for token list
  private readonly tokenInfoRetryDelay = 5000; // Base delay for token info (5s)

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetches all tokens from Kasplex API using cursor-based pagination
   * @returns Promise with all tokens
   */
  async fetchAllTokens(): Promise<KasplexToken[]> {
    const allTokens: KasplexToken[] = [];
    let nextCursor: string | undefined = undefined;

    try {
      do {
        const response = await this.fetchTokenPage(nextCursor);

        if (response.data && response.data.length > 0) {
          allTokens.push(...response.data);
        }

        nextCursor = response.next;

        if (nextCursor) {
          await this.delay(200);
        }
      } while (nextCursor);

      this.logger.log(`Fetched ${allTokens.length} tokens from Kasplex API`);
      return allTokens;
    } catch (error) {
      this.logger.error(
        `Error fetching tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Fetches a single page of tokens with retry logic
   * @param cursor Optional cursor for pagination
   * @returns Promise with token page response
   */
  private async fetchTokenPage(cursor?: string): Promise<KasplexResponse> {
    const url = cursor
      ? `${this.baseUrl}/tokenlist?next=${encodeURIComponent(cursor)}`
      : `${this.baseUrl}/tokenlist`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.get<KasplexApiResponse>(url);

        if (response.status === 200 && response.data) {
          const apiResponse = response.data;
          const rawTokens = apiResponse.result || [];

          const mappedTokens: KasplexToken[] = rawTokens
            .map((token) => this.mapApiTokenToKasplexToken(token))
            .filter((token): token is KasplexToken => token !== null);

          return {
            data: mappedTokens,
            next: apiResponse.next,
            prev: apiResponse.prev,
          };
        }

        throw new Error(`Unexpected response status: ${response.status}`);
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          const delay = this.is429(error)
            ? this.getRetryAfterMs(error, attempt, 10000)
            : this.retryDelay * Math.pow(2, attempt - 1);
          if (this.is429(error)) {
            this.logger.warn(`Kasplex rate limited (429). Waiting ${delay / 1000}s before retry (attempt ${attempt}/${this.maxRetries}).`);
          }
          await this.delay(delay);
        }
      }
    }

    throw lastError || new Error('Failed to fetch token page');
  }

  /**
   * Maps API token format to our expected KasplexToken format
   */
  private mapApiTokenToKasplexToken(
    apiToken: KasplexApiToken,
  ): KasplexToken | null {
    const ticker = apiToken.tick || apiToken.name;

    if (!ticker || ticker.trim().length === 0) {
      return null;
    }

    const premintAmount = apiToken.pre || '0'; // Premint amount from Kasplex API
    const holderCount = apiToken.holders || 0;
    const mintCount = apiToken.mintCount || 0;
    const deployTimestamp = apiToken.mtsAdd || apiToken.opScoreAdd || 0;

    return {
      ticker: ticker.trim(),
      name: apiToken.name || null,
      maxSupply: apiToken.max || '0',
      mintedSupply: apiToken.minted || '0',
      burnedSupply: apiToken.burned || '0',
      holderCount,
      mintCount,
      premintAmount,
      state: apiToken.state || 'active',
      decimals: apiToken.dec || '8',
      mode: apiToken.mod || 'mint',
      deployAddress: apiToken.to,
      deployTimestamp,
      lim: apiToken.lim || null,
      opScoreAdd: apiToken.opScoreAdd ? String(apiToken.opScoreAdd) : null,
      opScoreMod: apiToken.opScoreMod ? String(apiToken.opScoreMod) : null,
      hashRev: apiToken.hashRev || null,
      ContractAddress: apiToken.ca || null,
    };
  }

  /**
   * Fetches detailed token info from Kasplex API
   * This method is used ONLY by background sync jobs
   * @param tick Token ticker symbol
   * @returns Raw API response (exact format, including holder array)
   */
  async fetchTokenInfo(tick: string): Promise<any> {
    if (!tick || tick.trim().length === 0) {
      throw new Error('Token ticker cannot be empty');
    }

    const url = `${this.baseUrl}/token/${encodeURIComponent(tick.trim())}`;
    let lastError: Error | null = null;

    // Retry logic: 3 attempts with exponential backoff (5s, 10s, 20s)
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.get(url);

        if (response.status === 200 && response.data) {
          // Return raw API response as-is (including holder array)
          return response.data;
        }

        throw new Error(`Unexpected response status: ${response.status}`);
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          const delay = this.is429(error)
            ? this.getRetryAfterMs(error, attempt, this.tokenInfoRetryDelay)
            : this.tokenInfoRetryDelay * Math.pow(2, attempt - 1);
          if (this.is429(error)) {
            this.logger.warn(`Kasplex rate limited (429) for ${tick}. Waiting ${delay / 1000}s (attempt ${attempt}/${this.maxRetries}).`);
          } else {
            this.logger.warn(
              `Failed to fetch token info for ${tick} (attempt ${attempt}/${this.maxRetries}). Retrying in ${delay / 1000}s...`,
            );
          }
          await this.delay(delay);
        } else {
          this.logger.error(
            `Failed to fetch token info for ${tick} after ${this.maxRetries} attempts: ${lastError.message}`,
          );
        }
      }
    }

    throw lastError || new Error(`Failed to fetch token info for ${tick}`);
  }

  /**
   * Fetches marketplace listings from Kasplex API for a token
   * Used for calculating floor price from OTC marketplace activity
   * @param tick Token ticker symbol
   * @returns Raw API response with marketplace listings
   */
  async fetchMarketplaceListings(tick: string): Promise<any> {
    if (!tick || tick.trim().length === 0) {
      throw new Error('Token ticker cannot be empty');
    }

    const url = `${this.baseUrl}/market/${encodeURIComponent(tick.trim())}`;
    let lastError: Error | null = null;

    // Retry logic: 3 attempts with exponential backoff (2s, 4s, 8s)
    const marketplaceRetryDelay = 2000; // Base delay for marketplace (2s)
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.get(url);

        if (response.status === 200 && response.data) {
          // Return raw API response as-is
          return response.data;
        }

        throw new Error(`Unexpected response status: ${response.status}`);
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          const delay = this.is429(error)
            ? this.getRetryAfterMs(error, attempt, marketplaceRetryDelay)
            : marketplaceRetryDelay * Math.pow(2, attempt - 1);
          if (this.is429(error)) {
            this.logger.warn(`Kasplex rate limited (429) for market ${tick}. Waiting ${delay / 1000}s (attempt ${attempt}/${this.maxRetries}).`);
          } else {
            this.logger.warn(
              `Failed to fetch marketplace listings for ${tick} (attempt ${attempt}/${this.maxRetries}). Retrying in ${delay / 1000}s...`,
            );
          }
          await this.delay(delay);
        } else {
          this.logger.error(
            `Failed to fetch marketplace listings for ${tick} after ${this.maxRetries} attempts: ${lastError.message}`,
          );
        }
      }
    }

    throw lastError || new Error(`Failed to fetch marketplace listings for ${tick}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get delay in ms from 429 response (Retry-After header or exponential backoff).
   * Retry-After can be seconds (number) or HTTP-date.
   */
  private getRetryAfterMs(error: unknown, attempt: number, baseDelayMs: number): number {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const headers = axiosError.response?.headers as Record<string, string> | undefined;
    if (status === 429 && headers) {
      const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
      if (retryAfter) {
        const sec = parseInt(retryAfter, 10);
        if (!Number.isNaN(sec)) return Math.min(sec * 1000, 300000); // cap 5 min
        const date = new Date(retryAfter).getTime();
        if (!Number.isNaN(date)) {
          const ms = date - Date.now();
          return Math.min(Math.max(ms, 1000), 300000);
        }
      }
    }
    return baseDelayMs * Math.pow(2, attempt - 1);
  }

  private is429(error: unknown): boolean {
    return (error as AxiosError)?.response?.status === 429;
  }

  /**
   * KRC-20 operation list (Kasplex public API).
   * GET /v1/krc20/oplist?tick=&address=&next=
   * `address` optional: omit for token-wide recent ops.
   */
  async fetchKrc20OpList(params: {
    tick: string;
    address?: string;
    next?: string;
  }): Promise<{
    result: KasplexKrc20OpRaw[];
    next?: string;
    prev?: string;
    /** Total count when API includes it */
    total?: number;
    totalCount?: number;
  }> {
    const tick = params.tick?.trim();
    if (!tick) {
      throw new Error('tick is required');
    }

    const qs = new URLSearchParams();
    qs.set('tick', tick);
    const address = params.address?.trim();
    if (address) qs.set('address', address);
    if (params.next) qs.set('next', params.next);

    const url = `${this.baseUrl}/oplist?${qs.toString()}`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.get(url);
        if (response.status === 200 && response.data) {
          const body = response.data as Record<string, unknown>;
          const result = Array.isArray(body.result)
            ? (body.result as KasplexKrc20OpRaw[])
            : [];
          return {
            result,
            next: typeof body.next === 'string' ? body.next : undefined,
            prev: typeof body.prev === 'string' ? body.prev : undefined,
            total:
              typeof body.total === 'number' ? body.total : undefined,
            totalCount:
              typeof body.totalCount === 'number'
                ? body.totalCount
                : typeof (body as { total_op?: number }).total_op ===
                    'number'
                  ? (body as { total_op: number }).total_op
                  : undefined,
          };
        }
        throw new Error(`Unexpected response status: ${response.status}`);
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          const delay = this.is429(error)
            ? this.getRetryAfterMs(error, attempt, this.tokenInfoRetryDelay)
            : this.retryDelay * Math.pow(2, attempt - 1);
          if (this.is429(error)) {
            this.logger.warn(
              `Kasplex rate limited (429) for oplist ${tick}. Waiting ${delay / 1000}s (attempt ${attempt}/${this.maxRetries}).`,
            );
          }
          await this.delay(delay);
        }
      }
    }

    throw lastError || new Error('Failed to fetch KRC20 oplist');
  }

  /**
   * Token balances for an address (used for tier badge when wallet is passed).
   * GET /v1/krc20/address/{address}/tokenlist
   */
  async fetchKrc20AddressTokenlist(address: string): Promise<
    Array<{
      tick?: string;
      balance?: string;
      dec?: string;
      [key: string]: unknown;
    }>
  > {
    const addr = address?.trim();
    if (!addr) throw new Error('address is required');

    const pathAddr = encodeURIComponent(addr);
    const url = `${this.baseUrl}/address/${pathAddr}/tokenlist`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.get(url);
        if (response.status === 200 && response.data) {
          const body = response.data as { result?: unknown[] };
          const rows = Array.isArray(body.result) ? body.result : [];
          return rows as Array<{
            tick?: string;
            balance?: string;
            dec?: string;
            [key: string]: unknown;
          }>;
        }
        throw new Error(`Unexpected response status: ${response.status}`);
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          const delay = this.is429(error)
            ? this.getRetryAfterMs(error, attempt, this.tokenInfoRetryDelay)
            : this.retryDelay * Math.pow(2, attempt - 1);
          await this.delay(delay);
        }
      }
    }

    throw lastError || new Error('Failed to fetch address tokenlist');
  }
}

/** Raw KRC20 op row from Kasplex oplist (fields vary slightly by op type) */
export interface KasplexKrc20OpRaw {
  tick?: string;
  op?: string;
  from?: string;
  to?: string;
  amt?: string;
  price?: string;
  mtsAdd?: number | string;
  txAccept?: string | number;
  opAccept?: string | number;
  hashRev?: string;
  [key: string]: unknown;
}
