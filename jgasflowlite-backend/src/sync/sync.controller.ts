import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { parse, z } from '../common/util';
import { AllowExpired, AuthUser, CurrentUser, OnlineOnly, Roles } from '../auth/auth.decorators';
import { SyncService } from './sync.service';

@OnlineOnly()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(200)
  @Post('push')
  push(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ changes: z.record(z.array(z.record(z.any()))).optional(), profile: z.record(z.any()).optional(), device_id: z.string().max(80).optional(), client_now: z.number().optional() }), body);
    return this.sync.push(u, b);
  }

  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Get('pull')
  pull(@CurrentUser() u: AuthUser, @Query() query: unknown) {
    const p = parse(z.object({ since: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(50).max(5000).default(2000) }), query);
    return this.sync.pull(u, p.since, p.limit);
  }

  @Get('status')
  status(@CurrentUser() u: AuthUser) {
    return this.sync.status(u);
  }

  @Roles('owner', 'manager')
  @AllowExpired()
  @Get('export')
  exportAll(@CurrentUser() u: AuthUser) {
    return this.sync.exportAll(u);
  }

  @Roles('owner')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset')
  reset(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ password: z.string().min(1, 'Enter your password').max(100), confirm: z.literal('RESET', { errorMap: () => ({ message: 'Type RESET to confirm' }) }) }), body);
    return this.sync.resetData(u, b.password);
  }

  @Roles('owner')
  @HttpCode(200)
  @Post('import')
  importAll(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ mode: z.enum(['replace', 'merge']), data: z.any() }), body);
    return this.sync.importAll(u, b.mode, b.data);
  }
}
