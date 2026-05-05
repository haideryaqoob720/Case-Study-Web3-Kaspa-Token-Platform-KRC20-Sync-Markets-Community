// Exchange Adapter Interface: Defines the contract that all exchange adapters must
// implement (fetchTicker24h and fetchKline7d methods for normalized market data)

import { ExchangeEntity } from '../../database/entities/exchange.entity';
import {
  NormalizedTicker24h,
  NormalizedKline7d,
  NormalizedKlinesResult,
} from '../dto/normalized-market-data.dto';
import { NormalizedTradeFromAdapter } from '../dto/normalized-trade.dto';

/**
 * Exchange Adapter Interface
 * All exchange adapters must implement this interface
 */
export interface IExchangeAdapter {
  /**
   * Fetch 24h ticker data for a specific symbol
   * @param exchange Exchange entity
   * @param symbol Exchange-specific symbol (e.g., "NACHO_USDT")
   * @returns Normalized 24h ticker data
   */
  fetchTicker24h(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedTicker24h>;

  /**
   * Fetch 7d K-line data for a specific symbol
   * @param exchange Exchange entity
   * @param symbol Exchange-specific symbol (e.g., "NACHO_USDT")
   * @returns Normalized 7d K-line data (7 candles)
   */
  fetchKline7d(
    exchange: ExchangeEntity,
    symbol: string,
  ): Promise<NormalizedKline7d>;

  /**
   * Optional: fetch 24h tickers for multiple symbols in one or few requests.
   * If not implemented, processor falls back to per-symbol fetchTicker24h.
   */
  fetchTickers24hBatch?(
    exchange: ExchangeEntity,
    symbols: string[],
  ): Promise<NormalizedTicker24h[]>;

  /**
   * Optional: fetch 7d klines for multiple symbols (e.g. parallel or batch request).
   * If not implemented, processor falls back to per-symbol fetchKline7d.
   */
  fetchKlines7dBatch?(
    exchange: ExchangeEntity,
    symbols: string[],
  ): Promise<NormalizedKline7d[]>;

  /**
   * Optional: fetch klines for 1h, 1d, 1M, 1Y, max. If not implemented, that exchange is skipped for kline sync.
   * interval: our interval key ('1h' | '1d' | '1M' | '1Y' | 'max'), limit: number of candles to request.
   */
  fetchKlines?(
    exchange: ExchangeEntity,
    symbol: string,
    interval: '1h' | '1d' | '1M' | '1Y' | 'max',
    limit: number,
  ): Promise<NormalizedKlinesResult>;

  /**
   * Optional: fetch recent trades for a symbol (for recent_trades table).
   * If not implemented, this pair is skipped for trades sync.
   */
  fetchRecentTrades?(
    exchange: ExchangeEntity,
    symbol: string,
    limit?: number,
  ): Promise<NormalizedTradeFromAdapter[]>;
}
