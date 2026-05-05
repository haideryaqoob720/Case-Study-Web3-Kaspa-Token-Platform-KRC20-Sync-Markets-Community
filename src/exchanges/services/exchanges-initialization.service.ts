// Exchanges Initialization Service: Creates all configured exchanges on startup if missing

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangesRepository } from '../repositories/exchanges.repository';
import { ExchangeEntity } from '../../database/entities/exchange.entity';

@Injectable()
export class ExchangesInitializationService implements OnModuleInit {
  private readonly logger = new Logger(ExchangesInitializationService.name);
  private readonly exchangesData: Array<{
    code: string;
    name: string;
    apiBaseUrl: string;
  }>;

  constructor(
    private readonly exchangesRepository: ExchangesRepository,
    private configService: ConfigService,
  ) {
    const exchangesConfig = this.configService.get('exchanges');
    this.exchangesData = exchangesConfig?.exchanges ?? [];
  }

  async onModuleInit() {
    await this.initializeExchanges();
  }

  private async initializeExchanges(): Promise<void> {
    try {
      const existingExchanges = await this.exchangesRepository.findAll();

      if (existingExchanges.length > 0) {
        this.logger.log(
          `Exchanges already initialized (${existingExchanges.length} exchanges found)`,
        );
        return;
      }

      this.logger.log('No exchanges found. Initializing exchanges...');

      const createdExchanges: ExchangeEntity[] = [];
      const workerConfig = this.configService.get('worker');

      for (const exchangeData of this.exchangesData) {
        const existing = await this.exchangesRepository.findByCode(
          exchangeData.code,
        );

        if (existing) {
          this.logger.debug(
            `Exchange ${exchangeData.code} already exists, skipping`,
          );
          continue;
        }

        const saved = await this.exchangesRepository.createExchange({
          code: exchangeData.code,
          name: exchangeData.name,
          apiBaseUrl: exchangeData.apiBaseUrl,
          defaultBaseCurrency: workerConfig?.default?.baseCurrency ?? 'USDT',
          isActive: true,
          rateLimitDelayMs:
            workerConfig?.default?.exchangeRateLimitDelayMs ?? 200,
        });
        createdExchanges.push(saved);
        this.logger.log(
          `Created exchange: ${exchangeData.name} (${exchangeData.code})`,
        );
      }

      if (createdExchanges.length > 0) {
        this.logger.log(
          `Successfully initialized ${createdExchanges.length} exchanges`,
        );
      } else {
        this.logger.log('All exchanges already exist');
      }
    } catch (error) {
      this.logger.error('Failed to initialize exchanges:', error);
    }
  }
}
