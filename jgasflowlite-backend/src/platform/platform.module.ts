import { Module } from '@nestjs/common';
import { BillingService } from '../billing/billing.service';
import { PlatformConfig } from './platform-config.service';
import { MailService } from './mail.service';
import { PlatformService } from './platform.service';
import { PlatformController, PublicController } from './platform.controller';
import { SupportService } from '../support/support.service';
import { PlatformSupportController, SupportController } from '../support/support.controller';
import { DevicesService } from '../devices/devices.service';
import { DevicesController, PlatformDevicesController } from '../devices/devices.controller';

/** Platform console API plus the services the shop app and the AI share. */
@Module({
  controllers: [PlatformController, PublicController, SupportController, PlatformSupportController, DevicesController, PlatformDevicesController],
  providers: [PlatformConfig, MailService, PlatformService, BillingService, SupportService, DevicesService],
  exports: [PlatformConfig, MailService, PlatformService, BillingService, SupportService, DevicesService],
})
export class PlatformModule {}
