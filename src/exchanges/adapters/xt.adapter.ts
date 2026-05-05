// XT.com Exchange Adapter: Fetches 24h ticker and 7d K-line data from XT.com API,
// transforms to normalized format (API: https://doc.xt.com/)

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
export class XtAdapter extends BaseExchangeAdapter {
  private axiosInstance: AxiosInstance;

  constructor() {
    super('XtAdapter');
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
    // XT.com uses format: symbol (e.g., "NACHO_USDT")
    // Endpoint: /v4/public/ticker with MARKET parameter (uppercase, no underscore)
    // Convert symbol from "KREX_USDT" to "KREXUSDT" for MARKET parameter
    const marketParam = symbol.replace('_', '').toUpperCase();
    const url = `/v4/public/ticker`;
    const params = { MARKET: marketParam };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `XT.com ticker24h for ${symbol}`,
    );

    // XT.com returns: {rc: 0, mc: "SUCCESS", result: [{s: "krex_usdt", c: "0.00000996", cr: "0.0000", ...}]}
    // Find the matching symbol (response uses lowercase with underscore)
    const symbolLower = symbol.toLowerCase();
    const tickerData = response.data.result?.find(
      (item: any) => item.s === symbolLower,
    );

    if (!tickerData) {
      throw new Error(`Symbol ${symbol} not found in XT.com response`);
    }

    // XT.com q (quote volume) is already in USD, use it directly
    // If q is not available or 0, fall back to calculating from base volume (v) * price
    const quoteVolume = parseFloat(tickerData.q || '0');
    const volume24hUSD =
      quoteVolume > 0
        ? quoteVolume.toFixed(2)
        : (
            parseFloat(tickerData.v || '0') * parseFloat(tickerData.c || '0')
          ).toFixed(2);

    return {
      symbol: symbol,
      price: tickerData.c || '0',
      volume24h: volume24hUSD, // Already in USD (quote volume)
      change24h: tickerData.cr || '0', // cr is the change rate percentage
      high24h: tickerData.h || '0',
      low24h: tickerData.l || '0',
      open24h: tickerData.o || '0',
      close24h: tickerData.c || '0',
      timestamp: Date.now(),
    };
  }

  async fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    // XT.com uses /v4/public/klines with MARKET parameter
    const marketParam = symbol.replace('_', '').toUpperCase();
    const url = `/v4/public/klines`;
    const params = {
      MARKET: marketParam,
      interval: '1d',
      limit: 24,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `XT.com kline7d for ${symbol}`,
    );

    // XT.com returns: {rc: 0, result: [[timestamp, open, high, low, close, volume], ...]}
    const klines = (response.data.result || []).map((candle: any[]) => ({
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

  /**
   * XT.com kline: GET /v4/public/kline?symbol=X&interval=Y&limit=N (singular endpoint).
   * 1h: interval=1h, limit=24 | 1M: interval=1M, limit=12 | 1Y: interval=1d, limit=52 | max: interval=1d, limit=500
   * Response: result = [{ t, o, c, h, l, v }, ...] (objects, not arrays).
   */
  async fetchKlines(
    exchange: ExchangeEntity,
    symbol: string,
    interval: '1h' | '1d' | '1M' | '1Y' | 'max',
    limit: number,
  ): Promise<NormalizedKlinesResult> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const symbolParam = symbol.toLowerCase().replace('/', '_');
    const url = `/v4/public/kline`;
    let apiInterval: string;
    if (interval === '1h') {
      apiInterval = '1m';
    } else if (interval === '1M') {
      apiInterval = '1M';
    } else {
      apiInterval = '1d';
    }
    const params = {
      symbol: symbolParam,
      interval: apiInterval,
      limit,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `XT.com klines ${interval} for ${symbol}`,
    );

    const arr = response.data?.result ?? response.data ?? [];
    const klines = (Array.isArray(arr) ? arr : []).map((candle: any) => ({
      timestamp: parseInt(candle.t ?? candle[0], 10) || 0,
      open: String(candle.o ?? candle[1] ?? '0'),
      high: String(candle.h ?? candle[2] ?? '0'),
      low: String(candle.l ?? candle[3] ?? '0'),
      close: String(candle.c ?? candle[4] ?? '0'),
      volume: String(candle.v ?? candle[5] ?? '0'),
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
    const symbolParam = symbol.toLowerCase().replace('/', '_');
    const response = await this.executeRequest(
      () =>
        axiosInstance.get('/v4/public/trade/recent', {
          params: { symbol: symbolParam, limit },
        }),
      `XT.com recent trades for ${symbol}`,
    );
    const arr = response.data?.result ?? [];
    return arr.map((t: any) => {
      const ts = Number(t.t ?? 0);
      const price = String(t.p ?? '0');
      const qty = String(t.q ?? '0');
      const side = t.b ? 'buy' : 'sell';
      return {
        exchangeTradeId: String(t.i ?? `${ts}_${price}_${qty}`),
        timestamp: ts,
        side,
        price,
        amount: qty,
        quoteVolume: t.v != null ? String(t.v) : undefined,
      };
    });
  }
}
