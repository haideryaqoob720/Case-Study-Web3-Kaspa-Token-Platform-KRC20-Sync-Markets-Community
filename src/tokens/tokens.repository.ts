// Tokens Repository: MongoDB operations via Mongoose
// What: findAll with filters/sort/pagination, upsert, update logo, get tickers, find by identifier/ticker

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TokenDocument, TokenEntity } from '../database/schemas/token.schema';
import { TokenInfoDocument } from '../database/schemas/token-info.schema';
import { KasplexToken } from '../kasplex/kasplex-api.service';

export interface FindAllTokensOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  minting?: string;
  supplySort?: string;
  ageSort?: string;
  premint?: string;
  identifier?: string;
  voteSort?: string;
  tickers?: string[];
  /** Protocol filter (e.g. KRC-20). When schema has protocol field, add match.protocol = protocol. */
  protocol?: string;
  /** When true, only tokens where preAllocated <= 0 (fair launch: max supply = total available for public minting). */
  fairLaunch?: boolean;
  /** When true, only tokens where preAllocated > 0 (pre sale). */
  preSale?: boolean;
  /**
   * Skip merging token_info (mint/holder counts from Kasplex cache) for this page.
   * Use for large pools (e.g. top gainers/losers) where one $in query over thousands of tickers is slow;
   * list still uses mint/holder counts already on the token document.
   */
  skipTokenInfoMerge?: boolean;
  /** Skip countDocuments for pool-style queries where total is computed later in service. */
  skipTotalCount?: boolean;
}

export interface FindAllTokensResult {
  data: TokenEntity[];
  total: number;
}

@Injectable()
export class TokensRepository {
  private readonly logger = new Logger(TokensRepository.name);

  constructor(
    @InjectModel(TokenDocument.name)
    private tokensModel: Model<TokenDocument>,
    @InjectModel(TokenInfoDocument.name)
    private tokenInfoModel: Model<TokenInfoDocument>,
  ) {}

  private toNum(s: string | null | undefined): number {
    if (s == null || s === '') return 0;
    const n = parseFloat(String(s).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  private mintingPctExpr() {
    return {
      $cond: {
        if: {
          $or: [
            { $eq: [{ $ifNull: ['$maxSupply', ''] }, ''] },
            { $eq: ['$maxSupply', '0'] },
          ],
        },
        then: 0,
        else: {
          $cond: {
            if: {
              $or: [
                { $eq: [{ $ifNull: ['$minted', ''] }, ''] },
                { $eq: ['$minted', ''] },
              ],
            },
            then: 0,
            else: {
              $multiply: [
                {
                  $divide: [
                    {
                      $convert: { input: '$minted', to: 'double', onError: 0 },
                    },
                    {
                      $max: [
                        1,
                        {
                          $convert: {
                            input: '$maxSupply',
                            to: 'double',
                            onError: 0,
                          },
                        },
                      ],
                    },
                  ],
                },
                100,
              ],
            },
          },
        },
      },
    };
  }

  async findAll(options: FindAllTokensOptions): Promise<FindAllTokensResult> {
    const {
      page = 1,
      limit = 50,
      sort = 'rank',
      order = 'asc',
      search,
      minting = 'all',
      supplySort,
      ageSort,
      premint = 'all',
      identifier,
      voteSort,
      tickers,
      protocol,
      fairLaunch,
      preSale,
      skipTokenInfoMerge = false,
      skipTotalCount = false,
    } = options;

    const skip = (page - 1) * limit;
    const sortDir = order === 'asc' ? 1 : -1;

    const match: Record<string, unknown> = {};

    if (identifier) {
      match.identifier = identifier.trim();
    } else if (search) {
      match.ticker = { $regex: search.trim(), $options: 'i' };
    }

    if (tickers != null && tickers.length > 0) {
      match.ticker = { $in: tickers.map((t) => t.trim()) };
    } else if (tickers != null && tickers.length === 0) {
      return { data: [], total: 0 };
    }

    if (minting !== 'all') {
      const pct = this.mintingPctExpr();
      const mintValues: (string | null)[] = [null, '', '0'];
      let expr: Record<string, unknown>;
      switch (minting) {
        case '0':
          expr = { $or: [{ $eq: [pct, 0] }, { $in: ['$minted', mintValues] }] };
          break;
        case '0-10':
          expr = { $and: [{ $gt: [pct, 0] }, { $lt: [pct, 10] }] };
          break;
        case '10-50':
          expr = { $and: [{ $gte: [pct, 10] }, { $lt: [pct, 50] }] };
          break;
        case '50-100':
          expr = { $and: [{ $gte: [pct, 50] }, { $lt: [pct, 100] }] };
          break;
        case '100':
          expr = { $gte: [pct, 100] };
          break;
        default:
          expr = {};
      }
      if (Object.keys(expr).length > 0) match.$expr = expr;
    }

    if (premint !== 'all') {
      const preAlloc = {
        $convert: {
          input: { $ifNull: ['$preAllocated', '0'] },
          to: 'double',
          onError: 0,
        },
      };
      const premintCond =
        premint === 'yes' ? { $gt: [preAlloc, 0] } : { $lte: [preAlloc, 0] };
      match.$expr = match.$expr
        ? { $and: [match.$expr, premintCond] }
        : premintCond;
    }

    // Fair launch: max supply = total available for public minting (preAllocated <= 0)
    if (fairLaunch === true) {
      const preAlloc = {
        $convert: {
          input: { $ifNull: ['$preAllocated', '0'] },
          to: 'double',
          onError: 0,
        },
      };
      const cond = { $lte: [preAlloc, 0] };
      match.$expr = match.$expr ? { $and: [match.$expr, cond] } : cond;
    }

    // Pre sale: tokens with pre-allocated supply (preAllocated > 0)
    if (preSale === true) {
      const preAlloc = {
        $convert: {
          input: { $ifNull: ['$preAllocated', '0'] },
          to: 'double',
          onError: 0,
        },
      };
      const cond = { $gt: [preAlloc, 0] };
      match.$expr = match.$expr ? { $and: [match.$expr, cond] } : cond;
    }

    // Protocol filter (e.g. KRC-20). For now all tokens are KRC-20 so no extra match.
    // When token schema has a protocol field, add: if (protocol) match.protocol = protocol;
    if (protocol && protocol.trim() !== '') {
      // Future: match.protocol = protocol.trim(); (once protocol column exists and is populated)
      // No-op: return all tokens for KRC-20 until multi-protocol support.
    }

    const validSortFields = [
      'ticker',
      'holderCount',
      'mintCount',
      'mtsAdd',
      'createdAt',
      'rank',
    ];
    const sortField = validSortFields.includes(sort) ? sort : 'rank';

    if (voteSort === 'mostVoted') {
      const baseMatch = Object.keys(match).length ? match : {};
      const [aggregationResult, total] = await Promise.all([
        this.tokensModel
          .aggregate([
            { $match: baseMatch },
            {
              $lookup: {
                from: 'token_votes',
                localField: 'ticker',
                foreignField: 'tokenId',
                as: 'votes',
              },
            },
            {
              $addFields: {
                _voteCount: { $size: '$votes' },
                // Secondary sort: by rank (nulls last) so zero-vote tokens are ordered by rank, not random
                _rankSort: {
                  $cond: [
                    { $eq: ['$rank', null] },
                    999999,
                    '$rank',
                  ],
                },
              },
            },
            { $sort: { _voteCount: -1, _rankSort: 1 } },
            { $skip: skip },
            { $limit: limit },
            { $project: { votes: 0, _voteCount: 0, _rankSort: 0 } },
          ])
          .exec(),
        skipTotalCount
          ? Promise.resolve(0)
          : this.tokensModel.countDocuments(baseMatch).then((n) => {
              return n;
            }),
      ]);
      const tokens = aggregationResult as TokenEntity[];
      if (!skipTokenInfoMerge) {
        await this.mergeTokenInfoAndResort(tokens, sortField, sortDir);
      }
      return { data: tokens, total };
    }

    let sortOpt: Record<string, 1 | -1> = {};
    if (supplySort) {
      if (supplySort === 'max') {
        sortOpt = { maxSupply: sortDir };
      } else if (supplySort === 'minted') {
        sortOpt = { minted: sortDir };
      } else if (supplySort === 'percentage') {
        // Use aggregation to add computed field then sort (or sort in memory for small sets)
        const [aggregationResult, total] = await Promise.all([
          this.tokensModel
            .aggregate([
              { $match: Object.keys(match).length ? match : {} },
              { $addFields: { _mintPct: this.mintingPctExpr() } },
              { $sort: { _mintPct: sortDir } },
              { $skip: skip },
              { $limit: limit },
              { $project: { _mintPct: 0 } },
            ])
            .exec(),
          skipTotalCount
            ? Promise.resolve(0)
            : this.tokensModel.countDocuments(match),
        ]);
        const tokens = aggregationResult as TokenEntity[];
        if (!skipTokenInfoMerge) {
          await this.mergeTokenInfoAndResort(tokens, sortField, sortDir);
        }
        return { data: tokens, total };
      }
    } else if (ageSort) {
      sortOpt = ageSort === 'newest' ? { mtsAdd: -1 } : { mtsAdd: 1 };
    } else {
      if (sortField === 'rank') {
        // Purpose: Sort by rank with null values last when ascending
        // What: When sorting ascending, MongoDB puts nulls first by default.
        //      We use a compound sort to put nulls last: sort by rank, then by a field
        //      that distinguishes nulls (using $ifNull to create a secondary sort key)
        if (sortDir === 1) {
          // Ascending: rank 1, 2, 3... then nulls last
          // Use aggregation to handle nulls properly
          const [aggregationResult, total] = await Promise.all([
            this.tokensModel
              .aggregate([
                { $match: Object.keys(match).length ? match : {} },
                {
                  $addFields: {
                    _rankSort: {
                      $cond: [
                        { $eq: ['$rank', null] },
                        999999, // Put nulls at the end (high number)
                        '$rank',
                      ],
                    },
                  },
                },
                { $sort: { _rankSort: sortDir } },
                { $skip: skip },
                { $limit: limit },
                { $project: { _rankSort: 0 } },
              ])
              .exec(),
            skipTotalCount
              ? Promise.resolve(0)
              : this.tokensModel.countDocuments(match),
          ]);
          const tokens = aggregationResult as TokenEntity[];
          if (!skipTokenInfoMerge) {
            await this.mergeTokenInfoAndResort(tokens, sortField, sortDir);
          }
          return { data: tokens, total };
        } else {
          // Descending: rank 15, 14, 13... then nulls (MongoDB handles this correctly)
          sortOpt = { rank: sortDir };
        }
      } else if (sortField === 'mintCount' || sortField === 'holderCount') {
        sortOpt = { ticker: 1 };
      } else {
        sortOpt = { [sortField]: sortDir };
      }
    }

    const [tokens, total] = await Promise.all([
      this.tokensModel
        .find(match)
        .sort(sortOpt)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      skipTotalCount ? Promise.resolve(0) : this.tokensModel.countDocuments(match),
    ]);

    const tokensAsEntity = (tokens as any[]).map((t) => this.toTokenEntity(t));
    if (!skipTokenInfoMerge) {
      await this.mergeTokenInfoAndResort(tokensAsEntity, sortField, sortDir);
    }
    return { data: tokensAsEntity, total };
  }

  private toTokenEntity(doc: any): TokenEntity {
    if (!doc) return doc;
    const id = String(doc._id ?? doc.id);
    return { ...doc, id } as TokenEntity;
  }

  private async mergeTokenInfoAndResort(
    tokens: TokenEntity[],
    sortField: string,
    sortDir: number,
  ): Promise<void> {
    const tickers = tokens.map((t) => t.ticker).filter((t): t is string => !!t);
    if (tickers.length === 0) return;

    try {
      const tokenInfoRows = await this.tokenInfoModel
        .find({ ticker: { $in: tickers } })
        .select('ticker name response_json')
        .lean()
        .exec();

      const tokenInfoMap = new Map<
        string,
        {
          name: string | null;
          mintTotal: string | null;
          holderTotal: string | null;
        }
      >();
      for (const row of tokenInfoRows as any[]) {
        const r = row.response_json?.result?.[0];
        tokenInfoMap.set(row.ticker, {
          name: row.name ?? null,
          mintTotal: r?.mintTotal ?? null,
          holderTotal: r?.holderTotal ?? null,
        });
      }

      for (const token of tokens) {
        const info = tokenInfoMap.get(token.ticker);
        if (!info) continue;
        if (info.mintTotal != null) {
          const n = parseInt(String(info.mintTotal), 10);
          if (!isNaN(n) && n >= 0) (token as any).mintCount = n;
        }
        if (info.holderTotal != null) {
          const n = parseInt(String(info.holderTotal), 10);
          if (!isNaN(n) && n >= 0) (token as any).holderCount = n;
        }
        if (info.name != null) (token as any).name = info.name;
      }

      if (sortField === 'mintCount' || sortField === 'holderCount') {
        tokens.sort((a, b) => {
          const aVal = (a as any)[sortField] ?? 0;
          const bVal = (b as any)[sortField] ?? 0;
          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          return sortDir === 1 ? aVal - bVal : bVal - aVal;
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to fetch token_info: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
    }
  }

  async upsertTokens(tokens: KasplexToken[]): Promise<{
    inserted: number;
    updated: number;
    total: number;
  }> {
    if (!tokens?.length) {
      return { inserted: 0, updated: 0, total: 0 };
    }

    const normalized = tokens
      .filter((t) => t.ticker?.trim())
      .map((t) => this.normalizeToken(t));
    const uniqueMap = new Map<string, Partial<TokenEntity>>();
    for (const t of normalized) {
      if (t.ticker) uniqueMap.set(t.ticker, t);
    }
    const unique = Array.from(uniqueMap.values());
    if (unique.length === 0) return { inserted: 0, updated: 0, total: 0 };

    let inserted = 0;
    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const tickers = batch
        .map((t) => t.ticker)
        .filter((t): t is string => !!t);
      const existingBefore = await this.tokensModel
        .find({ ticker: { $in: tickers } }, { ticker: 1 })
        .lean()
        .exec();
      const existingSet = new Set(
        (existingBefore as any[]).map((e) => e.ticker),
      );

      const ops = batch.map((doc) => ({
        updateOne: {
          filter: { ticker: doc.ticker },
          update: { $set: { ...doc, updatedAt: new Date() } },
          upsert: true,
        },
      }));
      await this.tokensModel.bulkWrite(ops);

      const batchInserted = batch.filter(
        (t) => t.ticker && !existingSet.has(t.ticker),
      ).length;
      const batchUpdated = batch.length - batchInserted;
      inserted += batchInserted;
      updated += batchUpdated;
    }

    this.logger.log(
      `Upsert completed: ${inserted} inserted, ${updated} updated, ${unique.length} total`,
    );
    return { inserted, updated, total: unique.length };
  }

  async updateLogoStatus(
    ticker: string,
    logoStatus: string,
    logoUrl?: string | null,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      logo_status: logoStatus,
      updatedAt: new Date(),
    };
    if (logoUrl !== undefined) update.logo_url = logoUrl;
    await this.tokensModel.updateOne({ ticker }, { $set: update }).exec();
  }

  async getAllTickers(): Promise<string[]> {
    const docs = await this.tokensModel.find({}, { ticker: 1 }).lean().exec();
    return (docs as any[]).map((d) => d.ticker).filter(Boolean);
  }

  async findByIdentifier(identifier: string): Promise<TokenEntity | null> {
    if (!identifier?.trim()) return null;
    const doc = await this.tokensModel
      .findOne({ identifier: identifier.trim() })
      .lean()
      .exec();
    return this.toTokenEntity(doc);
  }

  async findByTicker(ticker: string): Promise<TokenEntity | null> {
    if (!ticker?.trim()) return null;
    const doc = await this.tokensModel
      .findOne({ ticker: ticker.trim() })
      .lean()
      .exec();
    return this.toTokenEntity(doc);
  }

  /**
   * Find tokens by identifiers (for init service).
   */
  async findByIdentifiers(identifiers: string[]): Promise<TokenEntity[]> {
    if (identifiers.length === 0) return [];
    const docs = await this.tokensModel
      .find({ identifier: { $in: identifiers } })
      .lean()
      .exec();
    return (docs as any[]).map((d) => this.toTokenEntity(d));
  }

  /**
   * Find all tokens (for workers). Optional sort.
   */
  async find(
    sort: Record<string, 1 | -1> = { ticker: 1 },
  ): Promise<TokenEntity[]> {
    const docs = await this.tokensModel.find({}).sort(sort).lean().exec();
    return (docs as any[]).map((d) => this.toTokenEntity(d));
  }

  /**
   * Find tokens with only fields needed for floor price sync (fewer DB reads).
   */
  async findForFloorPriceSync(): Promise<
    Array<{
      id: string;
      identifier?: string | null;
      ticker?: string | null;
      name?: string | null;
      decimal?: string | null;
      floorPriceUsd?: string | null;
      floorPriceKas?: string | null;
      floorPriceUpdatedAt?: Date | null;
    }>
  > {
    const docs = await this.tokensModel
      .find({})
      .select('_id identifier ticker name decimal floorPriceUsd floorPriceKas floorPriceUpdatedAt')
      .sort({ ticker: 1 })
      .lean()
      .exec();
    return (docs as any[]).map((d) => ({
      id: String(d._id),
      identifier: d.identifier ?? null,
      ticker: d.ticker ?? null,
      name: d.name ?? null,
      decimal: d.decimal ?? null,
      floorPriceUsd: d.floorPriceUsd ?? null,
      floorPriceKas: d.floorPriceKas ?? null,
      floorPriceUpdatedAt: d.floorPriceUpdatedAt ?? null,
    }));
  }

  /**
   * Bulk update floor price fields for many tokens (one DB round-trip).
   */
  async bulkUpdateFloorPrices(
    updates: Array<{
      id: string;
      floorPriceUsd: string;
      floorPriceKas: string;
      floorPriceListingCount: number;
      floorPriceUpdatedAt: Date;
    }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    const now = new Date();
    await this.tokensModel.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { _id: u.id },
          update: {
            $set: {
              floorPriceUsd: u.floorPriceUsd,
              floorPriceKas: u.floorPriceKas,
              floorPriceListingCount: u.floorPriceListingCount,
              floorPriceUpdatedAt: u.floorPriceUpdatedAt,
              updatedAt: now,
            },
          },
        },
      })),
    );
  }

  /**
   * Bulk update rank for many tokens (one DB round-trip).
   */
  async bulkUpdateRanks(
    updates: Array<{
      id: string;
      rank: number;
      rankBasis?: 'market_cap' | 'fallback';
    }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    const now = new Date();
    await this.tokensModel.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { _id: u.id },
          update: {
            $set: {
              rank: u.rank,
              rankBasis: u.rankBasis ?? null,
              updatedAt: now,
            },
          },
        },
      })),
    );
  }

  /**
   * Set rank to null for many tokens by id (one DB round-trip).
   */
  async clearRankForIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.tokensModel
      .updateMany(
        { _id: { $in: ids } },
        { $set: { rank: null, rankBasis: null, updatedAt: new Date() } },
      )
      .exec();
  }

  /**
   * Bulk update priceSource for many tokens (one DB round-trip).
   */
  async bulkUpdatePriceSource(
    updates: Array<{ id: string; priceSource: 'exchange' | 'kasplex_marketplace' | 'none' }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    const now = new Date();
    await this.tokensModel.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { _id: u.id },
          update: { $set: { priceSource: u.priceSource, updatedAt: now } },
        },
      })),
    );
  }

  /**
   * Update token by id (e.g. floor price, rank)
   */
  async updateById(
    id: string,
    data: Partial<
      Pick<
        TokenEntity,
        | 'floorPriceUsd'
        | 'floorPriceKas'
        | 'floorPriceListingCount'
        | 'floorPriceUpdatedAt'
        | 'rank'
        | 'priceSource'
      >
    >,
  ): Promise<void> {
    await this.tokensModel
      .updateOne({ _id: id }, { $set: { ...data, updatedAt: new Date() } })
      .exec();
  }

  /**
   * Update many tokens by identifier (e.g. clear floor price for identifiers)
   */
  async updateByIdentifiers(
    identifiers: string[],
    data: Partial<
      Pick<
        TokenEntity,
        | 'floorPriceUsd'
        | 'floorPriceKas'
        | 'floorPriceListingCount'
        | 'floorPriceUpdatedAt'
      >
    >,
  ): Promise<void> {
    if (identifiers.length === 0) return;
    await this.tokensModel
      .updateMany(
        { identifier: { $in: identifiers } },
        { $set: { ...data, updatedAt: new Date() } },
      )
      .exec();
  }

  async updateMintAndHolderCount(
    ticker: string,
    mintTotal: number | null,
    holderTotal: number | null,
    name: string | null = null,
  ): Promise<void> {
    if (!ticker?.trim()) return;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (mintTotal != null && mintTotal >= 0) update.mintCount = mintTotal;
    if (holderTotal != null && holderTotal >= 0)
      update.holderCount = holderTotal;
    if (name != null && name !== undefined) {
      update.name = name;
      const token = await this.tokensModel
        .findOne({ ticker: ticker.trim() })
        .lean()
        .exec();
      if (token) update.identifier = name || (token as any).ticker;
    }
    if (Object.keys(update).length > 1) {
      await this.tokensModel
        .updateOne({ ticker: ticker.trim() }, { $set: update })
        .exec();
    }
  }

  private normalizeToken(token: KasplexToken): Partial<TokenEntity> {
    const identifier = token.ticker || token.name;
    if (!identifier)
      throw new Error('Token must have ticker or name for identifier');
    return {
      ticker: token.ticker,
      name: token.name || null,
      identifier,
      maxSupply: token.maxSupply || '0',
      minted: token.mintedSupply || '0',
      burned: token.burnedSupply || '0',
      holderCount: token.holderCount ?? 0,
      mintCount: token.mintCount ?? 0,
      preAllocated: token.premintAmount || '0',
      state: token.state || 'active',
      decimal: token.decimals || '8',
      Deploymentmode: token.mode || 'mint',
      to: token.deployAddress,
      mtsAdd: token.deployTimestamp,
      MintLimit: token.lim ?? null,
      opScoreAdd: token.opScoreAdd ?? null,
      opScoreMod: token.opScoreMod ?? null,
      hashRev: token.hashRev ?? null,
      ContractAddress: token.ContractAddress ?? null,
      updatedAt: new Date(),
    };
  }
}
