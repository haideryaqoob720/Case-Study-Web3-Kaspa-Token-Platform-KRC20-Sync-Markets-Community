import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Krc20OpDocument,
  Krc20OpSchema,
} from '../database/schemas/krc20-op.schema';
import {
  TransactionDocument,
  TransactionSchema,
} from '../database/schemas/transaction.schema';
import { KasplexModule } from '../kasplex/kasplex.module';
import { TokensModule } from '../tokens/tokens.module';
import { Krc20OpRepository } from './krc20-op.repository';
import { TransactionsRepository } from './transactions.repository';
import { Krc20TransactionsService } from './krc20-transactions.service';
import { Krc20TransactionsController } from './krc20-transactions.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Krc20OpDocument.name, schema: Krc20OpSchema },
      { name: TransactionDocument.name, schema: TransactionSchema },
    ]),
    KasplexModule,
    TokensModule,
  ],
  controllers: [Krc20TransactionsController],
  providers: [Krc20OpRepository, TransactionsRepository, Krc20TransactionsService],
  exports: [Krc20TransactionsService, TransactionsRepository],
})
export class Krc20TransactionsModule {}
