import { ExchangeEntity } from '../../database/entities/exchange.entity';
import { NormalizedTradeFromAdapter } from '../dto/normalized-trade.dto';

/**
 * Dedicated contract for recent-trades integrations.
 * Kept separate from IExchangeAdapter so trade sync can evolve independently.
 */
export interface IRecentTradesAdapter {
  fetchRecentTrades(
    exchange: ExchangeEntity,
    tokenIdentifier: string,
    limit?: number,
  ): Promise<NormalizedTradeFromAdapter[]>;
}
