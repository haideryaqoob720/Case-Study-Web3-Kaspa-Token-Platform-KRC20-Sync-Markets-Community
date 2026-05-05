// Recent Trades Service: Fetches latest trades and converts to KAS + USD using kas config (same as token/floor APIs).

import { Injectable } from '@nestjs/common';
import { RecentTradesRepository } from '../repositories/recent-trades.repository';
import { KasplexRecentTradesRepository } from '../repositories/kasplex-recent-trades.repository';
import { ExchangesRepository } from '../repositories/exchanges.repository';
import { ExchangesService } from './exchanges.service';
import {
  RecentTradeResponseDto,
  RecentTradesApiResponse,
} from '../dto/recent-trade-response.dto';
import { RecentTradeDocument } from '../../database/schemas/recent-trade.schema';
import { KasplexRecentTradeDocument } from '../../database/schemas/kasplex-recent-trade.schema';
import { KasPriceService } from '../../kas-price/kas-price.service';

@Injectable()
export class RecentTradesService {
  constructor(
    private readonly recentTradesRepository: RecentTradesRepository,
    private readonly kasplexRecentTradesRepository: KasplexRecentTradesRepository,
    private readonly exchangesRepository: ExchangesRepository,
    private readonly exchangesService: ExchangesService,
    private readonly kasPriceService: KasPriceService,
  ) {}

  async getKasplexRecentTrades(
    ticker: string,
    limit = 20,
  ): Promise<KasplexRecentTradeDocument[]> {
    return this.kasplexRecentTradesRepository.findLatestByTicker(ticker, limit);
  }

  /**
   * Get latest trades with price/total in KAS and USD.
   * KAS/USD rate from cache or CoinGecko; exchange stores price in USDT (USD).
   */
  async getRecentTrades(options: {
    tokenIdentifier?: string;
    limit?: number;
  }): Promise<RecentTradesApiResponse> {
    const { tokenIdentifier, limit = 50 } = options;
    const kasUsdRate = await this.kasPriceService.getKasUsdRate();
    const docs = await this.recentTradesRepository.findLatest({
      tokenIdentifier,
      limit,
    });
    const codes = [...new Set(docs.map((d) => d.exchangeCode).filter(Boolean))] as string[];
    const exchanges = await this.exchangesRepository.findByCodes(codes);
    const logoUrlByCode = new Map<string, string>();
    for (const ex of exchanges) {
      const code = (ex as any).code;
      if (code) {
        logoUrlByCode.set(
          code,
          this.exchangesService.getExchangeLogoUrlForCode(code, (ex as any).logoUrl ?? null),
        );
      }
    }
    const trades = docs.map((doc) =>
      this.toResponseDto(doc, logoUrlByCode, kasUsdRate),
    );
    return { kasUsdRate, trades };
  }

  private toResponseDto(
    doc: RecentTradeDocument,
    logoUrlByCode: Map<string, string>,
    kasUsdRate: number,
  ): RecentTradeResponseDto {
    const priceUsd = parseFloat(doc.price ?? '0');
    const quantity = parseFloat(doc.amount ?? '0');
    const totalUsd = quantity * priceUsd;
    const priceKas = kasUsdRate > 0 ? priceUsd / kasUsdRate : 0;
    const totalKas = kasUsdRate > 0 ? totalUsd / kasUsdRate : 0;

    const exchangeCode = doc.exchangeCode ?? '';
    const exchangeLogoUrl = logoUrlByCode.get(exchangeCode) ?? this.exchangesService.getExchangeLogoUrlForCode(exchangeCode, null);

    return {
      id: doc.exchangeTradeId,
      quantity,
      price: priceKas,
      totalPrice: totalKas,
      priceUsd,
      totalUsd,
      timestamp: doc.timestamp,
      fulfillTime: this.formatFulfillTime(doc.timestamp),
      type: doc.side === 'buy' ? 'buy' : 'sell',
      exchangeCode: doc.exchangeCode,
      exchangeLogoUrl,
    };
  }

  private formatFulfillTime(timestampMs: number): string {
    const diff = Date.now() - timestampMs;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    return 'Just now';
  }
}
