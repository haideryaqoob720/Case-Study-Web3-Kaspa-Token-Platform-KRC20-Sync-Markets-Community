import { Injectable, BadRequestException } from '@nestjs/common';
import { WatchlistRepository } from './watchlist.repository';
import { UsersService } from '../users/users.service';
import { CacheService } from '../cache/cache.service';
import { Types } from 'mongoose';

@Injectable()
export class WatchlistService {
  constructor(
    private readonly watchlistRepository: WatchlistRepository,
    private readonly usersService: UsersService,
    private readonly cacheService: CacheService,
  ) {}

  async getList(walletAddress: string | null | undefined): Promise<{ tokenId: string; createdAt: string }[]> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }
    const items = await this.watchlistRepository.findByWallet(walletAddress.trim());
    return items.map((item) => ({
      tokenId: item.tokenId,
      createdAt: (item as any).createdAt
        ? new Date((item as any).createdAt).toISOString()
        : '',
    }));
  }

  async add(
    walletAddress: string | null | undefined,
    tokenId: string | null | undefined,
  ): Promise<{ ok: boolean }> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }
    if (!tokenId || typeof tokenId !== 'string' || !tokenId.trim()) {
      throw new BadRequestException('tokenId is required');
    }
    const user = await this.usersService.getOrCreateByWallet(walletAddress);
    const userId =
      (user as any)._id instanceof Types.ObjectId
        ? (user as any)._id
        : new Types.ObjectId((user as any)._id?.toString?.() ?? (user as any).id);
    await this.watchlistRepository.add(walletAddress.trim(), tokenId.trim(), userId);
    await this.cacheService.invalidateTokenListingCaches();
    return { ok: true };
  }

  async remove(
    walletAddress: string | null | undefined,
    tokenId: string | null | undefined,
  ): Promise<{ ok: boolean }> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }
    if (!tokenId || typeof tokenId !== 'string' || !tokenId.trim()) {
      throw new BadRequestException('tokenId is required');
    }
    await this.watchlistRepository.remove(walletAddress.trim(), tokenId.trim());
    await this.cacheService.invalidateTokenListingCaches();
    return { ok: true };
  }

  async has(walletAddress: string, tokenId: string): Promise<boolean> {
    return this.watchlistRepository.has(walletAddress.trim(), tokenId.trim());
  }

  async countByToken(tokenId: string): Promise<number> {
    return this.watchlistRepository.countByToken(tokenId.trim());
  }
}
