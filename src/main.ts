// Purpose: Application bootstrap and configuration
// What: Initializes NestJS app, configures CORS, validation, global API prefix,
//      sets up Swagger documentation with 'holders' tag for holder tracking endpoints

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { WebSocketGateway } from '@nestjs/websockets';

const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: isProduction ? ['error', 'warn'] : undefined,
  });

  const logger = new Logger('Bootstrap');

  app.useWebSocketAdapter(new IoAdapter(app));

  // Graceful shutdown: allow onModuleDestroy to run so schedulers stop before connection closes
  app.enableShutdownHooks();

  // Enable CORS for production
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix for API routes
  app.setGlobalPrefix('api');

  // Swagger/OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('Kaspamemes API')
    .setDescription('API documentation for Kaspamemes backend service')
    .setVersion('1.0')
    .addTag('tokens', 'Token management endpoints')
    .addTag('token-info', 'Token information endpoints')
    .addTag('holders', 'Holder tracking endpoints')
    .addTag('exchanges', 'Exchange data and recent trades')
    .addTag('feedback', 'Feedback and bug report endpoints')
    .addTag('watchlist', 'Wallet-scoped token favorites')
    .addTag(
      'token-metadata',
      'Curated token metadata (ticker, website, description, image, socials)',
    )
    .addTag('users', 'User profile (get-or-create by wallet)')
    .addTag('health', 'Health check endpoints')
    .addTag(
      'krc20-transactions',
      'KRC20 Kasplex oplist (all tokens; cached in MongoDB as krc20_ops)',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  logger.log(`Application is running on: http://localhost:${port}/api`);
  logger.log(`Swagger documentation: http://localhost:${port}/api/docs`);

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });
}
bootstrap();
