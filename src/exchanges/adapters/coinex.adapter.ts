// CoinEx Exchange Adapter: Fetches 24h ticker and 7d K-line data from CoinEx API,
// transforms to normalized format (API: https://docs.coinex.com/api/v2)

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
export class CoinExAdapter extends BaseExchangeAdapter {
  private axiosInstance: AxiosInstance;

  constructor() {
    super('CoinExAdapter');
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
    // CoinEx API v1 expects lowercase market (e.g. "nachusdt")
    const url = `/market/ticker`;
    const params = { market: symbol.toLowerCase() };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `CoinEx ticker24h for ${symbol}`,
    );

    const data = response.data.data.ticker;
    // CoinEx vol is in base currency (token units), convert to USD: vol * price
    const volumeBase = parseFloat(data.vol || '0');
    const price = parseFloat(data.last || '0');
    const volume24hUSD = (volumeBase * price).toFixed(2);

    // Calculate 24h change: ((close - open) / open) * 100
    // CoinEx API doesn't always return percent, so calculate it
    const open = parseFloat(data.open || '0');
    const close = parseFloat(data.last || '0');
    const change24h = open !== 0 ? ((close - open) / open) * 100 : 0;

    return {
      symbol: symbol,
      price: data.last || '0',
      volume24h: volume24hUSD, // Converted to USD
      change24h: change24h.toFixed(2),
      high24h: data.high || '0',
      low24h: data.low || '0',
      open24h: data.open || '0',
      close24h: data.last || '0',
      timestamp: Date.now(),
    };
  }

  async fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/market/kline`;
    const market = symbol.replace(/[_/]/g, '').toUpperCase();
    const params = {
      market,
      type: '1day',
      limit: 24,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `CoinEx kline7d for ${symbol}`,
    );

    // CoinEx returns: [timestamp, open, close, high, low, volume, quote_vol]
    const klines = (response.data.data || []).map((candle: any[]) => ({
      timestamp: parseInt(candle[0]) * 1000, // Convert to milliseconds
      open: candle[1] || '0',
      high: candle[3] || '0',
      low: candle[4] || '0',
      close: candle[2] || '0',
      volume: candle[5] || '0',
    }));

    return {
      symbol: symbol,
      klines: klines.slice(0, 24), // Up to 24 daily candles
    };
  }

  /**
   * CoinEx kline: GET /v1/market/kline?market=SYMBOL&type=X&limit=N
   * Market format: NACHOUSDT (uppercase, no separator). 1month not available; use 1week for 1M.
   * 1h: type=1hour, limit=24 | 1M: type=1week, limit=12 | 1Y: type=1day, limit=52 | max: type=1day, limit=500
   * Response: { data: [ [timestamp_sec, open, close, high, low, volume, quote_vol], ... ] }
   */
  async fetchKlines(
    exchange: ExchangeEntity,
    symbol: string,
    interval: '1h' | '1d' | '1M' | '1Y' | 'max',
    limit: number,
  ): Promise<NormalizedKlinesResult> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/market/kline`;
    const market = symbol.replace(/[_/]/g, '').toUpperCase();
    const type =
      interval === '1h'
        ? '1min'
        : interval === '1M'
          ? '1week'
          : '1day'; // 1d, 1Y, max: daily candles
    const params = {
      market,
      type,
      limit,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `CoinEx klines ${interval} for ${symbol}`,
    );

    const arr = response.data?.data ?? response.data ?? [];
    const klines = (Array.isArray(arr) ? arr : []).map((candle: any[]) => ({
      timestamp: (parseInt(candle[0], 10) || 0) * 1000,
      open: String(candle[1] ?? '0'),
      high: String(candle[3] ?? '0'),
      low: String(candle[4] ?? '0'),
      close: String(candle[2] ?? '0'),
      volume: String(candle[5] ?? '0'),
    }));

    return {
      symbol,
      klines: klines.slice(0, limit),
    };
  }

  /** CoinEx trades API is v2; base URL for ticker/kline stays v1. */
  async fetchRecentTrades(
    exchange: ExchangeEntity,
    symbol: string,
    _limit: number = 50,
  ): Promise<NormalizedTradeFromAdapter[]> {
    const market = symbol.toLowerCase();
    const v2Client = this.createAxiosInstance('https://api.coinex.com/v2');
    const response = await this.executeRequest(
      () => v2Client.get('/spot/deals', { params: { market } }),
      `CoinEx recent trades for ${symbol}`,
    );
    const arr = response.data?.data ?? [];
    return arr.map((t: any) => {
      const ts = Number(t.created_at ?? 0);
      const price = String(t.price ?? '0');
      const amount = String(t.amount ?? '0');
      const side = (String(t.side ?? 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell';
      return {
        exchangeTradeId: String(t.deal_id ?? `${ts}_${price}_${amount}`),
        timestamp: ts,
        side,
        price,
        amount,
      };
    });
  }
}
