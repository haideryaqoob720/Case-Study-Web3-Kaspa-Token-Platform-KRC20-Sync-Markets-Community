// MEXC Exchange Adapter: Fetches 24h ticker and 7d K-line data from MEXC API,
// transforms to normalized format (API: https://mexcdevelop.github.io/apidocs/spot_v3_en/)

import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ExchangeEntity } from '../../database/entities/exchange.entity';
import { BaseExchangeAdapter } from './base-exchange.adapter';
import {
  NormalizedTicker24h,
  NormalizedKline7d,
} from '../dto/normalized-market-data.dto';
import { NormalizedTradeFromAdapter } from '../dto/normalized-trade.dto';

@Injectable()
export class MexcAdapter extends BaseExchangeAdapter {
  private axiosInstance: AxiosInstance;

  constructor() {
    super('MexcAdapter');
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
    // MEXC API: GET /api/v3/ticker/24hr?symbol=SYMBOL
    const url = `/ticker/24hr`;
    const params = { symbol: symbol };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `MEXC ticker24h for ${symbol}`,
    );

    // MEXC returns a single object (not array) for ticker/24hr
    const data = response.data;

    // Handle MEXC error responses (e.g., {"msg": "invalid symbol", "code": -1121})
    if (data && data.code && data.code < 0) {
      throw new Error(
        `MEXC API error for ${symbol}: ${data.msg || 'Unknown error'}`,
      );
    }

    // Handle empty or null data
    if (!data || !data.symbol) {
      throw new Error(`No ticker data found for ${symbol}`);
    }

    // MEXC returns priceChangePercent as a string (e.g., "-0.1554" or "1.23")
    const changePercent = data.priceChangePercent
      ? parseFloat(data.priceChangePercent.toString()).toString()
      : '0';

    return {
      symbol: symbol,
      price: data.lastPrice || '0',
      volume24h: data.quoteVolume || '0',
      change24h: changePercent,
      high24h: data.highPrice || '0',
      low24h: data.lowPrice || '0',
      open24h: data.openPrice || data.lastPrice || '0',
      close24h: data.lastPrice || '0',
      timestamp: Date.now(),
    };
  }

  async fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    // MEXC API: GET /api/v3/klines?symbol=SYMBOL&interval=1d&limit=7
    const url = `/klines`;
    const params = {
      symbol: symbol,
      interval: '1d',
      limit: 24,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `MEXC kline7d for ${symbol}`,
    );

    // MEXC returns: [[timestamp, open, high, low, close, volume, ...], ...]
    // timestamp is in milliseconds
    const klines = (response.data || []).map((candle: any[]) => ({
      timestamp: parseInt(candle[0]), // Already in milliseconds
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

  async fetchRecentTrades(
    exchange: ExchangeEntity,
    symbol: string,
    limit: number = 50,
  ): Promise<NormalizedTradeFromAdapter[]> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const response = await this.executeRequest(
      () =>
        axiosInstance.get('/trades', { params: { symbol, limit } }),
      `MEXC recent trades for ${symbol}`,
    );
    const arr = Array.isArray(response.data) ? response.data : [];
    return arr.map((t: any) => {
      const time = Number(t.time ?? 0);
      const price = String(t.price ?? '0');
      const qty = String(t.qty ?? '0');
      const side = t.isBuyerMaker ? 'sell' : 'buy';
      return {
        exchangeTradeId: `${time}_${price}_${qty}`,
        timestamp: time,
        side,
        price,
        amount: qty,
        quoteVolume: t.quoteQty != null ? String(t.quoteQty) : undefined,
      };
    });
  }
}
