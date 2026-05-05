// Base Exchange Adapter: Abstract base class providing common functionality for all
// exchange adapters (HTTP client, retry logic, error handling, rate limiting)

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { ExchangeEntity } from '../../database/entities/exchange.entity';
import { IExchangeAdapter } from '../interfaces/exchange-adapter.interface';
import {
  NormalizedTicker24h,
  NormalizedKline7d,
} from '../dto/normalized-market-data.dto';

/**
 * Base Exchange Adapter
 * Provides common functionality for all exchange adapters:
 * - HTTP client with retry logic
 * - Error handling
 * - Rate limiting
 */
@Injectable()
export abstract class BaseExchangeAdapter implements IExchangeAdapter {
  protected readonly logger: Logger;
  protected readonly maxRetries = 3;
  protected readonly baseRetryDelay = 1000; // 1 second base delay

  constructor(adapterName: string) {
    this.logger = new Logger(adapterName);
  }

  /**
   * Create axios instance for exchange API
   */
  protected createAxiosInstance(baseUrl: string): AxiosInstance {
    return axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Execute HTTP request with retry logic and exponential backoff
   */
  protected async executeRequest<T>(
    requestFn: () => Promise<T>,
    context: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;

        // Don't retry on 4xx errors (client errors)
        if (
          axiosError.response?.status &&
          axiosError.response.status >= 400 &&
          axiosError.response.status < 500
        ) {
          this.logger.error(
            `Client error (${axiosError.response.status}) for ${context}: ${axiosError.message}`,
          );
          throw error;
        }

        // Retry on 5xx errors or network errors
        if (attempt < this.maxRetries) {
          const delay = this.baseRetryDelay * Math.pow(2, attempt - 1);
          this.logger.warn(
            `Failed ${context} (attempt ${attempt}/${this.maxRetries}). Retrying in ${delay / 1000}s...`,
          );
          await this.delay(delay);
        } else {
          this.logger.error(
            `Failed ${context} after ${this.maxRetries} attempts: ${lastError.message}`,
          );
        }
      }
    }

    throw (
      lastError ||
      new Error(`Failed ${context} after ${this.maxRetries} attempts`)
    );
  }

  /**
   * Delay helper
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Abstract methods - must be implemented by each exchange adapter
   */
  abstract fetchTicker24h(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedTicker24h>;

  abstract fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d>;
}
