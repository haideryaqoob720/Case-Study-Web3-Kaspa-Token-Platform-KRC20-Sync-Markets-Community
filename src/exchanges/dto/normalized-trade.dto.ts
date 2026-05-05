/**
 * Normalized trade shape for recent trades from any exchange.
 * Uniqueness: (exchangeCode, exchangeSymbol, exchangeTradeId).
 */
export interface NormalizedTrade {
  exchangeCode: string;
  exchangeSymbol: string;
  tokenIdentifier: string;
  exchangeTradeId: string;
  timestamp: number; // ms
  side: 'buy' | 'sell';
  price: string;
  amount: string;
  quoteVolume?: string;
}

/** Shape returned by adapters (processor adds exchangeCode, exchangeSymbol, tokenIdentifier). */
export type NormalizedTradeFromAdapter = Omit<
  NormalizedTrade,
  'exchangeCode' | 'exchangeSymbol' | 'tokenIdentifier'
>;
