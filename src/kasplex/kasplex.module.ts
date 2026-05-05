// Kasplex Module: Configures and exports KasplexApiService for use by worker modules

import { Module } from '@nestjs/common';
import { KasplexApiService } from './kasplex-api.service';

@Module({
  providers: [KasplexApiService],
  exports: [KasplexApiService],
})
export class KasplexModule {}
