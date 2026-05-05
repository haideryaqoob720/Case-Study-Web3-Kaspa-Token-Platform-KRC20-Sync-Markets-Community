// Exchanges Module Index: Exports all exchange-related services, adapters, repositories,
// interfaces, and DTOs for use by other modules (supports 8 exchanges: Gate.io, AscendEX,
// CoinEx, BitMart, FameEX, XT.com, Pionex, MEXC)

// Module
export { ExchangesModule } from './exchanges.module';

// Services
export { ExchangeAdapterFactoryService } from './services/exchange-adapter-factory.service';
export { ExchangesService } from './services/exchanges.service';
export type {
  AggregatedMarketData,
  ExchangeMarketData,
} from './services/exchanges.service';

// Repositories
export { ExchangesRepository } from './repositories/exchanges.repository';

// Interfaces
export type { IExchangeAdapter } from './interfaces/exchange-adapter.interface';

// DTOs
export type {
  NormalizedTicker24h,
  NormalizedKline,
  NormalizedKline7d,
} from './dto/normalized-market-data.dto';

// Adapters (exported for testing purposes)
export { GateIoAdapter } from './adapters/gateio.adapter';
export { AscendExAdapter } from './adapters/ascendex.adapter';
export { CoinExAdapter } from './adapters/coinex.adapter';
export { BitMartAdapter } from './adapters/bitmart.adapter';
export { FameExAdapter } from './adapters/fameex.adapter';
export { XtAdapter } from './adapters/xt.adapter';
export { PionexAdapter } from './adapters/pionex.adapter';
export { MexcAdapter } from './adapters/mexc.adapter';
