import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './db/db.module';
import { Public } from './auth/auth.decorators';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { EmailCodesService } from './auth/email-codes.service';
import { AuthController } from './auth/auth.controller';
import { ShopController } from './shop/shop.controller';
import { BillingController } from './billing/billing.controller';
import { AdminController } from './admin/admin.controller';
import { GasService } from './gas/gas.service';
import { GasController } from './gas/gas.controller';
import { SyncService } from './sync/sync.service';
import { SyncController } from './sync/sync.controller';
import { PlatformModule } from './platform/platform.module';
import { PlatformAiModule } from './ai/platform/platform-ai.module';

@Controller()
class HealthController {
  /** Liveness probe; the mobile app also uses it to test a server address. */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', app: 'JGasFlow', api: 1, time: new Date().toISOString() };
  }
}

@Module({
  imports: [DbModule, PlatformModule, PlatformAiModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 600 }])],
  controllers: [HealthController, AuthController, ShopController, BillingController, AdminController, GasController, SyncController],
  providers: [
    AuthService,
    EmailCodesService,
    GasService,
    SyncService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
