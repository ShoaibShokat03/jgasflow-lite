import { Module } from '@nestjs/common';
import { BillingService } from '../billing/billing.service';
import { PlatformConfig } from './platform-config.service';
import { PlatformService } from './platform.service';
import { PlatformController, PublicController } from './platform.controller';

/** Platform console API plus the services the shop app and the AI share. */
@Module({
  controllers: [PlatformController, PublicController],
  providers: [PlatformConfig, PlatformService, BillingService],
  exports: [PlatformConfig, PlatformService, BillingService],
})
export class PlatformModule {}
