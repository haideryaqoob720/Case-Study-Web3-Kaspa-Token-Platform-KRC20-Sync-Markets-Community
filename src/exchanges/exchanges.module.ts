// Exchanges Module: Mongoose schemas, adapters, services, repositories

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ExchangeDocument,
  ExchangeSchema,
} from '../database/schemas/exchange.schema';
import {
  TokenExchangeDocument,
  TokenExchangeSchema,
} from '../database/schemas/token-exchange.schema';
import {
  ExchangeMarketData24hDocument,
  ExchangeMarketData24hSchema,
} from '../database/schemas/exchange-market-data-24h.schema';
import {
  ExchangeMarketData7dDocument,
  ExchangeMarketData7dSchema,
} from '../database/schemas/exchange-market-data-7d.schema';
import {
  ExchangeSyncLogDocument,
  ExchangeSyncLogSchema,
} from '../database/schemas/exchange-sync-log.schema';
import {
  RecentTradeDocument,
  RecentTradeSchema,
} from '../database/schemas/recent-trade.schema';
import {
  KasplexRecentTradeDocument,
  KasplexRecentTradeSchema,
} from '../database/schemas/kasplex-recent-trade.schema';
import {
  ExchangeMarketData1hDocument,
  ExchangeMarketData1hSchema,
} from '../database/schemas/exchange-market-data-1h.schema';
import {
  ExchangeMarketData1dDocument,
  ExchangeMarketData1dSchema,
} from '../database/schemas/exchange-market-data-1d.schema';
import {
  ExchangeMarketData1MDocument,
  ExchangeMarketData1MSchema,
} from '../database/schemas/exchange-market-data-1M.schema';
import {
  ExchangeMarketData1YDocument,
  ExchangeMarketData1YSchema,
} from '../database/schemas/exchange-market-data-1Y.schema';
import {
  ExchangeMarketDataMaxDocument,
  ExchangeMarketDataMaxSchema,
} from '../database/schemas/exchange-market-data-max.schema';
import {
  ExchangeKlinesSyncStateDocument,
  ExchangeKlinesSyncStateSchema,
} from '../database/schemas/exchange-klines-sync-state.schema';
import {
  AggregatedTokenCandleDocument,
  AggregatedTokenCandleSchema,
} from '../database/schemas/aggregated-token-candle.schema';

import { GateIoAdapter } from './adapters/gateio.adapter';
import { AscendExAdapter } from './adapters/ascendex.adapter';
import { CoinExAdapter } from './adapters/coinex.adapter';
import { BitMartAdapter } from './adapters/bitmart.adapter';
import { FameExAdapter } from './adapters/fameex.adapter';
import { XtAdapter } from './adapters/xt.adapter';
import { PionexAdapter } from './adapters/pionex.adapter';
import { MexcAdapter } from './adapters/mexc.adapter';

import { ExchangeAdapterFactoryService } from './services/exchange-adapter-factory.service';
import { ExchangesService } from './services/exchanges.service';
import { ExchangesInitializationService } from './services/exchanges-initialization.service';
import { TokenExchangesInitializationService } from './services/token-exchanges-initialization.service';
import { FloorPriceCalculatorService } from './services/floor-price-calculator.service';
import { RecentTradesService } from './services/recent-trades.service';
import { RecentTradesAdapterService } from './services/recent-trades-adapter.service';
import { ExchangesRepository } from './repositories/exchanges.repository';
import { RecentTradesRepository } from './repositories/recent-trades.repository';
import { KasplexRecentTradesRepository } from './repositories/kasplex-recent-trades.repository';
import { RecentTradesController } from './recent-trades.controller';
import { KasplexModule } from '../kasplex/kasplex.module';
import { KasPriceModule } from '../kas-price/kas-price.module';

@Module({
  imports: [
    KasPriceModule,
    MongooseModule.forFeature([
      { name: ExchangeDocument.name, schema: ExchangeSchema },
      { name: TokenExchangeDocument.name, schema: TokenExchangeSchema },
      {
        name: ExchangeMarketData24hDocument.name,
        schema: ExchangeMarketData24hSchema,
      },
      {
        name: ExchangeMarketData7dDocument.name,
        schema: ExchangeMarketData7dSchema,
      },
      {
        name: ExchangeMarketData1hDocument.name,
        schema: ExchangeMarketData1hSchema,
      },
      {
        name: ExchangeMarketData1dDocument.name,
        schema: ExchangeMarketData1dSchema,
      },
      {
        name: ExchangeMarketData1MDocument.name,
        schema: ExchangeMarketData1MSchema,
      },
      {
        name: ExchangeMarketData1YDocument.name,
        schema: ExchangeMarketData1YSchema,
      },
      {
        name: ExchangeMarketDataMaxDocument.name,
        schema: ExchangeMarketDataMaxSchema,
      },
      {
        name: ExchangeKlinesSyncStateDocument.name,
        schema: ExchangeKlinesSyncStateSchema,
      },
      {
        name: AggregatedTokenCandleDocument.name,
        schema: AggregatedTokenCandleSchema,
      },
      { name: ExchangeSyncLogDocument.name, schema: ExchangeSyncLogSchema },
      { name: RecentTradeDocument.name, schema: RecentTradeSchema },
      {
        name: KasplexRecentTradeDocument.name,
        schema: KasplexRecentTradeSchema,
      },
    ]),
    KasplexModule,
  ],
  providers: [
    GateIoAdapter,
    AscendExAdapter,
    CoinExAdapter,
    BitMartAdapter,
    FameExAdapter,
    XtAdapter,
    PionexAdapter,
    MexcAdapter,
    ExchangeAdapterFactoryService,
    ExchangesService,
    ExchangesInitializationService,
    TokenExchangesInitializationService,
    FloorPriceCalculatorService,
    RecentTradesService,
    RecentTradesAdapterService,
    ExchangesRepository,
    RecentTradesRepository,
    KasplexRecentTradesRepository,
  ],
  controllers: [RecentTradesController],
  exports: [
    ExchangeAdapterFactoryService,
    ExchangesService,
    FloorPriceCalculatorService,
    RecentTradesAdapterService,
    ExchangesRepository,
    RecentTradesRepository,
    KasplexRecentTradesRepository,
    GateIoAdapter,
    AscendExAdapter,
    CoinExAdapter,
    BitMartAdapter,
    FameExAdapter,
    XtAdapter,
    PionexAdapter,
    MexcAdapter,
  ],
})
export class ExchangesModule {}
