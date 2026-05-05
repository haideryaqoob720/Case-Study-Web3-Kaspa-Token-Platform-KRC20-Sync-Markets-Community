// Token Info Service: Business logic for token info operations - fetches token info
// from database, transforms data to new format (tick→ticker, max→MaximumSupply, etc.)
// When walletAddress is provided, also returns vote sentiment, userVote, isFavorite, watchlistCount.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TokenInfoRepository } from './token-info.repository';
import { TokenInfoEntity } from '../database/entities/token-info.entity';
import { TokenVotesService } from '../token-votes/token-votes.service';
import { WatchlistService } from '../watchlist/watchlist.service';

const defaultVoteMeta = {
  sentiment: { bullish: 0, bearish: 0 },
  votes: { bullish: 0, bearish: 0, total: 0 },
  userVote: null as 'bullish' | 'bearish' | null,
  isFavorite: false,
  watchlistCount: 0,
};

@Injectable()
export class TokenInfoService {
  private readonly logger = new Logger(TokenInfoService.name);

  constructor(
    private readonly tokenInfoRepository: TokenInfoRepository,
    private readonly tokenVotesService: TokenVotesService,
    private readonly watchlistService: WatchlistService,
  ) {}

  /**
   * Get token info by ticker. Optionally include vote sentiment, userVote, isFavorite, watchlistCount when walletAddress is provided.
   * @param tick Token ticker symbol
   * @param walletAddress Optional wallet for userVote and isFavorite
   */
  async getTokenInfo(tick: string, walletAddress?: string | null): Promise<any> {
    if (!tick || tick.trim().length === 0) {
      throw new NotFoundException('Token ticker cannot be empty');
    }

    const tickTrim = tick.trim();

    // Check database for stored token info
    const tokenInfo = await this.tokenInfoRepository.findByTicker(tickTrim);

    if (!tokenInfo) {
      this.logger.debug(`Token info not found for tick: ${tick}`);
      throw new NotFoundException(`Token info not found for tick: ${tick}`);
    }

    // Transform response_json keys to new names and build API response
    const formattedResponse = this.transformToNewFormat(tokenInfo);

    // Attach vote and favorite data in one go (no extra client calls)
    const voteMeta = { ...defaultVoteMeta };
    try {
      const [voteSummary, isFavorite, watchlistCount] = await Promise.all([
        this.tokenVotesService.getVotes(tickTrim, walletAddress ?? undefined),
        walletAddress?.trim()
          ? this.watchlistService.has(walletAddress.trim(), tickTrim)
          : Promise.resolve(false),
        this.watchlistService.countByToken(tickTrim),
      ]);
      voteMeta.sentiment = voteSummary.sentiment;
      voteMeta.votes = voteSummary.votes;
      voteMeta.userVote = voteSummary.userVote;
      voteMeta.isFavorite = isFavorite;
      voteMeta.watchlistCount = watchlistCount;
    } catch (err) {
      this.logger.warn(`Token info vote/watchlist for ${tickTrim}: ${err}`);
    }

    return {
      ...formattedResponse,
      sentiment: voteMeta.sentiment,
      votes: voteMeta.votes,
      userVote: voteMeta.userVote,
      isFavorite: voteMeta.isFavorite,
      watchlistCount: voteMeta.watchlistCount,
    };
  }

  /**
   * Transforms stored response_json to new key names format
   * @param tokenInfo TokenInfoEntity from database
   * @returns Response with new key names
   */
  private transformToNewFormat(tokenInfo: TokenInfoEntity): any {
    if (
      !tokenInfo.response_json ||
      !tokenInfo.response_json.result ||
      !Array.isArray(tokenInfo.response_json.result)
    ) {
      return {
        message: 'successful',
        result: [],
      };
    }

    const token = tokenInfo.response_json.result[0];
    if (!token) {
      return {
        message: 'successful',
        result: [],
      };
    }

    // Build token object with new key names
    const transformedToken: any = {};

    // Transform keys: old name → new name
    // tick → ticker
    transformedToken.ticker = token.tick || token.ticker || null;

    // max → MaximumSupply
    transformedToken.MaximumSupply = token.max || token.MaximumSupply || null;

    // lim → MintLimit
    transformedToken.MintLimit = token.lim || token.MintLimit || null;

    // pre → preAllocated
    transformedToken.preAllocated = token.pre || token.preAllocated || null;

    // to → to (same)
    transformedToken.to = token.to || null;

    // dec → decimal
    transformedToken.decimal = token.dec || token.decimal || null;
    const tokenDecimals = this.parseTokenDecimals(transformedToken.decimal);

    // mod → Deploymentmode
    transformedToken.Deploymentmode = token.mod || token.Deploymentmode || null;

    // minted → minted (same)
    transformedToken.minted = token.minted || null;

    // burned → burned (same)
    transformedToken.burned = token.burned || null;

    // ca → ContractAddress
    transformedToken.ContractAddress =
      token.ca || token.ContractAddress || null;

    // name: from database column (NOT from JSON, no fallback to tick)
    // Always include, even if null (from Kasplex API, no fallback)
    transformedToken.name = tokenInfo.name || null;

    // Other fields that stay the same
    transformedToken.opScoreAdd = token.opScoreAdd || null;
    transformedToken.opScoreMod = token.opScoreMod || null;
    transformedToken.state = token.state || null;
    transformedToken.hashRev = token.hashRev || null;
    transformedToken.mtsAdd = token.mtsAdd || null;
    transformedToken.holderTotal = token.holderTotal || null;
    transformedToken.transferTotal = token.transferTotal || null;
    transformedToken.mintTotal = token.mintTotal || null;

    // identifier: from database column
    transformedToken.identifier = tokenInfo.identifier || null;

    // lastSyncedAt: from updated_at
    transformedToken.lastSyncedAt = tokenInfo.updated_at
      ? tokenInfo.updated_at.toISOString()
      : null;

    // holder array (same structure)
    if (token.holder && Array.isArray(token.holder)) {
      transformedToken.holder = token.holder.map((holder: any) => ({
        ...holder,
        amount: this.toAmountNumber(holder?.amount, tokenDecimals),
      }));
    }

    return {
      message: tokenInfo.response_json.message || 'successful',
      result: [transformedToken],
    };
  }

  private parseTokenDecimals(decimals: unknown): number {
    if (typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0) {
      return decimals;
    }

    if (typeof decimals === 'string' && /^\d+$/.test(decimals.trim())) {
      return Number(decimals.trim());
    }

    return 0;
  }

  private toAmountNumber(amount: unknown, decimals: number): number {
    if (amount === null || amount === undefined) {
      return 0;
    }

    const raw = String(amount).trim();
    if (!/^\d+$/.test(raw)) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    const safeDecimals = Number.isInteger(decimals) && decimals > 0 ? decimals : 0;
    if (safeDecimals === 0) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    const padded = raw.padStart(safeDecimals + 1, '0');
    const integerPart = padded.slice(0, -safeDecimals);
    const fractionalPart = padded.slice(-safeDecimals);
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '') || '0';
    const parsed = Number(`${normalizedInteger}.${fractionalPart}`);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
