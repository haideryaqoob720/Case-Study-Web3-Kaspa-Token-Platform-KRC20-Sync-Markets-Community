// Purpose: NestJS module for holder tracking feature (Mongoose)
// What: Registers schema, repository, service, and controller,
//      exports service for use in worker module

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TokenHolderSnapshotDocument,
  TokenHolderSnapshotSchema,
} from '../database/schemas/token-holder-snapshot.schema';
import {
  HolderTrend1mSnapshotDocument,
  HolderTrend1mSnapshotSchema,
} from '../database/schemas/holder-trend-1m-snapshot.schema';
import {
  TokenInfoDocument,
  TokenInfoSchema,
} from '../database/schemas/token-info.schema';
import { HolderSnapshotRepository } from './holder-snapshot.repository';
import { HolderSnapshotService } from './holder-snapshot.service';
import { HolderTrackingController } from './holder-tracking.controller';
import { HolderTrend1mRepository } from './holder-trend-1m.repository';
import { HolderTrend1mService } from './holder-trend-1m.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: TokenHolderSnapshotDocument.name,
        schema: TokenHolderSnapshotSchema,
      },
      {
        name: HolderTrend1mSnapshotDocument.name,
        schema: HolderTrend1mSnapshotSchema,
      },
      {
        name: TokenInfoDocument.name,
        schema: TokenInfoSchema,
      },
    ]),
  ],
  controllers: [HolderTrackingController],
  providers: [
    HolderSnapshotRepository,
    HolderSnapshotService,
    HolderTrend1mRepository,
    HolderTrend1mService,
  ],
  exports: [HolderSnapshotService, HolderTrend1mService],
})
export class HolderTrackingModule {}
