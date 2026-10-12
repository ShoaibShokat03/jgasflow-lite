import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { parse, z } from '../common/util';
import { zBusinessName, zEmailOpt, zPassword, zPersonName, zPhone } from '../common/rules';
import { AllowExpired, AnyUser, AuthUser, CurrentUser, Public } from './auth.decorators';
import { AuthService, SessionInfo } from './auth.service';
import { PlatformService } from '../platform/platform.service';

const zClient = { client: z.enum(['web', 'mobile']).optional().default('web'), device: z.string().trim().max(120).optional().default('') };

const info = (req: Request, b: { client: string; device: string }): SessionInfo => ({
  client: b.client,
  device: b.device || String(req.headers['user-agent'] || '').slice(0, 120),
  ip: req.ip,
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly platform: PlatformService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('signup')
  signup(@Body() body: unknown, @Req() req: Request) {
    const b = parse(
      z.object({ shop_name: zBusinessName, owner_name: zPersonName, phone: zPhone, email: zEmailOpt, password: zPassword, ...zClient }),
      body,
    );
    return this.auth.signup(b, info(req, b));
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() body: unknown, @Req() req: Request) {
    const b = parse(z.object({ login: z.string().trim().min(3, 'Enter your phone or email').max(160), password: z.string().min(1, 'Enter your password').max(100), ...zClient }), body);
    return this.auth.login(b.login, b.password, info(req, b));
  }

  /** Support login: trades a one-time console code for a shop owner session. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('impersonate')
  async impersonate(@Body() body: unknown, @Req() req: Request) {
    const b = parse(z.object({ code: z.string().min(20).max(600) }), body);
    const { userId, adminId } = this.platform.redeemCode(b.code);
    return this.auth.issueFor(userId, { client: 'web', device: `Support login (admin #${adminId})`, ip: req.ip });
  }

  @AnyUser()
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.profile(u.id);
  }

  @AnyUser()
  @AllowExpired()
  @Put('me')
  updateMe(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.auth.updateMe(u, parse(z.object({ name: zPersonName, email: zEmailOpt }), body));
  }

  @AnyUser()
  @AllowExpired()
  @HttpCode(200)
  @Post('logout')
  async logout(@CurrentUser() u: AuthUser) {
    await this.auth.logout(u);
    return { ok: true };
  }

  @AnyUser()
  @AllowExpired()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('password')
  async password(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ current: z.string().min(1, 'Enter your current password'), next: zPassword }), body);
    await this.auth.changePassword(u, b.current, b.next);
    return { ok: true };
  }

  @AnyUser()
  @Get('sessions')
  sessions(@CurrentUser() u: AuthUser) {
    return this.auth.sessions(u);
  }

  @AnyUser()
  @AllowExpired()
  @Delete('sessions/:id')
  async revoke(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.auth.revokeSession(u, id);
    return { ok: true };
  }
}
