// Pionex Exchange Adapter: Fetches 24h ticker and 7d K-line data from Pionex API,
// transforms to normalized format (API: https://pionex-docs.gitbook.io/pionex-api-docs/)

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
export class PionexAdapter extends BaseExchangeAdapter {
  private axiosInstance: AxiosInstance;

  constructor() {
    super('PionexAdapter');
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
    // Pionex API: GET /api/v1/market/tickers (returns all tickers, filter by symbol)
    const url = `/market/tickers`;

    const response = await this.executeRequest(
      () => axiosInstance.get(url),
      `Pionex ticker24h for ${symbol}`,
    );

    // Pionex returns: { result: true, data: { tickers: [{ symbol, time, open, close, high, low, volume, amount, count }] } }
    const tickers = response.data.data?.tickers || [];
    const ticker = tickers.find((t: any) => t.symbol === symbol);

    if (!ticker) {
      throw new Error(`Ticker ${symbol} not found in Pionex response`);
    }

    const data = ticker;

    // Calculate 24h change: ((close - open) / open) * 100
    const open = parseFloat(data.open || '0');
    const close = parseFloat(data.close || '0');
    const change24h = open !== 0 ? ((close - open) / open) * 100 : 0;

    return {
      symbol: symbol,
      price: data.close || '0',
      volume24h: data.amount || '0', // amount is in quote currency (USDT)
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
    const url = `/market/klines`;
    const params = {
      symbol: symbol,
      interval: '1D', // Pionex uses capital D for daily
      limit: 24,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `Pionex kline7d for ${symbol}`,
    );

    // Pionex returns: { result: true, data: { klines: [{ time, open, close, high, low, volume }] } }
    const klines = (response.data.data?.klines || []).map((candle: any) => ({
      timestamp: candle.time || Date.now(),
      open: candle.open || '0',
      high: candle.high || '0',
      low: candle.low || '0',
      close: candle.close || '0',
      volume: candle.volume || '0',
    }));

    return {
      symbol: symbol,
      klines: klines.slice(0, 24), // Up to 24 daily candles
    };
  }

  /**
   * Pionex klines: GET /market/klines?symbol=X&interval=Y&limit=N
   * Supported intervals: 4H, 12H, 1D, 1M (1H not supported; use 4H for 1h with limit=6).
   * 1h: interval=4H, limit=6 (6×4h = 24h) | 1M: interval=1M, limit=12 | 1Y: interval=1D, limit=52 | max: interval=1D, limit=500
   * Response: { result: true, data: { klines: [{ time, open, close, high, low, volume }] } }
   */
  async fetchKlines(
    exchange: ExchangeEntity,
    symbol: string,
    interval: '1h' | '1d' | '1M' | '1Y' | 'max',
    limit: number,
  ): Promise<NormalizedKlinesResult> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/market/klines`;
    let apiInterval: string;
    let requestLimit: number;
    if (interval === '1h') {
      apiInterval = '15M'; // smallest reliable short interval for 1h chart
      requestLimit = Math.min(limit, 120);
    } else if (interval === '1M') {
      apiInterval = '1M';
      requestLimit = limit;
    } else {
      apiInterval = '1D';
      requestLimit = limit;
    }
    const params = { symbol, interval: apiInterval, limit: requestLimit };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `Pionex klines ${interval} for ${symbol}`,
    );

    const klinesArr = response.data?.data?.klines ?? response.data?.klines ?? [];
    const klines = (Array.isArray(klinesArr) ? klinesArr : []).map((candle: any) => ({
      timestamp: parseInt(candle.time ?? candle[0], 10) || 0,
      open: String(candle.open ?? candle[1] ?? '0'),
      high: String(candle.high ?? candle[2] ?? '0'),
      low: String(candle.low ?? candle[3] ?? '0'),
      close: String(candle.close ?? candle[4] ?? '0'),
      volume: String(candle.volume ?? candle[5] ?? '0'),
    }));

    return {
      symbol,
      klines: klines.slice(0, limit),
    };
  }

  async fetchRecentTrades(
    exchange: ExchangeEntity,
    symbol: string,
    limit: number = 50,
  ): Promise<NormalizedTradeFromAdapter[]> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const response = await this.executeRequest(
      () =>
        axiosInstance.get('/market/trades', { params: { symbol, limit } }),
      `Pionex recent trades for ${symbol}`,
    );
    const trades = response.data?.data?.trades ?? [];
    return trades.map((t: any) => {
      const ts = Number(t.timestamp ?? 0);
      const price = String(t.price ?? '0');
      const amount = String(t.size ?? '0');
      const side = (String(t.side ?? 'BUY').toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell';
      return {
        exchangeTradeId: String(t.tradeId ?? `${ts}_${price}_${amount}`),
        timestamp: ts,
        side,
        price,
        amount,
      };
    });
  }
}
