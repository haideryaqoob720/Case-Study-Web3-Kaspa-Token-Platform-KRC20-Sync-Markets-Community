import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UserEntity } from '../database/schemas/user.schema';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Get or create a profile by wallet address. Used when voting or adding to watchlist.
   */
  async getOrCreateByWallet(walletAddress: string | null | undefined): Promise<UserEntity> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }
    return this.usersRepository.findOrCreateByWallet(walletAddress.trim());
  }

  async findByWallet(walletAddress: string | null | undefined): Promise<UserEntity | null> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      return null;
    }
    return this.usersRepository.findByWallet(walletAddress.trim());
  }
}
