import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { parse, z } from '../common/util';
import { zBusinessName, zEmailOpt, zPassword, zPersonName, zPhone, zPhoneOpt, zText } from '../common/rules';
import { AdminPerm, AuthUser, CurrentUser, Public, SuperAdmin } from '../auth/auth.decorators';
import { PLAN } from '../billing/plans';
import { ADMIN_MODULES, adminCan, isSuperAdmin } from './admin-modules';
import { PlatformConfig } from './platform-config.service';
import { PlatformService } from './platform.service';

const zPlanKey = z.string().refine((k) => !!PLAN[k], 'Unknown plan');
const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31');

/** The JGasFlow platform console API (`/api/platform/*`). */
@SuperAdmin()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly svc: PlatformService,
    private readonly config: PlatformConfig,
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
        method: z.enum(['jazzcash', 'easypaisa', 'bank', 'cash', 'other']),
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
      }),
      body,
    );
    return { ...b, key: key ?? b.key ?? '' };
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
    return this.config.all();
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
        pay_jazzcash: s,
        pay_easypaisa: s,
        pay_bank: s,
        trial_days: z.coerce.number().int().min(1).max(90).transform(String).optional(),
        shop_app_url: z.string().trim().url('Enter the full address, like https://app.jgasflow.com').optional(),
      }),
      body,
    );
    return this.config.saveSettings(b as any, u.id);
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
