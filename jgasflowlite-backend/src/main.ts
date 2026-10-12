import 'reflect-metadata';
import { ENV, IS_PRODUCTION } from './config/env';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { getCorsConfig } from './config/origins';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/** Refuse to boot in production with a missing or weak token secret. */
function assertProductionSecrets() {
  if (!IS_PRODUCTION) return;
  const secret = process.env.TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    // eslint-disable-next-line no-console
    console.error('FATAL: TOKEN_SECRET must be set to at least 32 characters in production.');
    process.exit(1);
  }
}

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: IS_PRODUCTION ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
    bodyParser: false,
  });
  const logger = new Logger('Bootstrap');

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.enableCors(getCorsConfig(process.env.CORS_ORIGINS));
  // Data files and first syncs can be large.
  app.use(express.json({ limit: '40mb' }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(ENV.port, '0.0.0.0');
  logger.log(`JGasFlow API listening on http://0.0.0.0:${ENV.port}/api`);
}
bootstrap();
