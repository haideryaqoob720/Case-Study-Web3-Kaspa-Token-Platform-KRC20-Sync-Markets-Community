// FameEX Exchange Adapter: Fetches 24h ticker and 7d K-line data from FameEX API,
// transforms to normalized format (API: https://www.fameex.com/en-US/api-docs)

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
export class FameExAdapter extends BaseExchangeAdapter {
  private axiosInstance: AxiosInstance;

  constructor() {
    super('FameExAdapter');
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
    // FameEX uses format: symbol (e.g., "NACHO_USDT" or "KASBTCUSDT")
    // Endpoint: /sapi/v1/ticker
    const url = `/sapi/v1/ticker`;
    const params = { symbol: symbol };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `FameEX ticker24h for ${symbol}`,
    );

    const data = response.data.data;
    // FameEX volume is in base currency (token units), convert to USD: volume * price
    const volumeBase = parseFloat(data.vol || '0');
    const price = parseFloat(data.last || '0');
    const volume24hUSD = (volumeBase * price).toFixed(2);

    // Calculate open price from change percentage if available
    // open = last / (1 + rose/100)
    let open24h = data.last || '0';
    if (data.rose && data.last) {
      const rose = parseFloat(data.rose);
      const last = parseFloat(data.last);
      if (rose !== 0 && !isNaN(rose) && !isNaN(last)) {
        open24h = (last / (1 + rose / 100)).toFixed(8);
      }
    }

    return {
      symbol: symbol,
      price: data.last || '0',
      volume24h: volume24hUSD, // Converted to USD
      change24h: data.rose || '0', // rose is the 24h change percentage
      high24h: data.high || '0',
      low24h: data.low || '0',
      open24h: open24h,
      close24h: data.last || '0',
      timestamp: Date.now(),
    };
  }

  async fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const url = `/sapi/v1/klines`;
    const params = {
      symbol: symbol,
      interval: '1day', // FameEX requires '1day' not '1d'
      limit: 24,
    };

    const response = await this.executeRequest(
      () => axiosInstance.get(url, { params }),
      `FameEX kline7d for ${symbol}`,
    );

    // FameEX returns: [{idx, open, high, low, close, vol}]
    // Note: response.data is the array directly, not wrapped in a data property
    // Handle cases where response.data might be an object (error) or not an array
    const responseData = response.data;
    if (!Array.isArray(responseData)) {
      // If response.data is an object with error code, throw error
      if (
        responseData &&
        typeof responseData === 'object' &&
        responseData.code
      ) {
        throw new Error(
          `FameEX API error: ${responseData.code} - ${responseData.msg || 'Unknown error'}`,
        );
      }
      // Otherwise, return empty array
      return {
        symbol: symbol,
        klines: [],
      };
    }

    const klines = responseData.map((candle: any) => ({
      timestamp: candle.idx || Date.now(), // idx is timestamp in milliseconds
      open: candle.open || '0',
      high: candle.high || '0',
      low: candle.low || '0',
      close: candle.close || '0',
      volume: candle.vol || '0',
    }));

    return {
      symbol: symbol,
      klines: klines.slice(0, 24), // Up to 24 daily candles
    };
  }

  async fetchRecentTrades(
    exchange: ExchangeEntity,
    symbol: string,
    _limit: number = 50,
  ): Promise<NormalizedTradeFromAdapter[]> {
    const axiosInstance = this.getAxiosInstance(exchange.apiBaseUrl);
    const response = await this.executeRequest(
      () =>
        axiosInstance.get('/v2/public/trades/market_pair', {
          params: { market_pair: symbol },
        }),
      `FameEX recent trades for ${symbol}`,
    );
    const arr = response.data?.data ?? [];
    return arr.map((t: any) => {
      const tsRaw = Number(t.timestamp ?? 0);
      const ts = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
      const price = String(t.price ?? '0');
      const amount = String(t.base_volume ?? '0');
      const side = (String(t.type ?? 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell';
      return {
        exchangeTradeId: String(t.trade_id ?? `${ts}_${price}_${amount}`),
        timestamp: ts,
        side,
        price,
        amount,
        quoteVolume: t.quote_volume != null ? String(t.quote_volume) : undefined,
      };
    });
  }
}
