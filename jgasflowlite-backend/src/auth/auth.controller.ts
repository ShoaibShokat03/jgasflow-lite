import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { parse, z } from '../common/util';
import { zBusinessName, zEmailOpt, zPassword, zPersonName, zPhone } from '../common/rules';
import { AllowExpired, AnyUser, AuthUser, CurrentUser, Public } from './auth.decorators';
import { AuthService, SessionInfo } from './auth.service';
import { EmailCodesService } from './email-codes.service';
import { PlatformService } from '../platform/platform.service';

const zEmail = z.string().trim().toLowerCase().max(160).email('Enter a valid email');

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
    private readonly codes: EmailCodesService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('signup')
  signup(@Body() body: unknown, @Req() req: Request) {
    const b = parse(
      z.object({
        shop_name: zBusinessName,
        owner_name: zPersonName,
        phone: zPhone,
        email: zEmailOpt,
        password: zPassword,
        mode: z.enum(['offline', 'online']).default('online'),
        email_code: z.string().trim().max(12).optional(),
        // The phone and computer app send their build; builds from 11 on can do the email code.
        app_build: z.coerce.number().int().min(0).max(100000).optional(),
        ...zClient,
      }),
      body,
    );
    return this.auth.signup(b, info(req, b));
  }

  /** Sends a 6-digit code: purpose signup (confirm the email) or reset (forgot password). */
  @Public()
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @HttpCode(200)
  @Post('email-code')
  emailCode(@Body() body: unknown, @Req() req: Request) {
    const b = parse(z.object({ email: zEmail, purpose: z.enum(['signup', 'reset', 'change']) }), body);
    return this.codes.request(b.email, b.purpose, String(req.ip || ''));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() body: unknown) {
    const b = parse(z.object({ email: zEmail, code: z.string().trim().min(1, 'Enter the code').max(12), password: zPassword }), body);
    return this.auth.resetPassword(b.email, b.code, b.password);
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

  /** Change email: the code from POST auth/email-code (purpose change) sent to the new email. */
  @AnyUser()
  @AllowExpired()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('email-change')
  changeEmail(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ email: zEmail, code: z.string().trim().min(1, 'Enter the code').max(12) }), body);
    return this.auth.changeEmail(u, b.email, b.code);
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

  /** Delete my account (owner: the whole shop and its records). Needs the password. */
  @AnyUser()
  @AllowExpired()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  @Post('delete-account')
  deleteAccount(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ password: z.string().min(1, 'Enter your password'), confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }) }), body);
    return this.auth.deleteAccount(u, b.password);
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
