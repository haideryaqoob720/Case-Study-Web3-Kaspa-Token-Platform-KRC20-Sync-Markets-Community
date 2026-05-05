import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TokenMetadataDocument,
  TokenMetadataSchema,
} from '../database/schemas/token-metadata.schema';
import { TokenMetadataController } from './token-metadata.controller';
import { TokenMetadataService } from './token-metadata.service';
import { TokenMetadataRepository } from './token-metadata.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TokenMetadataDocument.name, schema: TokenMetadataSchema },
    ]),
  ],
  controllers: [TokenMetadataController],
  providers: [TokenMetadataService, TokenMetadataRepository],
  exports: [TokenMetadataService],
})
export class TokenMetadataModule {}
