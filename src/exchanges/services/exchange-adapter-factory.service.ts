// Exchange Adapter Factory Service: Provides the correct exchange adapter instance
// for each exchange code (maps exchange codes to their adapter implementations)

import { Injectable, Logger } from '@nestjs/common';
import { ExchangeEntity } from '../../database/entities/exchange.entity';
import { IExchangeAdapter } from '../interfaces/exchange-adapter.interface';
import { GateIoAdapter } from '../adapters/gateio.adapter';
import { AscendExAdapter } from '../adapters/ascendex.adapter';
import { CoinExAdapter } from '../adapters/coinex.adapter';
import { BitMartAdapter } from '../adapters/bitmart.adapter';
import { FameExAdapter } from '../adapters/fameex.adapter';
import { XtAdapter } from '../adapters/xt.adapter';
import { PionexAdapter } from '../adapters/pionex.adapter';
import { MexcAdapter } from '../adapters/mexc.adapter';

/**
 * Exchange Adapter Factory Service
 * Provides the correct adapter instance for each exchange
 */
@Injectable()
export class ExchangeAdapterFactoryService {
  private readonly logger = new Logger(ExchangeAdapterFactoryService.name);
  private readonly adapters: Map<string, IExchangeAdapter>;

  constructor(
    private readonly gateIoAdapter: GateIoAdapter,
    private readonly ascendExAdapter: AscendExAdapter,
    private readonly coinExAdapter: CoinExAdapter,
    private readonly bitMartAdapter: BitMartAdapter,
    private readonly fameExAdapter: FameExAdapter,
    private readonly xtAdapter: XtAdapter,
    private readonly pionexAdapter: PionexAdapter,
    private readonly mexcAdapter: MexcAdapter,
  ) {
    // Map exchange codes to their adapters
    this.adapters = new Map<string, IExchangeAdapter>([
      ['gate_io', this.gateIoAdapter],
      ['ascendex', this.ascendExAdapter],
      ['coinex', this.coinExAdapter],
      ['bitmart', this.bitMartAdapter],
      ['fameex', this.fameExAdapter],
      ['xt', this.xtAdapter],
      ['pionex', this.pionexAdapter],
      ['mexc', this.mexcAdapter],
    ]);
  }

  /**
   * Get adapter for a specific exchange
   * @param exchange Exchange entity
   * @returns Exchange adapter instance
   * @throws Error if adapter not found
   */
  getAdapter(exchange: ExchangeEntity): IExchangeAdapter {
    const adapter = this.adapters.get(exchange.code);

    if (!adapter) {
      const error = new Error(
        `No adapter found for exchange: ${exchange.code} (${exchange.name})`,
      );
      this.logger.error(error.message);
      throw error;
    }

    return adapter;
  }
}
