import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TokenVotesService, VoteSummary } from './token-votes.service';
import { SubmitVoteDto } from './dto/submit-vote.dto';

@ApiTags('tokens')
@Controller('tokens')
export class TokenVotesController {
  constructor(private readonly tokenVotesService: TokenVotesService) {}

  @Get('by-wallet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all votes by wallet',
    description: 'Returns list of token votes (tokenId, voteType, updatedAt) for the given wallet address.',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Wallet address',
  })
  @ApiResponse({ status: 200, description: 'List of votes' })
  async getVotesByWallet(@Query('walletAddress') walletAddress: string) {
    const list = await this.tokenVotesService.getVotesByWallet(walletAddress ?? null);
    return { votes: list };
  }

  @Get(':id/vote')
  @ApiOperation({
    summary: 'Get vote counts and user vote',
    description:
      'Returns sentiment percentages, vote counts, and the current user vote (if walletAddress query is provided).',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: false,
    type: String,
    description: 'Connected wallet address to get userVote',
  })
  @ApiResponse({ status: 200, description: 'Vote summary' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async getVotes(
    @Param('id') id: string,
    @Query('walletAddress') walletAddress?: string,
  ): Promise<VoteSummary> {
    return this.tokenVotesService.getVotes(id, walletAddress ?? null);
  }

  @Post(':id/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit or update vote',
    description:
      'Submit a bullish or bearish vote for the token. Requires wallet connection. If already voted for the same option returns 400. If voted for the other option, updates the vote.',
  })
  @ApiResponse({ status: 200, description: 'Vote submitted or updated' })
  @ApiResponse({ status: 400, description: 'Already voted for this option or validation error' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async submitVote(
    @Param('id') id: string,
    @Body() dto: SubmitVoteDto,
  ) {
    return this.tokenVotesService.submitVote(id, dto);
  }
}
