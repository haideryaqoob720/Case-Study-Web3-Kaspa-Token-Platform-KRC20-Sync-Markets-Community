import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { TokenMetadataService } from './token-metadata.service';
import { TokenMetadataInput } from './token-metadata.repository';

@ApiTags('token-metadata')
@Controller('token-metadata')
export class TokenMetadataController {
  constructor(private readonly tokenMetadataService: TokenMetadataService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all token metadata',
    description:
      'Returns all curated token metadata (ticker, website, description, image, socials).',
  })
  @ApiResponse({ status: 200, description: 'List of token metadata records' })
  async getAll() {
    const list = await this.tokenMetadataService.getAll();
    return { tokens: list };
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk upsert token metadata',
    description:
      'Insert or update multiple token metadata records at once. Each item is upserted by ticker.',
  })
  @ApiBody({
    description:
      'Array of token metadata objects, or object with "tokens" array',
    schema: {
      oneOf: [
        {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ticker: { type: 'string' },
              website: { type: 'string', nullable: true },
              description: { type: 'string', nullable: true },
              image: { type: 'string', nullable: true },
              socials: {
                type: 'object',
                additionalProperties: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            required: ['ticker'],
          },
        },
        {
          type: 'object',
          properties: {
            tokens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ticker: { type: 'string' },
                  website: { type: 'string', nullable: true },
                  description: { type: 'string', nullable: true },
                  image: { type: 'string', nullable: true },
                  socials: { type: 'object' },
                },
                required: ['ticker'],
              },
            },
          },
          required: ['tokens'],
        },
      ],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk upsert result with inserted and updated counts',
  })
  @ApiResponse({ status: 400, description: 'Invalid body' })
  async bulkUpsert(
    @Body() body: { tokens?: TokenMetadataInput[] } | TokenMetadataInput[],
  ) {
    const tokens: TokenMetadataInput[] = Array.isArray(body)
      ? body
      : (body?.tokens ?? []);
    return this.tokenMetadataService.bulkUpsert(tokens);
  }
}
