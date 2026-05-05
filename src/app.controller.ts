import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { DatabaseHealthService } from './database/database.health';
import { CacheService } from './cache/cache.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dbHealth: DatabaseHealthService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get hello message' })
  @ApiResponse({ status: 200, description: 'Returns a hello message' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Returns health status of database and Redis',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2025-12-31T12:00:00.000Z' },
        database: {
          type: 'object',
          properties: {
            isConnected: { type: 'boolean' },
            database: { type: 'string' },
            host: { type: 'string' },
            port: { type: 'number' },
            healthy: { type: 'boolean' },
          },
        },
        redis: {
          type: 'object',
          properties: {
            isConnected: { type: 'boolean' },
            status: { type: 'string' },
            host: { type: 'string' },
            port: { type: 'number' },
            healthy: { type: 'boolean' },
          },
        },
      },
    },
  })
  async getHealth() {
    const dbHealthy = await this.dbHealth.isHealthy();
    const dbInfo = await this.dbHealth.getConnectionInfo();
    const redisHealthy = await this.cacheService.ping();
    const redisInfo = this.cacheService.getConnectionInfo();

    // Redis is optional, so health check passes if DB is healthy regardless of Redis status
    const allHealthy = dbHealthy;

    return {
      status: allHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: {
        ...dbInfo,
        healthy: dbHealthy,
      },
      redis: {
        ...redisInfo,
        healthy: redisHealthy,
      },
    };
  }
}
