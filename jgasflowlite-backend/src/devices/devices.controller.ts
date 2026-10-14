import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { parse, z } from '../common/util';
import { AdminPerm, AllowExpired, AuthUser, CurrentUser, Roles, SuperAdmin, tid } from '../auth/auth.decorators';
import { DevicesService } from './devices.service';

const zDeviceId = z.string().trim().min(8, 'Unknown phone').max(80).regex(/^[A-Za-z0-9._:-]+$/, 'Unknown phone');
const zDevice = z.object({
  device_id: zDeviceId,
  model: z.string().trim().max(120).optional().default(''),
  platform: z.string().trim().max(20).optional().default('android'),
  app_version: z.string().trim().max(20).optional().default(''),
  replace: z.boolean().optional().default(false),
});

/**
 * Phones of a shop. Allowed when the plan has ended, so a phone can still learn
 * that it has become read-only.
 */
@AllowExpired()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  @Post('register')
  register(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(zDevice, body);
    return this.devices.register(u, b, b.replace);
  }

  @HttpCode(200)
  @Post('check')
  check(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.devices.check(u, parse(zDevice.pick({ device_id: true, app_version: true }), body));
  }

  @Roles('owner')
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.devices.list(tid(u));
  }

  @Roles('owner')
  @HttpCode(200)
  @Post(':id/release')
  release(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.devices.release(id, u.id, tid(u));
  }
}

/** Console: release a lost or replaced phone. */
@SuperAdmin()
@AdminPerm('shops')
@Controller('platform/devices')
export class PlatformDevicesController {
  constructor(private readonly devices: DevicesService) {}

  @HttpCode(200)
  @Post(':id/release')
  release(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.devices.release(id, u.id);
  }
}
