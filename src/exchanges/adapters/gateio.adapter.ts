// Gate.io Exchange Adapter: Fetches 24h ticker and 7d K-line data from Gate.io API,
// transforms to normalized format (API: https://www.gate.io/docs/developers/apiv4)

import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ExchangeEntity } from '../../database/entities/exchange.entity';
import { BaseExchangeAdapter } from './base-exchange.adapter';
import {
  NormalizedTicker24h,
  NormalizedKline7d,
  NormalizedKlinesResult,
} from '../dto/normalized-market-data.dto';
import { NormalizedTradeFromAdapter } from '../dto/normalized-trade.dto';

@Injectable()
export class GateIoAdapter extends BaseExchangeAdapter {
  private axiosInstance: AxiosInstance;

  constructor() {
    super('GateIoAdapter');
  }

  private getAxiosInstance(baseUrl: string): AxiosInstance {
    if (!this.axiosInstance) {
      this.axiosInstance = this.createAxiosInstance(baseUrl);
    }
    return this.axiosInstance;
  }

  async fetchTicker24h(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedTicker24h> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    // Gate.io API: GET /api/v4/spot/tickers?currency_pair=SYMBOL
    const url = `/spot/tickers`;
    const params = {
      currency_pair: symbol,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `Gate.io ticker24h for ${symbol}`,
    );

    // Gate.io returns an array, get first element
    const data = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
    return {
      symbol: symbol,
      price: data.last || '0',
      volume24h: data.quote_volume || '0',
      change24h: data.change_percentage || '0',
      high24h: data.high_24h || '0',
      low24h: data.low_24h || '0',
      open24h: data.open_24h || data.last || '0',
      close24h: data.last || '0',
      timestamp: Date.now(),
    };
  }

  async fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/spot/candlesticks`;
    const params = {
      currency_pair: symbol,
      interval: '1d',
      limit: 24,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `Gate.io kline7d for ${symbol}`,
    );

    // Gate.io returns: [timestamp, volume, close, high, low, open]
    const klines = (response.data || []).map((candle: any[]) => ({
      timestamp: parseInt(candle[0]) * 1000, // Convert to milliseconds
      open: candle[5] || '0',
      high: candle[3] || '0',
      low: candle[4] || '0',
      close: candle[2] || '0',
      volume: candle[1] || '0',
    }));

    return {
      symbol: symbol,
      klines: klines.slice(0, 24), // Up to 24 daily candles
    };
  }

  /**
   * Gate.io candlesticks: GET /spot/candlesticks?currency_pair=X&interval=Y&limit=N
   * 1h: interval=1h, limit=24 | 1M: interval=30d (1M not supported), limit=12
   * 1Y: interval=1d, limit=52 | max: interval=1d, limit=500
   * Response: [[timestamp_sec, volume, close, high, low, open], ...]
   */
  async fetchKlines(
    exchange: ExchangeEntity,
    symbol: string,
    interval: '1h' | '1d' | '1M' | '1Y' | 'max',
    limit: number,
  ): Promise<NormalizedKlinesResult> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/spot/candlesticks`;
    let apiInterval: string;
    if (interval === '1h') {
      apiInterval = '1m';
    } else if (interval === '1M') {
      apiInterval = '30d'; // 1M not supported; 30d ≈ 1 month
    } else {
      // 1d, 1Y, max: daily candles
      apiInterval = '1d';
    }
    const params = {
      currency_pair: symbol,
      interval: apiInterval,
      limit,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `Gate.io klines ${interval} for ${symbol}`,
    );

    const arr = response.data ?? [];
    const klines = (Array.isArray(arr) ? arr : []).map((candle: any[]) => ({
      timestamp: (parseInt(candle[0], 10) || 0) * 1000,
      open: String(candle[5] ?? '0'),
      high: String(candle[3] ?? '0'),
      low: String(candle[4] ?? '0'),
      close: String(candle[2] ?? '0'),
      volume: String(candle[1] ?? '0'),
    }));

    return {
      symbol,
      klines: klines.slice(0, limit),
    };
  }

  /**
   * Fetch 24h tickers only for the requested symbols (one request with currency_pair params).
   * Gate.io: GET /spot/tickers?currency_pair=X&currency_pair=Y returns only those tickers.
   */
  async fetchTickers24hBatch(
    exchange: ExchangeEntity,
    symbols: string[],
  ): Promise<NormalizedTicker24h[]> {
    if (symbols.length === 0) return [];
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const params: Record<string, string | string[]> = {
      currency_pair: symbols,
    };
    const response = await this.executeRequest(
      () => axiosInstance.get('/spot/tickers', { params }),
      `Gate.io tickers24h batch (${symbols.length} symbols)`,
    );
    const symbolSet = new Set(symbols.map((s) => s.toUpperCase()));
    const arr = Array.isArray(response.data) ? response.data : [];
    const out: NormalizedTicker24h[] = [];
    for (const data of arr) {
      const raw = data.currency_pair || data.symbol || '';
      const pair = raw.toUpperCase();
      if (!symbolSet.has(pair)) continue;
      out.push({
        symbol: raw,
        price: data.last || '0',
        volume24h: data.quote_volume || '0',
        change24h: data.change_percentage || '0',
        high24h: data.high_24h || '0',
        low24h: data.low_24h || '0',
        open24h: data.open_24h || data.last || '0',
        close24h: data.last || '0',
        timestamp: Date.now(),
      });
    }
    return out;
  }

  async fetchRecentTrades(
    exchange: ExchangeEntity,
    symbol: string,
    limit: number = 50,
  ): Promise<NormalizedTradeFromAdapter[]> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const response = await this.executeRequest(
      () =>
        axiosInstance.get('/spot/trades', {
          params: { currency_pair: symbol, limit },
        }),
      `Gate.io recent trades for ${symbol}`,
    );
    const arr = Array.isArray(response.data) ? response.data : [];
    return arr.map((t: any) => {
      const ts = parseInt(t.create_time_ms ?? t.create_time ?? '0', 10);
      const price = String(t.price ?? '0');
      const amount = String(t.amount ?? '0');
      const side = (t.side || 'sell').toLowerCase() as 'buy' | 'sell';
      return {
        exchangeTradeId: String(t.id ?? `${ts}_${price}_${amount}`),
        timestamp: ts,
        side,
        price,
        amount,
        quoteVolume: (parseFloat(price) * parseFloat(amount)).toFixed(8),
      };
    });
  }
}
