// AscendEX Exchange Adapter: Fetches 24h ticker and 7d K-line data from AscendEX API,
// transforms to normalized format (API: https://ascendex.github.io/ascendex-pro-api/)

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
export class AscendExAdapter extends BaseExchangeAdapter {
  private axiosInstance: AxiosInstance;

  constructor() {
    super('AscendExAdapter');
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
    // AscendEX API: GET /api/pro/v1/ticker?symbol=SYMBOL
    const url = `/ticker`;
    const params = {
      symbol: symbol,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `AscendEX ticker24h for ${symbol}`,
    );

    const data = response.data.data;
    // Calculate 24h change: ((close - open) / open) * 100
    const open = parseFloat(data.open || '0');
    const close = parseFloat(data.close || '0');
    const change24h = open !== 0 ? ((close - open) / open) * 100 : 0;

    // AscendEX volume is in base currency (token units), convert to USD: volume * price
    const volumeBase = parseFloat(data.volume || '0');
    const price = parseFloat(data.close || '0');
    const volume24hUSD = (volumeBase * price).toFixed(2);

    return {
      symbol: symbol,
      price: data.close || '0',
      volume24h: volume24hUSD, // Converted to USD
      change24h: change24h.toFixed(2),
      high24h: data.high || '0',
      low24h: data.low || '0',
      open24h: data.open || '0',
      close24h: data.close || '0',
      timestamp: Date.now(),
    };
  }

  async fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/barhist`;
    const endTime = Date.now();
    const startTime = endTime - 24 * 24 * 60 * 60 * 1000; // 24 days ago
    const params = {
      symbol: symbol,
      interval: '1d',
      from: startTime,
      to: endTime,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `AscendEX kline7d for ${symbol}`,
    );

    const arr = response.data?.data ?? response.data ?? [];
    const klines = (Array.isArray(arr) ? arr : []).map((candle: any) => ({
      timestamp: candle.data?.ts ?? Date.now(),
      open: String(candle.data?.o ?? '0'),
      high: String(candle.data?.h ?? '0'),
      low: String(candle.data?.l ?? '0'),
      close: String(candle.data?.c ?? '0'),
      volume: String(candle.data?.v ?? '0'),
    }));

    return {
      symbol: symbol,
      klines: klines.slice(0, 24), // Up to 24 daily candles
    };
  }

  /**
   * AscendEX barhist: https://ascendex.com/api/pro/v1/barhist
   * API uses param "n" for number of bars (default 10, max 500). Intervals per barhist/info: 60, 1d, 1w, 1m.
   * 1h: interval=60, n=24 | 1M: interval=1m, n=12 | 1Y/max: interval=1d, n=52 or 200
   */
  async fetchKlines(
    exchange: ExchangeEntity,
    symbol: string,
    interval: '1h' | '1d' | '1M' | '1Y' | 'max',
    limit: number,
  ): Promise<NormalizedKlinesResult> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/barhist`;
    const params: Record<string, string | number> = { symbol };
    if (interval === '1h') {
      params['interval'] = 1;
      params['n'] = Math.min(limit, 500);
    } else if (interval === '1M') {
      params['interval'] = '1m';
      params['n'] = Math.min(limit, 500);
    } else {
      params['interval'] = '1d';
      params['n'] = Math.min(limit, 500);
    }

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `AscendEX klines ${interval} for ${symbol}`,
    );

    const arr = response.data?.data ?? response.data ?? [];
    const klines = (Array.isArray(arr) ? arr : []).map((candle: any) => ({
      timestamp: candle.data?.ts ?? Date.now(),
      open: String(candle.data?.o ?? '0'),
      high: String(candle.data?.h ?? '0'),
      low: String(candle.data?.l ?? '0'),
      close: String(candle.data?.c ?? '0'),
      volume: String(candle.data?.v ?? '0'),
    }));

    return {
      symbol,
      klines: klines.slice(0, limit),
    };
  }

  async fetchRecentTrades(
    exchange: ExchangeEntity,
    symbol: string,
    _limit: number = 50,
  ): Promise<NormalizedTradeFromAdapter[]> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const response = await this.executeRequest(
      () => axiosInstance.get('/trades', { params: { symbol } }),
      `AscendEX recent trades for ${symbol}`,
    );
    const inner = response.data?.data?.data ?? response.data?.data ?? [];
    const arr = Array.isArray(inner) ? inner : [];
    return arr.map((t: any) => {
      const ts = Number(t.ts ?? 0);
      const price = String(t.p ?? '0');
      const qty = String(t.q ?? '0');
      const side = t.bm ? 'sell' : 'buy';
      const id = t.seqnum != null ? String(t.seqnum) : `${ts}_${price}_${qty}`;
      return {
        exchangeTradeId: id,
        timestamp: ts,
        side,
        price,
        amount: qty,
      };
    });
  }
}
