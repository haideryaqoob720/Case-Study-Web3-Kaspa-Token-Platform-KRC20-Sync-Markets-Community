// Exchanges Repository: MongoDB operations via Mongoose
// What: Exchanges, token-exchange pairs, 24h/7d market data, sync logs

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  ExchangeDocument,
  ExchangeEntity,
} from '../../database/schemas/exchange.schema';
import {
  TokenExchangeDocument,
  TokenExchangeEntity,
} from '../../database/schemas/token-exchange.schema';
import {
  ExchangeMarketData24hDocument,
  ExchangeMarketData24hEntity,
} from '../../database/schemas/exchange-market-data-24h.schema';
import {
  ExchangeMarketData7dDocument,
  ExchangeMarketData7dEntity,
} from '../../database/schemas/exchange-market-data-7d.schema';
import {
  ExchangeSyncLogDocument,
  ExchangeSyncLogEntity,
} from '../../database/schemas/exchange-sync-log.schema';
import {
  ExchangeMarketData1hDocument,
  ExchangeMarketData1hEntity,
} from '../../database/schemas/exchange-market-data-1h.schema';
import {
  ExchangeMarketData1dDocument,
} from '../../database/schemas/exchange-market-data-1d.schema';
import {
  ExchangeMarketData1MDocument,
  ExchangeMarketData1MEntity,
} from '../../database/schemas/exchange-market-data-1M.schema';
import {
  ExchangeMarketData1YDocument,
  ExchangeMarketData1YEntity,
} from '../../database/schemas/exchange-market-data-1Y.schema';
import {
  ExchangeMarketDataMaxDocument,
  ExchangeMarketDataMaxEntity,
} from '../../database/schemas/exchange-market-data-max.schema';
import { ExchangeKlinesSyncStateDocument } from '../../database/schemas/exchange-klines-sync-state.schema';
import { AggregatedTokenCandleDocument } from '../../database/schemas/aggregated-token-candle.schema';

/** Market data with exchange populated (repository attaches it) */
export type ExchangeMarketData24hWithExchange = ExchangeMarketData24hEntity & {
  exchange?: ExchangeEntity | null;
};
export type ExchangeMarketData7dWithExchange = ExchangeMarketData7dEntity & {
  exchange?: ExchangeEntity | null;
};

@Injectable()
export class ExchangesRepository {
  private readonly logger = new Logger(ExchangesRepository.name);
  private readonly maxFailuresBeforeDisable: number;
  private readonly exchangeMetaCacheTtlMs = 5 * 60 * 1000;
  private exchangeMetaCache = new Map<
    string,
    { value: ExchangeEntity; expiresAt: number }
  >();

  constructor(
    @InjectModel(ExchangeDocument.name)
    private exchangesModel: Model<ExchangeDocument>,
    @InjectModel(TokenExchangeDocument.name)
    private tokenExchangesModel: Model<TokenExchangeDocument>,
    @InjectModel(ExchangeMarketData24hDocument.name)
    private marketData24hModel: Model<ExchangeMarketData24hDocument>,
    @InjectModel(ExchangeMarketData7dDocument.name)
    private marketData7dModel: Model<ExchangeMarketData7dDocument>,
    @InjectModel(ExchangeMarketData1hDocument.name)
    private marketData1hModel: Model<ExchangeMarketData1hDocument>,
    @InjectModel(ExchangeMarketData1dDocument.name)
    private marketData1dModel: Model<ExchangeMarketData1dDocument>,
    @InjectModel(ExchangeMarketData1MDocument.name)
    private marketData1MModel: Model<ExchangeMarketData1MDocument>,
    @InjectModel(ExchangeMarketData1YDocument.name)
    private marketData1YModel: Model<ExchangeMarketData1YDocument>,
    @InjectModel(ExchangeMarketDataMaxDocument.name)
    private marketDataMaxModel: Model<ExchangeMarketDataMaxDocument>,
    @InjectModel(ExchangeKlinesSyncStateDocument.name)
    private klinesSyncStateModel: Model<ExchangeKlinesSyncStateDocument>,
    @InjectModel(AggregatedTokenCandleDocument.name)
    private aggregatedTokenCandleModel: Model<AggregatedTokenCandleDocument>,
    @InjectModel(ExchangeSyncLogDocument.name)
    private syncLogModel: Model<ExchangeSyncLogDocument>,
    private configService: ConfigService,
  ) {
    const workerConfig = this.configService.get('worker');
    this.maxFailuresBeforeDisable =
      workerConfig?.failure?.maxFailuresBeforeDisable ?? 5;
  }

  private toExchangeEntity(doc: any): ExchangeEntity {
    if (!doc) return doc;
    const id = String(doc._id ?? doc.id);
    return { ...doc, id } as ExchangeEntity;
  }

  private async getExchangeMapByIds(
    ids: string[],
  ): Promise<Map<string, ExchangeEntity>> {
    const now = Date.now();
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    const result = new Map<string, ExchangeEntity>();
    const missing: string[] = [];

    for (const id of uniqueIds) {
      const cached = this.exchangeMetaCache.get(id);
      if (cached && cached.expiresAt > now) {
        result.set(id, cached.value);
      } else {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      const docs = await this.exchangesModel
        .find({ _id: { $in: missing } })
        .lean()
        .exec();
      for (const d of docs as any[]) {
        const key = String(d._id);
        const value = this.toExchangeEntity(d);
        result.set(key, value);
        this.exchangeMetaCache.set(key, {
          value,
          expiresAt: now + this.exchangeMetaCacheTtlMs,
        });
      }
    }

    return result;
  }

  async countExchanges(): Promise<number> {
    return this.exchangesModel.countDocuments().exec();
  }

  async findAll(): Promise<ExchangeEntity[]> {
    const docs = await this.exchangesModel
      .find({})
      .sort({ name: 1 })
      .lean()
      .exec();
    return (docs as any[]).map((d) => this.toExchangeEntity(d));
  }

  async findAllActive(): Promise<ExchangeEntity[]> {
    const docs = await this.exchangesModel
      .find({ isActive: true })
      .sort({ name: 1 })
      .lean()
      .exec();
    return (docs as any[]).map((d) => this.toExchangeEntity(d));
  }

  async findByCode(code: string): Promise<ExchangeEntity | null> {
    const doc = await this.exchangesModel.findOne({ code }).lean().exec();
    return this.toExchangeEntity(doc);
  }

  /** Find exchanges by codes (for resolving logo URLs in bulk). */
  async findByCodes(codes: string[]): Promise<ExchangeEntity[]> {
    if (codes.length === 0) return [];
    const uniq = [...new Set(codes)];
    const docs = await this.exchangesModel
      .find({ code: { $in: uniq } })
      .lean()
      .exec();
    return (docs as any[]).map((d) => this.toExchangeEntity(d));
  }

  async createExchange(
    data: Partial<ExchangeEntity> & {
      code: string;
      name: string;
      apiBaseUrl: string;
    },
  ): Promise<ExchangeEntity> {
    const doc = await this.exchangesModel.create(data);
    return this.toExchangeEntity(doc.toObject ? doc.toObject() : doc);
  }

  async findById(id: string): Promise<ExchangeEntity | null> {
    const doc = await this.exchangesModel.findById(id).lean().exec();
    return this.toExchangeEntity(doc);
  }

  async findAllActiveTokenExchanges(): Promise<TokenExchangeEntity[]> {
    const docs = await this.tokenExchangesModel
      .find({ isActive: true })
      .sort({ tokenIdentifier: 1 })
      .lean()
      .exec();
    const exchangeIds = [
      ...new Set(docs.map((d) => d.exchangeId).filter(Boolean)),
    ];
    const exchanges = exchangeIds.length
      ? await this.exchangesModel
          .find({ _id: { $in: exchangeIds } })
          .lean()
          .exec()
      : [];
    const exchangeMap = new Map(
      (exchanges as any[]).map((e) => [
        String(e._id),
        this.toExchangeEntity(e),
      ]),
    );
    return docs.map((d) => ({
      ...d,
      exchange: exchangeMap.get(d.exchangeId) ?? null,
    })) as unknown as TokenExchangeEntity[];
  }

  async findTokenExchangesByIdentifier(
    identifier: string,
  ): Promise<TokenExchangeEntity[]> {
    const docs = await this.tokenExchangesModel
      .find({ tokenIdentifier: identifier, isActive: true })
      .lean()
      .exec();
    const exchangeIds = [
      ...new Set(docs.map((d) => d.exchangeId).filter(Boolean)),
    ];
    const exchanges = exchangeIds.length
      ? await this.exchangesModel
          .find({ _id: { $in: exchangeIds } })
          .sort({ name: 1 })
          .lean()
          .exec()
      : [];
    const exchangeMap = new Map(
      (exchanges as any[]).map((e) => [
        String(e._id),
        this.toExchangeEntity(e),
      ]),
    );
    return docs.map((d) => ({
      ...d,
      exchange: exchangeMap.get(d.exchangeId) ?? null,
    })) as unknown as TokenExchangeEntity[];
  }

  async createTokenExchange(
    data: Partial<TokenExchangeEntity> & {
      tokenIdentifier: string;
      exchangeId: string;
      exchangeSymbol: string;
    },
  ): Promise<TokenExchangeEntity> {
    const doc = await this.tokenExchangesModel.create(data);
    return doc as unknown as TokenExchangeEntity;
  }

  async countActiveTokenExchanges(): Promise<number> {
    return this.tokenExchangesModel.countDocuments({ isActive: true }).exec();
  }

  async findAllTokenExchanges(): Promise<TokenExchangeEntity[]> {
    const docs = await this.tokenExchangesModel.find({}).lean().exec();
    return docs as unknown as TokenExchangeEntity[];
  }

  async findTokenExchange(
    identifier: string,
    exchangeId: string,
  ): Promise<TokenExchangeEntity | null> {
    const doc = await this.tokenExchangesModel
      .findOne({ tokenIdentifier: identifier, exchangeId })
      .lean()
      .exec();
    if (!doc) return null;
    const exchange = await this.findById(exchangeId);
    return { ...doc, exchange } as unknown as TokenExchangeEntity;
  }

  async findTokensWithExchangeData(): Promise<Set<string>> {
    const results = await this.marketData24hModel
      .distinct('tokenIdentifier')
      .exec();
    return new Set(results.filter((id): id is string => !!id));
  }

  private async attachExchangeToMarketData24h(
    data: ExchangeMarketData24hEntity[],
  ): Promise<ExchangeMarketData24hWithExchange[]> {
    const ids = [...new Set(data.map((d) => d.exchangeId).filter(Boolean))];
    const map = await this.getExchangeMapByIds(ids);
    return data.map((d) => ({
      ...d,
      exchange: map.get(d.exchangeId) ?? null,
    })) as unknown as ExchangeMarketData24hWithExchange[];
  }

  async findMarketData24hByIdentifier(
    identifier: string,
  ): Promise<ExchangeMarketData24hWithExchange[]> {
    const docs = await this.marketData24hModel
      .find({ tokenIdentifier: identifier })
      .sort({ exchangeId: 1 })
      .lean()
      .exec();
    return this.attachExchangeToMarketData24h(
      docs as unknown as ExchangeMarketData24hEntity[],
    );
  }

  async findMarketData24hByIdentifiers(
    identifiers: string[],
  ): Promise<ExchangeMarketData24hWithExchange[]> {
    if (identifiers.length === 0) return [];
    const uniqueIds = [...new Set(identifiers)];
    const docs = await this.marketData24hModel
      .find({ tokenIdentifier: { $in: uniqueIds } })
      .sort({ tokenIdentifier: 1, exchangeId: 1 })
      .lean()
      .exec();
    return this.attachExchangeToMarketData24h(
      docs as unknown as ExchangeMarketData24hEntity[],
    );
  }

  private async attachExchangeToMarketData7d(
    data: ExchangeMarketData7dEntity[],
  ): Promise<ExchangeMarketData7dWithExchange[]> {
    const ids = [...new Set(data.map((d) => d.exchangeId).filter(Boolean))];
    const map = await this.getExchangeMapByIds(ids);
    return data.map((d) => ({
      ...d,
      exchange: map.get(d.exchangeId) ?? null,
    })) as unknown as ExchangeMarketData7dWithExchange[];
  }

  async findMarketData7dByIdentifier(
    identifier: string,
  ): Promise<ExchangeMarketData7dWithExchange[]> {
    const docs = await this.marketData7dModel
      .find({ tokenIdentifier: identifier })
      .sort({ date: 1 })
      .lean()
      .exec();
    const withExchange = await this.attachExchangeToMarketData7d(
      docs as unknown as ExchangeMarketData7dEntity[],
    );
    return withExchange.sort((a, b) =>
      (a.exchange?.name ?? '').localeCompare(b.exchange?.name ?? ''),
    );
  }

  async findMarketData7dByIdentifiers(
    identifiers: string[],
  ): Promise<ExchangeMarketData7dWithExchange[]> {
    if (identifiers.length === 0) return [];
    const uniqueIds = [...new Set(identifiers)];
    const docs = await this.marketData7dModel
      .find({ tokenIdentifier: { $in: uniqueIds } })
      .sort({ tokenIdentifier: 1, date: 1 })
      .lean()
      .exec();
    const withExchange = await this.attachExchangeToMarketData7d(
      docs as unknown as ExchangeMarketData7dEntity[],
    );
    return withExchange.sort((a, b) => {
      const idCmp = (a.tokenIdentifier ?? '').localeCompare(
        b.tokenIdentifier ?? '',
      );
      if (idCmp !== 0) return idCmp;
      return (a.exchange?.name ?? '').localeCompare(b.exchange?.name ?? '');
    });
  }

  async findMarketData7dByTokenAndExchange(
    identifier: string,
    exchangeId: string,
  ): Promise<ExchangeMarketData7dEntity[]> {
    const docs = await this.marketData7dModel
      .find({ tokenIdentifier: identifier, exchangeId })
      .sort({ date: 1 })
      .lean()
      .exec();
    return docs as unknown as ExchangeMarketData7dEntity[];
  }

  async findMarketData7dByIdentifierGroupedByExchange(
    identifier: string,
  ): Promise<
    Array<{
      exchangeId: string;
      exchangeCode: string;
      exchangeName: string;
      candles: Array<{ date: Date; open: string; high: string; low: string; close: string; volume: string }>;
    }>
  > {
    return this.findKlineByIdentifierGroupedByExchange(
      this.marketData7dModel,
      identifier,
    );
  }

  async upsertMarketData24h(
    data: Partial<ExchangeMarketData24hEntity>,
  ): Promise<ExchangeMarketData24hEntity> {
    const existing = await this.marketData24hModel
      .findOne({
        tokenIdentifier: data.tokenIdentifier,
        exchangeId: data.exchangeId,
      })
      .exec();
    if (existing) {
      Object.assign(existing, data);
      await existing.save();
      return existing as unknown as ExchangeMarketData24hEntity;
    }
    const created = new this.marketData24hModel(data);
    await created.save();
    return created as unknown as ExchangeMarketData24hEntity;
  }

  async upsertMarketData7d(
    data: Partial<ExchangeMarketData7dEntity>,
  ): Promise<ExchangeMarketData7dEntity> {
    const existing = await this.marketData7dModel
      .findOne({
        tokenIdentifier: data.tokenIdentifier,
        exchangeId: data.exchangeId,
        date: data.date,
      })
      .exec();
    if (existing) {
      Object.assign(existing, data);
      await existing.save();
      return existing as unknown as ExchangeMarketData7dEntity;
    }
    const created = new this.marketData7dModel(data);
    await created.save();
    return created as unknown as ExchangeMarketData7dEntity;
  }

  /**
   * Bulk upsert 24h market data (one round-trip per batch).
   */
  async bulkUpsertMarketData24h(
    items: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      price: string;
      volume24h: string;
      change24h: string;
      high24h: string;
      low24h: string;
      open24h: string;
      close24h: string;
      lastUpdated: Date;
    }>,
  ): Promise<void> {
    if (items.length === 0) return;
    const now = new Date();
    const BATCH = 200;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const ops = batch.map((row) => ({
        updateOne: {
          filter: {
            tokenIdentifier: row.tokenIdentifier,
            exchangeId: row.exchangeId,
          },
          update: {
            $set: {
              price: row.price,
              volume24h: row.volume24h,
              change24h: row.change24h,
              high24h: row.high24h,
              low24h: row.low24h,
              open24h: row.open24h,
              close24h: row.close24h,
              lastUpdated: row.lastUpdated,
              updatedAt: now,
            },
          },
          upsert: true,
        },
      }));
      await this.marketData24hModel.bulkWrite(ops);
    }
  }

  /**
   * Bulk upsert 7d market data (one round-trip per batch; each row = one candle).
   */
  async bulkUpsertMarketData7d(
    items: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      date: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
  ): Promise<void> {
    if (items.length === 0) return;
    const BATCH = 200;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const ops = batch.map((row) => ({
        updateOne: {
          filter: {
            tokenIdentifier: row.tokenIdentifier,
            exchangeId: row.exchangeId,
            date: row.date,
          },
          update: {
            $set: {
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              volume: row.volume,
            },
          },
          upsert: true,
        },
      }));
      await this.marketData7dModel.bulkWrite(ops);
    }
  }

  /**
   * Bulk update lastSyncedAt/lastSuccessAt for many token-exchange pairs (one round-trip per batch).
   */
  async bulkUpdateLastSyncedAt(
    updates: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      exchangeSymbol?: string;
      actualSymbolFromApi?: string;
    }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    const now = new Date();
    const BATCH = 200;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const ops = batch.map((u) => {
        const set: Record<string, unknown> = {
          lastSyncedAt: now,
          lastSuccessAt: now,
          failureCount: 0,
          lastError: null,
        };
        const symbol =
          u.actualSymbolFromApi && u.actualSymbolFromApi !== u.exchangeSymbol
            ? u.actualSymbolFromApi
            : u.exchangeSymbol;
        if (symbol) set.exchangeSymbol = symbol;
        return {
          updateOne: {
            filter: {
              tokenIdentifier: u.tokenIdentifier,
              exchangeId: u.exchangeId,
            },
            update: { $set: set },
          },
        };
      });
      await this.tokenExchangesModel.bulkWrite(ops);
    }
  }

  async updateLastSyncedAt(
    identifier: string,
    exchangeId: string,
    exchangeSymbol?: string,
    actualSymbolFromApi?: string,
  ): Promise<void> {
    const existing = await this.tokenExchangesModel
      .findOne({ tokenIdentifier: identifier, exchangeId })
      .exec();

    const now = new Date();
    const updateData: Record<string, unknown> = {
      lastSyncedAt: now,
      lastSuccessAt: now,
      failureCount: 0,
      lastError: null,
    };
    if (actualSymbolFromApi && actualSymbolFromApi !== exchangeSymbol) {
      updateData.exchangeSymbol = actualSymbolFromApi;
      this.logger.debug(
        `Learned symbol format: ${identifier} on exchange ${exchangeId}: ${exchangeSymbol} → ${actualSymbolFromApi}`,
      );
    }

    if (existing) {
      await this.tokenExchangesModel
        .updateOne(
          { tokenIdentifier: identifier, exchangeId },
          { $set: updateData },
        )
        .exec();
    } else {
      const exchange = await this.exchangesModel.findById(exchangeId).exec();
      if (exchange) {
        await this.tokenExchangesModel.create({
          tokenIdentifier: identifier,
          exchangeId,
          exchangeSymbol:
            actualSymbolFromApi || exchangeSymbol || `${identifier}USDT`,
          baseCurrency: 'USDT',
          isActive: true,
          verifiedAt: now,
          lastSyncedAt: now,
          lastSuccessAt: now,
          failureCount: 0,
          lastError: null,
        });
      }
    }
  }

  async trackSyncFailure(
    identifier: string,
    exchangeId: string,
    error: string,
  ): Promise<void> {
    const existing = await this.tokenExchangesModel
      .findOne({ tokenIdentifier: identifier, exchangeId })
      .exec();
    if (!existing) return;

    const newFailureCount = (existing.failureCount ?? 0) + 1;
    const updateData: Record<string, unknown> = {
      failureCount: newFailureCount,
      lastError: error.substring(0, 500),
    };
    if (newFailureCount >= this.maxFailuresBeforeDisable) {
      updateData.isActive = false;
      this.logger.warn(
        `Auto-disabled ${identifier} on exchange ${exchangeId} after ${this.maxFailuresBeforeDisable} consecutive failures`,
      );
    }
    await this.tokenExchangesModel
      .updateOne(
        { tokenIdentifier: identifier, exchangeId },
        { $set: updateData },
      )
      .exec();
  }

  async createSyncLog(
    data: Partial<ExchangeSyncLogEntity>,
  ): Promise<ExchangeSyncLogEntity | null> {
    const totalPairs = Number(data.totalPairs ?? 0);
    if (!Number.isFinite(totalPairs) || totalPairs <= 0) {
      this.logger.debug(
        `Skipping zero-work sync log creation: syncType=${data.syncType ?? 'unknown'}, exchangeId=${data.exchangeId ?? 'unknown'}, totalPairs=${data.totalPairs ?? 0}`,
      );
      return null;
    }
    const doc = new this.syncLogModel(data);
    await doc.save();
    return doc as unknown as ExchangeSyncLogEntity;
  }

  async updateSyncLog(
    id: string,
    data: Partial<ExchangeSyncLogEntity>,
  ): Promise<void> {
    await this.syncLogModel.updateOne({ _id: id }, { $set: data }).exec();
  }

  // --- Kline intervals (1h, 1M, 1Y, max): sync state and candle tables ---

  /** One query: get sync state docs for interval. Used with findAllActiveTokenExchanges to filter stale pairs in memory. */
  async findKlinesSyncStateForInterval(
    interval: string,
  ): Promise<Array<{ tokenIdentifier: string; exchangeId: string; lastSuccessAt: Date | null }>> {
    const docs = await this.klinesSyncStateModel
      .find({ interval })
      .select('tokenIdentifier exchangeId lastSuccessAt')
      .lean()
      .exec();
    return docs as any[];
  }

  /** Bulk upsert sync state for kline interval (one round-trip per batch). */
  async bulkUpsertKlinesSyncState(
    interval: string,
    items: Array<{ tokenIdentifier: string; exchangeId: string }>,
  ): Promise<void> {
    if (items.length === 0) return;
    const now = new Date();
    const BATCH = 200;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const ops = batch.map((row) => ({
        updateOne: {
          filter: {
            tokenIdentifier: row.tokenIdentifier,
            exchangeId: row.exchangeId,
            interval,
          },
          update: { $set: { lastSuccessAt: now, updatedAt: now } },
          upsert: true,
        },
      }));
      await this.klinesSyncStateModel.bulkWrite(ops);
    }
  }

  private async bulkUpsertKlineTable(
    model: Model<any>,
    items: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      date: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
  ): Promise<void> {
    if (items.length === 0) return;
    const BATCH = 200;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const ops = batch.map((row) => ({
        updateOne: {
          filter: {
            tokenIdentifier: row.tokenIdentifier,
            exchangeId: row.exchangeId,
            date: row.date,
          },
          update: {
            $set: {
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              volume: row.volume,
            },
          },
          upsert: true,
        },
      }));
      await model.bulkWrite(ops);
    }
  }

  async bulkUpsertMarketData1h(
    items: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      date: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
  ): Promise<void> {
    return this.bulkUpsertKlineTable(this.marketData1hModel, items);
  }

  async bulkUpsertMarketData1d(
    items: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      date: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
  ): Promise<void> {
    return this.bulkUpsertKlineTable(this.marketData1dModel, items);
  }

  async bulkUpsertMarketData1M(
    items: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      date: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
  ): Promise<void> {
    return this.bulkUpsertKlineTable(this.marketData1MModel, items);
  }

  async bulkUpsertMarketData1Y(
    items: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      date: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
  ): Promise<void> {
    return this.bulkUpsertKlineTable(this.marketData1YModel, items);
  }

  async bulkUpsertMarketDataMax(
    items: Array<{
      tokenIdentifier: string;
      exchangeId: string;
      date: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
  ): Promise<void> {
    return this.bulkUpsertKlineTable(this.marketDataMaxModel, items);
  }

  /** One query for candles by identifier, one query for exchanges by ids; group in memory. */
  async findMarketData1hByIdentifierGroupedByExchange(
    identifier: string,
  ): Promise<
    Array<{
      exchangeId: string;
      exchangeCode: string;
      exchangeName: string;
      candles: Array<{ date: Date; open: string; high: string; low: string; close: string; volume: string }>;
    }>
  > {
    return this.findKlineByIdentifierGroupedByExchange(
      this.marketData1hModel,
      identifier,
    );
  }

  async findMarketData1dByIdentifierGroupedByExchange(
    identifier: string,
  ): Promise<
    Array<{
      exchangeId: string;
      exchangeCode: string;
      exchangeName: string;
      candles: Array<{ date: Date; open: string; high: string; low: string; close: string; volume: string }>;
    }>
  > {
    return this.findKlineByIdentifierGroupedByExchange(
      this.marketData1dModel,
      identifier,
    );
  }

  async findMarketData1MByIdentifierGroupedByExchange(
    identifier: string,
  ): Promise<
    Array<{
      exchangeId: string;
      exchangeCode: string;
      exchangeName: string;
      candles: Array<{ date: Date; open: string; high: string; low: string; close: string; volume: string }>;
    }>
  > {
    return this.findKlineByIdentifierGroupedByExchange(
      this.marketData1MModel,
      identifier,
    );
  }

  async findMarketData1YByIdentifierGroupedByExchange(
    identifier: string,
  ): Promise<
    Array<{
      exchangeId: string;
      exchangeCode: string;
      exchangeName: string;
      candles: Array<{ date: Date; open: string; high: string; low: string; close: string; volume: string }>;
    }>
  > {
    return this.findKlineByIdentifierGroupedByExchange(
      this.marketData1YModel,
      identifier,
    );
  }

  async findMarketDataMaxByIdentifierGroupedByExchange(
    identifier: string,
  ): Promise<
    Array<{
      exchangeId: string;
      exchangeCode: string;
      exchangeName: string;
      candles: Array<{ date: Date; open: string; high: string; low: string; close: string; volume: string }>;
    }>
  > {
    return this.findKlineByIdentifierGroupedByExchange(
      this.marketDataMaxModel,
      identifier,
    );
  }

  async findAggregatedChartByTokenAndInterval(
    tokenIdentifier: string,
    interval: string,
  ): Promise<{
    tokenIdentifier: string;
    interval: string;
    candles: Array<{
      timestamp: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>;
    byExchange: Array<{
      exchangeCode: string;
      exchangeName: string;
      candles: Array<{
        timestamp: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
      }>;
    }>;
    updatedAt: Date;
  } | null> {
    const doc = await this.aggregatedTokenCandleModel
      .findOne({ tokenIdentifier, interval })
      .lean()
      .exec();
    if (!doc) return null;
    return {
      tokenIdentifier: doc.tokenIdentifier,
      interval: doc.interval,
      candles: Array.isArray(doc.candles) ? doc.candles : [],
      byExchange: Array.isArray(doc.byExchange) ? doc.byExchange : [],
      updatedAt: doc.updatedAt ?? new Date(0),
    };
  }

  async upsertAggregatedChart(
    tokenIdentifier: string,
    interval: string,
    payload: {
      candles: Array<{
        timestamp: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
      }>;
      byExchange: Array<{
        exchangeCode: string;
        exchangeName: string;
        candles: Array<{
          timestamp: string;
          open: string;
          high: string;
          low: string;
          close: string;
          volume: string;
        }>;
      }>;
    },
  ): Promise<void> {
    await this.aggregatedTokenCandleModel
      .updateOne(
        { tokenIdentifier, interval },
        {
          $set: {
            tokenIdentifier,
            interval,
            candles: payload.candles,
            byExchange: payload.byExchange,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async findFreshAggregatedChartTokenIds(
    interval: string,
    since: Date,
    tokenIdentifiers: string[],
  ): Promise<Set<string>> {
    if (tokenIdentifiers.length === 0) return new Set<string>();
    const docs = await this.aggregatedTokenCandleModel
      .find({
        interval,
        tokenIdentifier: { $in: tokenIdentifiers },
        updatedAt: { $gte: since },
      })
      .select({ tokenIdentifier: 1, _id: 0 })
      .lean()
      .exec();
    return new Set(
      docs
        .map((d: { tokenIdentifier?: string }) => d.tokenIdentifier)
        .filter((x): x is string => !!x),
    );
  }

  private async findKlineByIdentifierGroupedByExchange(
    model: Model<any>,
    identifier: string,
  ): Promise<
    Array<{
      exchangeId: string;
      exchangeCode: string;
      exchangeName: string;
      candles: Array<{ date: Date; open: string; high: string; low: string; close: string; volume: string }>;
    }>
  > {
    const docs = await model
      .find({ tokenIdentifier: identifier })
      .sort({ date: 1 })
      .lean()
      .exec();
    if (docs.length === 0) return [];
    const exchangeIds = [...new Set(docs.map((d: any) => d.exchangeId).filter(Boolean))];
    const exchangeMap = await this.getExchangeMapByIds(exchangeIds as string[]);
    const byExchange = new Map<
      string,
      Array<{ date: Date; open: string; high: string; low: string; close: string; volume: string }>
    >();
    for (const d of docs as any[]) {
      const eid = d.exchangeId;
      if (!byExchange.has(eid)) byExchange.set(eid, []);
      byExchange.get(eid)!.push({
        date: d.date,
        open: d.open ?? '0',
        high: d.high ?? '0',
        low: d.low ?? '0',
        close: d.close ?? '0',
        volume: d.volume ?? '0',
      });
    }
    return Array.from(byExchange.entries()).map(([exchangeId, candles]) => {
      const ex = exchangeMap.get(exchangeId);
      return {
        exchangeId,
        exchangeCode: ex?.code ?? '',
        exchangeName: ex?.name ?? '',
        candles,
      };
    });
  }
}
