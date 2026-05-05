import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { KasPriceService } from './kas-price.service';

@Module({
  imports: [CacheModule],
  providers: [KasPriceService],
  exports: [KasPriceService],
})
export class KasPriceModule {}
