import { Injectable, Logger } from '@nestjs/common';
import { ExchangeEntity } from '../../database/entities/exchange.entity';
import { NormalizedTradeFromAdapter } from '../dto/normalized-trade.dto';
import { KasplexRecentTrade } from '../dto/kasplex-recent-trade.dto';
import { IRecentTradesAdapter } from '../interfaces/recent-trades-adapter.interface';
import {
  KasplexApiService,
  KasplexKrc20OpRaw,
} from '../../kasplex/kasplex-api.service';

/**
 * Standalone recent-trades adapter path.
 * This service is intentionally separate from ExchangeAdapterFactoryService.
 */
@Injectable()
export class RecentTradesAdapterService implements IRecentTradesAdapter {
  private readonly logger = new Logger(RecentTradesAdapterService.name);
  private readonly cursorByIdentifier = new Map<
    string,
    { next: string | null; prev: string | null }
  >();
  private readonly decimalsByIdentifier = new Map<string, number>();

  constructor(private readonly kasplexApiService: KasplexApiService) {}

  async fetchRecentTrades(
    exchange: ExchangeEntity,
    tokenIdentifier: string,
    limit = 50,
  ): Promise<NormalizedTradeFromAdapter[]> {
    const rawTrades = await this.fetchRecentTradesFromApi(
      exchange,
      tokenIdentifier,
      limit,
    );
    return this.normalizeRecentTrades(rawTrades, exchange, tokenIdentifier);
  }

  async fetchKasplexRecentTrades(
    exchange: ExchangeEntity,
    tokenIdentifier: string,
    limit = 50,
  ): Promise<KasplexRecentTrade[]> {
    const rawTrades = await this.fetchRecentTradesFromApi(
      exchange,
      tokenIdentifier,
      limit,
    );
    const tokenDecimals = await this.getTokenDecimals(tokenIdentifier, rawTrades);
    return rawTrades
      .map((row) => this.transformKasplexSendOp(row, tokenIdentifier, tokenDecimals))
      .filter((trade) => Boolean(trade.txId) && trade.price > 0 && trade.quantity > 0);
  }

  private async fetchRecentTradesFromApi(
    exchange: ExchangeEntity,
    tokenIdentifier: string,
    limit: number,
  ): Promise<KasplexKrc20OpRaw[]> {
    // TODO(recent-trades-live-api): if dedicated endpoint differs from Kasplex oplist,
    // replace this request with the new trades API call.
    const existingCursor = this.cursorByIdentifier.get(tokenIdentifier);
    const nextCursor = existingCursor?.next ?? null;

    // NOTE: when next cursor is null/empty, call API without `next` param.
    const response = await this.kasplexApiService.fetchKrc20OpList(
      nextCursor
        ? { tick: tokenIdentifier, next: nextCursor }
        : { tick: tokenIdentifier },
    );

    this.saveCursorStateForIdentifier(
      tokenIdentifier,
      response.next ?? null,
      response.prev ?? null,
    );

    const sendOps = response.result.filter((row) => row?.op === 'send');
    const tokenDecimals = await this.getTokenDecimals(tokenIdentifier, sendOps);
    const transformedByRow = sendOps.map((row) => ({
      row,
      transformed: this.transformKasplexSendOp(row, tokenIdentifier, tokenDecimals),
    }));
    const filteredByPrice = transformedByRow.filter(
      ({ transformed }) => transformed.price !== 0,
    );
    const filteredSendOps = filteredByPrice.map(({ row }) => row);
    if (filteredSendOps.length > limit) {
      return filteredSendOps.slice(0, limit);
    }

    if (this.logger.debug) {
      this.logger.debug(
        `Recent trades adapter: token=${tokenIdentifier}, sendOps=${sendOps.length}, decimals=${tokenDecimals}, next=${response.next ?? 'null'}, prev=${response.prev ?? 'null'}`,
      );
    }

    void exchange;
    return filteredSendOps;
  }

  private saveCursorStateForIdentifier(
    tokenIdentifier: string,
    next: string | null,
    prev: string | null,
  ): void {
    this.cursorByIdentifier.set(tokenIdentifier, { next, prev });
  }

  private transformKasplexSendOp(
    row: KasplexKrc20OpRaw,
    tokenIdentifier: string,
    tokenDecimals: number,
  ): KasplexRecentTrade {
    const decimals = Number.isFinite(tokenDecimals) ? tokenDecimals : 8;
    // `amt` and `price` come as big-number strings from Kasplex.
    const tokenRawAmountBn = this.parseBigInt(row.amt);
    const totalPriceKasRawBn = this.parseBigInt(row.price);
    const quantity = this.scaleBigIntToNumber(tokenRawAmountBn, decimals);
    const totalPrice = this.scaleBigIntToNumber(totalPriceKasRawBn, 8);
    const unitPriceKas = quantity > 0 ? totalPrice / quantity : 0;
    const txTime = this.parseInteger(row.mtsAdd, 0);

    return {
      ticker: String(row.tick ?? tokenIdentifier).toUpperCase(),
      txId: String(row.hashRev ?? ''),
      to: String(row.to ?? ''),
      from: String(row.from ?? ''),
      price: Number(unitPriceKas.toFixed(8)),
      totalPrice: Number(totalPrice.toFixed(8)),
      quantity: Number(quantity.toFixed(Math.min(decimals, 8))),
      accepted: this.isAccepted(row.txAccept) && this.isAccepted(row.opAccept),
      txTime,
    };
  }

  private async getTokenDecimals(
    tokenIdentifier: string,
    fallbackRows: KasplexKrc20OpRaw[],
  ): Promise<number> {
    const normalizedIdentifier = tokenIdentifier.trim().toUpperCase();
    const cached = this.decimalsByIdentifier.get(normalizedIdentifier);
    if (cached != null) return cached;

    try {
      // Reuse existing Kasplex client function already used across the codebase.
      const tokenInfo = await this.kasplexApiService.fetchTokenInfo(
        normalizedIdentifier,
      );
      const raw = tokenInfo as {
        result?: Array<{ dec?: unknown; decimal?: unknown }>;
      };
      const decFromInfo = raw.result?.[0]?.dec ?? raw.result?.[0]?.decimal;
      const parsed = this.parseInteger(decFromInfo, NaN);
      if (Number.isFinite(parsed) && parsed >= 0) {
        this.decimalsByIdentifier.set(normalizedIdentifier, parsed);
        return parsed;
      }
    } catch (error) {
      this.logger.warn(
        `Recent trades adapter: failed to fetch token decimals for ${normalizedIdentifier}, fallback to row.dec/default. (${error instanceof Error ? error.message : 'Unknown error'})`,
      );
    }

    const fallback = this.parseInteger(fallbackRows[0]?.dec, 8);
    this.decimalsByIdentifier.set(normalizedIdentifier, fallback);
    return fallback;
  }

  private parseInteger(value: unknown, fallback = 0): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private parseBigInt(value: unknown): bigint {
    const normalized = String(value ?? '0').trim();
    if (!normalized) return 0n;
    try {
      return BigInt(normalized);
    } catch {
      return 0n;
    }
  }

  private scaleBigIntToNumber(value: bigint, decimals: number): number {
    if (decimals <= 0) return Number(value);
    const divisor = 10n ** BigInt(decimals);
    const whole = value / divisor;
    const fraction = value % divisor;
    return Number(whole) + Number(fraction) / Number(divisor);
  }

  private isAccepted(value: unknown): boolean {
    const normalized = String(value ?? '').trim();
    return normalized === '1';
  }

  private async normalizeRecentTrades(
    rawTrades: KasplexKrc20OpRaw[],
    exchange: ExchangeEntity,
    tokenIdentifier: string,
  ): Promise<NormalizedTradeFromAdapter[]> {
    void exchange;
    const tokenDecimals = await this.getTokenDecimals(tokenIdentifier, rawTrades);
    const normalized = rawTrades
      .map((row) => this.transformKasplexSendOp(row, tokenIdentifier, tokenDecimals))
      .filter((trade) => Boolean(trade.txId) && trade.price > 0 && trade.quantity > 0)
      .map((trade) => ({
        exchangeTradeId: trade.txId,
        timestamp: trade.txTime,
        side: 'sell' as const,
        price: trade.price.toFixed(8),
        amount: trade.quantity.toFixed(8),
        quoteVolume: trade.totalPrice.toFixed(8),
      }));

    return normalized;
  }
}
