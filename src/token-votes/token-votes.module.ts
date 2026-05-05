import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TokenVoteDocument, TokenVoteSchema } from '../database/schemas/token-vote.schema';
import { TokenVotesController } from './token-votes.controller';
import { TokenVotesService } from './token-votes.service';
import { TokenVotesRepository } from './token-votes.repository';
import { TokensModule } from '../tokens/tokens.module';
import { UsersModule } from '../users/users.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TokenVoteDocument.name, schema: TokenVoteSchema },
    ]),
    TokensModule,
    UsersModule,
    CacheModule,
  ],
  controllers: [TokenVotesController],
  providers: [TokenVotesService, TokenVotesRepository],
  exports: [TokenVotesService],
})
export class TokenVotesModule {}
