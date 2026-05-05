import { Injectable } from '@nestjs/common';
import {
  TokenMetadataRepository,
  TokenMetadataInput,
} from './token-metadata.repository';
import { TokenMetadataEntity } from '../database/schemas/token-metadata.schema';

@Injectable()
export class TokenMetadataService {
  constructor(
    private readonly tokenMetadataRepository: TokenMetadataRepository,
  ) {}

  async getAll(): Promise<TokenMetadataEntity[]> {
    return this.tokenMetadataRepository.findAll();
  }

  async bulkUpsert(
    tokens: TokenMetadataInput[],
  ): Promise<{ ok: boolean; inserted: number; updated: number }> {
    const { inserted, updated } =
      await this.tokenMetadataRepository.bulkUpsert(tokens);
    return { ok: true, inserted, updated };
  }
}
