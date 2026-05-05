// BitMart Exchange Adapter: Fetches 24h ticker and 7d K-line data from BitMart API,
// transforms to normalized format (API: https://developer-pro.bitmart.com/en/spot/)

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
export class BitMartAdapter extends BaseExchangeAdapter {
  private axiosInstance: AxiosInstance;

  constructor() {
    super('BitMartAdapter');
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
    // BitMart uses format: symbol (e.g., "NACHO_USDT")
    const url = `/spot/v1/ticker`;
    const params = { symbol: symbol };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `BitMart ticker24h for ${symbol}`,
    );

    // BitMart returns: { data: { tickers: [{ ... }] } }
    const tickers = response.data.data.tickers || [];
    if (tickers.length === 0) {
      throw new Error(`No ticker data found for ${symbol}`);
    }
    const data = tickers[0];

    // Convert fluctuation percentage (e.g., "+0.2685" or "-0.1234") to number
    const changePercent = data.fluctuation
      ? parseFloat(data.fluctuation.toString().replace(/[+]/g, ''))
      : '0';

    return {
      symbol: symbol,
      price: data.last_price || '0',
      volume24h: data.quote_volume_24h || '0',
      change24h: changePercent.toString(),
      high24h: data.high_24h || '0',
      low24h: data.low_24h || '0',
      open24h: data.open_24h || '0',
      close24h: data.close_24h || data.last_price || '0',
      timestamp: Date.now(),
    };
  }

  async fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    // BitMart uses v3 lite-klines endpoint for better performance
    const url = `/spot/quotation/v3/lite-klines`;
    const params = {
      symbol: symbol,
      step: 1440, // 1 day in minutes
      limit: 24,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `BitMart kline7d for ${symbol}`,
    );

    // BitMart v3 returns: { code: 1000, data: [[timestamp, open, high, low, close, volume, quote_volume], ...] }
    const klines = (response.data.data || []).map((candle: any[]) => ({
      timestamp: parseInt(candle[0]) * 1000, // Convert to milliseconds
      open: candle[1] || '0',
      high: candle[2] || '0',
      low: candle[3] || '0',
      close: candle[4] || '0',
      volume: candle[5] || '0',
    }));

    return {
      symbol: symbol,
      klines: klines.slice(0, 24), // Up to 24 daily candles
    };
  }

  /**
   * BitMart klines: GET /spot/quotation/v3/klines?symbol=X&step=Y&limit=N
   * step in minutes: 60=1h, 1440=1d, 43200≈30d. Exclude 7d/1d (24h); add 1h, 1M, 1Y, max.
   * 1h: step=60, limit=24 | 1M: step=43200, limit=12 | 1Y: step=1440, limit=52 | max: step=1440, limit=500
   * Response: { code: 1000, data: [[timestamp_sec, open, high, low, close, volume, quote_vol], ...] }
   */
  async fetchKlines(
    exchange: ExchangeEntity,
    symbol: string,
    interval: '1h' | '1d' | '1M' | '1Y' | 'max',
    limit: number,
  ): Promise<NormalizedKlinesResult> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/spot/quotation/v3/klines`;
    let step: number;
    if (interval === '1h') {
      step = 1;
    } else if (interval === '1M') {
      step = 43200; // 30 days in minutes
    } else {
      step = 1440; // 1 day
    }
    const params = { symbol, step, limit };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `BitMart klines ${interval} for ${symbol}`,
    );

    const arr = response.data?.data ?? response.data ?? [];
    const klines = (Array.isArray(arr) ? arr : []).map((candle: any[]) => ({
      timestamp: (parseInt(candle[0], 10) || 0) * 1000,
      open: String(candle[1] ?? '0'),
      high: String(candle[2] ?? '0'),
      low: String(candle[3] ?? '0'),
      close: String(candle[4] ?? '0'),
      volume: String(candle[5] ?? '0'),
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
    // BitMart: GET /spot/quotation/v3/trades?symbol=X
    const response = await this.executeRequest(
      () =>
        axiosInstance.get('/spot/quotation/v3/trades', { params: { symbol } }),
      `BitMart recent trades for ${symbol}`,
    );
    const arr = response.data?.data ?? [];
    return arr.map((row: any[]) => {
      const [sym, tsStr, price, amount, sideStr] = row;
      const ts = parseInt(String(tsStr ?? 0), 10);
      const priceS = String(price ?? '0');
      const amountS = String(amount ?? '0');
      const side = (String(sideStr ?? 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell';
      return {
        exchangeTradeId: `${ts}_${priceS}_${amountS}`,
        timestamp: ts,
        side,
        price: priceS,
        amount: amountS,
      };
    });
  }
}
