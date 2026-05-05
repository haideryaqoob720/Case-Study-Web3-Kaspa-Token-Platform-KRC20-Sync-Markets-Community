// Normalized Market Data DTOs: Defines the common data format that all exchange
// adapters return (NormalizedTicker24h, NormalizedKline, NormalizedKline7d)

/**
 * Normalized market data DTOs
 * These represent the common format that all exchange adapters return
 */

export interface NormalizedTicker24h {
  symbol: string; // Exchange-specific symbol (e.g., "NACHO_USDT")
  price: string; // Last price
  volume24h: string; // 24h volume in quote currency
  change24h: string; // 24h price change percentage
  high24h: string; // 24h high price
  low24h: string; // 24h low price
  open24h: string; // 24h open price
  close24h: string; // 24h close price (usually same as price)
  timestamp: number; // Unix timestamp in milliseconds
}

export interface NormalizedKline {
  timestamp: number; // Unix timestamp in milliseconds
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface NormalizedKline7d {
  symbol: string; // Exchange-specific symbol
  klines: NormalizedKline[]; // Array of 7 candles (one per day)
}

/** Result of fetchKlines for 1h, 1M, 1Y, max intervals */
export interface NormalizedKlinesResult {
  symbol: string;
  klines: NormalizedKline[];
}
