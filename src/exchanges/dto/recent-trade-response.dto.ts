/**
 * Single trade in recent-trades API response.
 * Price and total are in KAS; priceUsd and totalUsd for display in USD.
 */
export interface RecentTradeResponseDto {
  id: string;
  quantity: number;
  price: number;
  totalPrice: number;
  priceUsd: number;
  totalUsd: number;
  timestamp: number;
  fulfillTime: string;
  type: 'buy' | 'sell';
  exchangeCode?: string;
  /** Exchange logo URL (same as tokens API marketData.exchangeLogoUrl). */
  exchangeLogoUrl?: string;
}

/** Recent trades API response: KAS/USD rate used for conversions + trades list. */
export interface RecentTradesApiResponse {
  kasUsdRate: number;
  trades: RecentTradeResponseDto[];
}
