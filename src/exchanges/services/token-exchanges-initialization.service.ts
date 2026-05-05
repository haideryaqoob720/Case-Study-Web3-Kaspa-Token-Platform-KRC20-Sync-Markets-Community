// Token Exchanges Initialization Service: Auto-populates token_exchanges on startup if empty

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangesRepository } from '../repositories/exchanges.repository';

@Injectable()
export class TokenExchangesInitializationService implements OnModuleInit {
  private readonly logger = new Logger(
    TokenExchangesInitializationService.name,
  );
  private readonly tokenExchangeMap: Record<string, string[]>;
  private readonly exchangeSymbolFormats: Record<
    string,
    (ticker: string) => string
  >;

  constructor(
    private readonly exchangesRepository: ExchangesRepository,
    private configService: ConfigService,
  ) {
    const tokenExchangesConfig = this.configService.get('tokenExchanges');
    this.tokenExchangeMap = tokenExchangesConfig?.tokenExchangeMap ?? {};
    this.exchangeSymbolFormats =
      tokenExchangesConfig?.exchangeSymbolFormats ?? {};
  }

  async onModuleInit() {
    await this.waitForExchanges();
    await this.initializeTokenExchanges();

    setTimeout(async () => {
      const existingCount =
        await this.exchangesRepository.countActiveTokenExchanges();
      if (existingCount === 0) {
        this.logger.log(
          'Retrying token exchanges initialization after token sync...',
        );
        await this.initializeTokenExchanges();
      }
    }, 30000);
  }

  private async waitForExchanges(maxRetries = 10): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      const exchangeCount = await this.exchangesRepository.countExchanges();
      if (exchangeCount >= 8) {
        this.logger.debug(`Exchanges ready (${exchangeCount} found)`);
        return;
      }
      const delay = 500 * Math.pow(2, i);
      this.logger.debug(
        `Waiting for exchanges... (${exchangeCount}/8 found, retry ${i + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.logger.warn(
      'Exchanges not fully initialized after max retries, proceeding anyway',
    );
  }

  private async initializeTokenExchanges(): Promise<void> {
    try {
      const existingCount =
        await this.exchangesRepository.countActiveTokenExchanges();

      if (existingCount > 0) {
        this.logger.log(
          `Token exchanges already initialized (${existingCount} active pairs found)`,
        );
        return;
      }

      this.logger.log(
        'No token exchanges found. Auto-populating from predefined list...',
      );

      const populated = await this.populateFromPredefinedList();

      if (populated > 0) {
        this.logger.log(
          `Successfully auto-populated ${populated} token-exchange pairs`,
        );
      } else {
        this.logger.warn(
          'Failed to populate token exchanges. Please check logs above.',
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to initialize token exchanges:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async populateFromPredefinedList(): Promise<number> {
    try {
      const exchanges = await this.exchangesRepository.findAll();
      const exchangeMap = new Map<
        string,
        { id: string; name: string; code: string }
      >();
      for (const exchange of exchanges) {
        exchangeMap.set(exchange.code.toLowerCase(), {
          id: exchange.id,
          name: exchange.name,
          code: exchange.code,
        });
      }

      const existingPairs =
        await this.exchangesRepository.findAllTokenExchanges();
      const existingSet = new Set(
        existingPairs.map((te) => `${te.tokenIdentifier}_${te.exchangeId}`),
      );

      let created = 0;
      let skipped = 0;
      let errors = 0;

      for (const [tokenIdentifier, exchangeCodes] of Object.entries(
        this.tokenExchangeMap,
      )) {
        for (const exchangeCode of exchangeCodes) {
          const exchange = exchangeMap.get(exchangeCode.toLowerCase());
          if (!exchange) {
            this.logger.warn(
              `Exchange ${exchangeCode} not found (skipping ${tokenIdentifier})`,
            );
            skipped++;
            continue;
          }

          const key = `${tokenIdentifier}_${exchange.id}`;
          if (existingSet.has(key)) continue;

          try {
            const symbolFormatter =
              this.exchangeSymbolFormats[exchangeCode.toLowerCase()];
            const exchangeSymbol = symbolFormatter
              ? symbolFormatter(tokenIdentifier)
              : `${tokenIdentifier}USDT`;

            await this.exchangesRepository.createTokenExchange({
              tokenIdentifier: tokenIdentifier.toUpperCase(),
              exchangeId: exchange.id,
              exchangeSymbol,
              baseCurrency: 'USDT',
              isActive: true,
              verifiedAt: new Date(),
            });
            created++;
            existingSet.add(key);
            this.logger.debug(
              `Created: ${tokenIdentifier} on ${exchange.name} (${exchangeSymbol})`,
            );
          } catch (error) {
            errors++;
            this.logger.error(
              `Failed to create ${tokenIdentifier} on ${exchangeCode}: ${error instanceof Error ? error.message : error}`,
            );
          }
        }
      }

      if (created > 0) {
        this.logger.log(
          `Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`,
        );
      }

      return created;
    } catch (error) {
      this.logger.error(
        `Failed to populate from predefined list: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }
}
