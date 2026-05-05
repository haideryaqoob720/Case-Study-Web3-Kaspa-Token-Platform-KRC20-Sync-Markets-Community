import {
  Controller,
  Get,
  Query,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TokenNewsService, TokenNewsArticle } from './token-news.service';

@ApiTags('token-news')
@Controller('token-news')
export class TokenNewsController {
  constructor(private readonly tokenNewsService: TokenNewsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get token-related news',
    description:
      'Returns aggregated news articles for a token ticker from Kaspa, kas.fyi, kaspamemes, Google News, and crypto feeds.',
  })
  @ApiQuery({
    name: 'ticker',
    required: true,
    type: String,
    description: 'Token ticker (e.g. NACHO)',
    example: 'NACHO',
  })
  @ApiQuery({
    name: 'token',
    required: false,
    type: String,
    description: 'Alias for ticker',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of news articles',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          link: { type: 'string' },
          contentSnippet: { type: 'string' },
          pubDate: { type: 'string' },
          image: { type: 'string', nullable: true },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Ticker is required',
  })
  async getTokenNews(
    @Query('ticker') ticker: string | undefined,
    @Query('token') token: string | undefined,
  ): Promise<TokenNewsArticle[]> {
    const tickerParam = ticker?.trim() || token?.trim();
    if (!tickerParam) {
      throw new BadRequestException('Query parameter "ticker" or "token" is required');
    }
    return this.tokenNewsService.getTokenNews(tickerParam);
  }
}
