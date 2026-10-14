import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BillingService } from '../billing/billing.service';
import { parse, z } from '../common/util';
import { zBusinessName, zEmailOpt, zPassword, zPersonName, zPhone, zPhoneOpt, zText } from '../common/rules';
import { AdminPerm, AuthUser, CurrentUser, Public, SuperAdmin } from '../auth/auth.decorators';
import { PLAN } from '../billing/plans';
import { ADMIN_MODULES, adminCan, isSuperAdmin } from './admin-modules';
import { PlatformConfig } from './platform-config.service';
import { PlatformService } from './platform.service';
import { MailService } from './mail.service';

const zPlanKey = z.string().refine((k) => !!PLAN[k], 'Unknown plan');
const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31');

/** The JGasFlow platform console API (`/api/platform/*`). */
@SuperAdmin()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly svc: PlatformService,
    private readonly config: PlatformConfig,
    private readonly billing: BillingService,
    private readonly mail: MailService,
  ) {}

  /** Who am I in the console, and what may I open. */
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    const modules = [...ADMIN_MODULES.map((m) => m.key), 'admins'].filter((m) => adminCan(u, m));
    return { id: u.id, name: u.name, role: isSuperAdmin(u) ? 'super_admin' : 'admin', modules, catalog: ADMIN_MODULES };
  }

  @AdminPerm('overview')
  @Get('overview')
  overview() {
    return this.svc.overview();
  }

  // ───── shops
  @AdminPerm('shops')
  @Get('shops')
  shops(@Query() q: any) {
    return this.svc.shops(q);
  }

  @AdminPerm('shops')
  @Get('shops/:id')
  shop(@Param('id', ParseIntPipe) id: number) {
    return this.svc.shop(id);
  }

  @AdminPerm('shops')
  @Put('shops/:id')
  updateShop(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ name: zBusinessName, owner_name: zPersonName, phone: zPhone, address: zText(255) }), body);
    return this.svc.updateShop(id, b, u.id);
  }

  @AdminPerm('shops')
  @HttpCode(200)
  @Post('shops/:id/extend')
  extend(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ plan: zPlanKey, months: z.coerce.number().int().min(1).max(36), note: zText(200) }), body);
    return this.svc.extend(id, b.plan, b.months, b.note, u.id);
  }

  @AdminPerm('shops')
  @HttpCode(200)
  @Post('shops/:id/expiry')
  expiry(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ plan: zPlanKey, until: zDay, note: zText(200) }), body);
    return this.svc.setExpiry(id, b.plan, b.until, b.note, u.id);
  }

  @AdminPerm('shops')
  @HttpCode(200)
  @Post('shops/:id/status')
  status(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ status: z.enum(['active', 'suspended']), note: zText(200) }), body);
    return this.svc.setStatus(id, b.status, b.note, u.id);
  }

  @AdminPerm('shops')
  @HttpCode(200)
  @Post('shops/:id/note')
  note(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.svc.setNote(id, parse(z.object({ note: zText(2000) }), body).note);
  }

  @AdminPerm('shops')
  @HttpCode(200)
  @Post('shops/:id/impersonate')
  impersonate(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.impersonate(id, u);
  }

  @AdminPerm('shops')
  @HttpCode(200)
  @Post('users/:id/password')
  password(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.svc.resetPassword(id, parse(z.object({ password: zPassword }), body).password, u.id);
  }

  @AdminPerm('shops')
  @HttpCode(200)
  @Post('users/:id/logout')
  logout(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.logoutUser(id, u.id);
  }

  // ───── payments
  @AdminPerm('payments')
  @Get('payments')
  payments(@Query() q: any) {
    return this.svc.payments(q);
  }

  /** A screenshot a shop attached to its payment. */
  @AdminPerm('payments')
  @Get('payments/:id/proof/:n')
  proof(@Param('id', ParseIntPipe) id: number, @Param('n', ParseIntPipe) n: number, @Res() res: Response) {
    return this.billing.sendProof(res, id, n);
  }

  @AdminPerm('payments')
  @HttpCode(200)
  @Post('payments')
  record(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(
      z.object({
        shop_id: z.coerce.number().int().min(1),
        plan: zPlanKey,
        months: z.coerce.number().int().min(1).max(36),
        amount: z.coerce.number().min(0).max(10000000).optional(),
        method: z.enum(['bank', 'cash', 'other']),
        txn_ref: zText(80),
        note: zText(255),
      }),
      body,
    );
    return this.svc.recordPayment(b, u.id);
  }

  @AdminPerm('payments')
  @HttpCode(200)
  @Post('payments/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.svc.approve(id, parse(z.object({ note: zText(200) }), body).note, u.id);
  }

  @AdminPerm('payments')
  @HttpCode(200)
  @Post('payments/:id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const b = parse(z.object({ note: z.string().trim().min(3, 'Write a reason for the shop').max(200) }), body);
    return this.svc.reject(id, b.note, u.id);
  }

  // ───── plans
  @AdminPerm('plans')
  @Get('plans')
  plans() {
    return this.config.plansWithUsage();
  }

  private planBody(body: unknown, key?: string) {
    const b = parse(
      z.object({
        key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,19}$/, 'Key: small letters, numbers and _ only').optional(),
        name: z.string().trim().min(2).max(60),
        price: z.coerce.number().int().min(0).max(1000000),
        users: z.coerce.number().int().min(1).max(500),
        features: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
        is_active: z.boolean().default(true),
        sort: z.coerce.number().int().min(0).max(999).default(0),
        mode: z.enum(['offline', 'online']).optional(),
      }),
      body,
    );
    // An update without a type keeps the plan's type; a new plan is Online unless chosen.
    const mode = b.mode ?? (key && PLAN[key]?.mode !== 'any' ? PLAN[key]?.mode : undefined) ?? 'online';
    return { ...b, mode, key: key ?? b.key ?? '' };
  }

  @AdminPerm('plans')
  @Post('plans')
  createPlan(@Body() body: unknown) {
    const p = this.planBody(body);
    return this.config.savePlan(p as any, true);
  }

  @AdminPerm('plans')
  @Put('plans/:key')
  updatePlan(@Param('key') key: string, @Body() body: unknown) {
    return this.config.savePlan(this.planBody(body, key) as any, false);
  }

  @AdminPerm('plans')
  @Delete('plans/:key')
  deletePlan(@Param('key') key: string) {
    return this.config.deletePlan(key);
  }

  // ───── reports & activity
  @AdminPerm('reports')
  @Get('reports')
  report(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.report(from, to);
  }

  @AdminPerm('activity')
  @Get('events')
  events(@Query('shop_id') shopId?: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    return this.svc.recentEvents(Number(limit) || 50, Number(shopId) || undefined, Number(before) || undefined);
  }

  // ───── platform settings
  @AdminPerm('settings')
  @Get('settings')
  settings() {
    return this.config.forConsole();
  }

  @AdminPerm('settings')
  @Put('settings')
  saveSettings(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const s = z.string().trim().max(300).optional();
    const b = parse(
      z.object({
        support_company: s,
        support_phone: s,
        support_whatsapp: z.string().trim().regex(/^\d{10,15}$/, 'WhatsApp number in digits, like 923001234567').optional(),
        support_email: zEmailOpt.optional(),
        support_hours: s,
        bank_name: s,
        bank_title: s,
        bank_account: z.string().trim().max(40).optional(),
        bank_iban: z
          .string()
          .trim()
          .toUpperCase()
          .transform((v) => v.replace(/\s+/g, ''))
          .refine((v) => v === '' || /^PK\d{2}[A-Z]{4}\d{16}$/.test(v), 'IBAN looks like PK36MEZN0001234567890123')
          .optional(),
        bank_branch: s,
        trial_days: z.coerce.number().int().min(1).max(90).transform(String).optional(),
        shop_app_url: z.string().trim().url('Enter the full address, like https://app.jgasflow.com').optional(),
        smtp_host: z
          .string()
          .trim()
          .max(160)
          .refine((v) => v === '' || /^[a-z0-9.-]+$/i.test(v), 'Server name like smtp.gmail.com')
          .optional(),
        smtp_port: z.coerce.number().int().min(1, 'Port 1 to 65535').max(65535, 'Port 1 to 65535').transform(String).optional(),
        smtp_secure: z.enum(['ssl', 'starttls', 'none']).optional(),
        smtp_user: z.string().trim().max(160).optional(),
        smtp_pass: z.string().max(200).optional(),
        smtp_from_email: zEmailOpt.optional(),
        smtp_from_name: z.string().trim().max(80).optional(),
        signup_email_verify: z.enum(['0', '1']).optional(),
      }),
      body,
    );
    return this.config.saveSettings(b as any, u.id);
  }

  @AdminPerm('settings')
  @HttpCode(200)
  @Post('settings/smtp-clear')
  clearSmtpPass(@CurrentUser() u: AuthUser) {
    return this.config.clearSecret('smtp_pass', u.id);
  }

  /** Sends a test email with the saved SMTP settings. */
  @AdminPerm('settings')
  @HttpCode(200)
  @Post('settings/smtp-test')
  async testSmtp(@Body() body: unknown) {
    const b = parse(z.object({ to: z.string().trim().toLowerCase().max(160).email('Enter a valid email') }), body);
    const m = this.mail.layout('Test email', ['Your JGasFlow email settings work.', 'Sign-up codes and password reset codes will be sent from this address.']);
    await this.mail.send(b.to, 'JGasFlow test email', m.html, m.text);
    return { ok: true };
  }

  // ───── admins (super admin only, checked in the service)
  @AdminPerm('admins')
  @Get('admins')
  admins() {
    return this.svc.admins();
  }

  private adminBody(body: unknown, isNew: boolean) {
    return parse(
      z.object({
        name: zPersonName,
        email: z.string().trim().toLowerCase().email('Enter a valid email'),
        phone: zPhoneOpt,
        role: z.enum(['super_admin', 'admin']),
        modules: z.array(z.string()).nullable().default(null),
        password: isNew ? zPassword : zPassword.optional().or(z.literal('').transform(() => undefined)),
        active: z.boolean().default(true),
      }),
      body,
    );
  }

  @AdminPerm('admins')
  @Post('admins')
  createAdmin(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.svc.saveAdmin(this.adminBody(body, true) as any, u);
  }

  @AdminPerm('admins')
  @Put('admins/:id')
  updateAdmin(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.svc.saveAdmin(this.adminBody(body, false) as any, u, id);
  }

  @AdminPerm('admins')
  @Delete('admins/:id')
  removeAdmin(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.removeAdmin(id, u);
  }
}

/** Support details, payment accounts and trial length for the shop app and website. */
@Controller('public')
export class PublicController {
  constructor(private readonly config: PlatformConfig) {}

  @Public()
  @Get('config')
  config_() {
    return this.config.publicConfig();
  }
}
