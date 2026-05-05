export interface KasplexRecentTrade {
  ticker: string;
  txId: string;
  to: string;
  from: string;
  price: number;
  totalPrice: number;
  quantity: number;
  accepted: boolean;
  txTime: number;
}
