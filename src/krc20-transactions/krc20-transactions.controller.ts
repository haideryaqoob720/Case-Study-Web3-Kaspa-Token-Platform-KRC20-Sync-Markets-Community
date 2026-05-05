import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Krc20TransactionsService } from './krc20-transactions.service';
import { RecentKrc20TxQueryDto } from './dto/recent-krc20-tx-query.dto';

@ApiTags('krc20-transactions')
@Controller('v1/krc20/transactions')
export class Krc20TransactionsController {
  constructor(
    private readonly krc20TransactionsService: Krc20TransactionsService,
  ) {}

  @Get('recent-transactions')
  @ApiOperation({
    summary: 'Recent KRC20 operations for a tick and wallet',
    description:
      'Loads a page from Kasplex oplist filtered by tick + wallet, upserts into MongoDB (`krc20_ops`), and returns classified rows (type, direction, amounts, optional price for send). Stored documents are indexed on `from` and `to` for wallet lookups.',
  })
  @ApiQuery({ name: 'tick', required: true, example: 'NACHO' })
  @ApiQuery({ name: 'address', required: true })
  @ApiQuery({ name: 'next', required: false })
  async recentTransactions(@Query() query: RecentKrc20TxQueryDto) {
    return this.krc20TransactionsService.fetchPageAndPersist({
      tick: query.tick,
      address: query.address,
      next: query.next,
    });
  }
}
