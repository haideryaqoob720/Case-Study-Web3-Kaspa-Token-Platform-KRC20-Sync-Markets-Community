import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TokenVotesRepository } from './token-votes.repository';
import { TokensRepository } from '../tokens/tokens.repository';
import { UsersService } from '../users/users.service';
import { CacheService } from '../cache/cache.service';
import { SubmitVoteDto } from './dto/submit-vote.dto';
import { Types } from 'mongoose';

export interface VoteSummary {
  sentiment: { bullish: number; bearish: number };
  votes: { bullish: number; bearish: number; total: number };
  userVote: 'bullish' | 'bearish' | null;
}

@Injectable()
export class TokenVotesService {
  constructor(
    private readonly tokenVotesRepository: TokenVotesRepository,
    private readonly tokensRepository: TokensRepository,
    private readonly usersService: UsersService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Resolve token id from URL param (ticker or identifier).
   */
  private async resolveTokenId(paramId: string): Promise<string> {
    if (!paramId?.trim()) {
      throw new NotFoundException('Token not found');
    }
    const id = paramId.trim();
    const byTicker = await this.tokensRepository.findByTicker(id);
    if (byTicker) return byTicker.ticker;
    const byIdentifier = await this.tokensRepository.findByIdentifier(id);
    if (byIdentifier) return byIdentifier.ticker;
    throw new NotFoundException('Token not found');
  }

  async getVotes(tokenParamId: string, walletAddress?: string | null): Promise<VoteSummary> {
    const tokenId = await this.resolveTokenId(tokenParamId);

    const [bullishCount, bearishCount] = await Promise.all([
      this.tokenVotesRepository.countByTokenAndType(tokenId, 'bullish'),
      this.tokenVotesRepository.countByTokenAndType(tokenId, 'bearish'),
    ]);

    const totalVotes = bullishCount + bearishCount;
    const bullish =
      totalVotes > 0 ? Math.round((bullishCount / totalVotes) * 100) : 0;
    const bearish =
      totalVotes > 0 ? Math.round((bearishCount / totalVotes) * 100) : 0;

    let userVote: 'bullish' | 'bearish' | null = null;
    if (walletAddress?.trim()) {
      const existing = await this.tokenVotesRepository.findByTokenAndWallet(
        tokenId,
        walletAddress.trim(),
      );
      if (existing) userVote = existing.voteType;
    }

    return {
      sentiment: { bullish, bearish },
      votes: {
        bullish: bullishCount,
        bearish: bearishCount,
        total: totalVotes,
      },
      userVote,
    };
  }

  async getVotesByWallet(walletAddress: string | null | undefined): Promise<{ tokenId: string; voteType: 'bullish' | 'bearish'; updatedAt?: string }[]> {
    if (!walletAddress?.trim()) return [];
    const list = await this.tokenVotesRepository.findByWallet(walletAddress.trim());
    return list.map((v) => ({
      tokenId: v.tokenId,
      voteType: v.voteType,
      updatedAt: (v as any).updatedAt ? new Date((v as any).updatedAt).toISOString() : undefined,
    }));
  }

  async submitVote(
    tokenParamId: string,
    dto: SubmitVoteDto,
  ): Promise<{
    success: boolean;
    message: string;
    sentiment: { bullish: number; bearish: number };
    votes: { bullish: number; bearish: number; total: number };
  }> {
    const tokenId = await this.resolveTokenId(tokenParamId);
    const wallet = dto.walletAddress.trim();
    const voteType = dto.voteType;

    const user = await this.usersService.getOrCreateByWallet(wallet);
    const userId = (user as any)._id instanceof Types.ObjectId
      ? (user as any)._id
      : new Types.ObjectId((user as any)._id?.toString?.() ?? (user as any).id);

    const existing = await this.tokenVotesRepository.findByTokenAndWallet(
      tokenId,
      wallet,
    );

    if (existing) {
      if (existing.voteType === voteType) {
        throw new BadRequestException('Already voted for this option');
      }
      await this.tokenVotesRepository.updateVote(tokenId, wallet, userId, voteType);
    } else {
      await this.tokenVotesRepository.upsert(tokenId, wallet, userId, voteType);
    }

    await this.cacheService.invalidateTokenListingCaches();

    const summary = await this.getVotes(tokenParamId, wallet);
    return {
      success: true,
      message: existing ? 'Vote updated successfully' : 'Vote submitted successfully',
      sentiment: summary.sentiment,
      votes: summary.votes,
    };
  }
}
