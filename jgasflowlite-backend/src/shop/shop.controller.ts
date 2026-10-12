import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Db } from '../db/db.service';
import { parse, z } from '../common/util';
import { normPhone, zBusinessName, zEmailOpt, zPassword, zPersonName, zPhone, zPhoneOpt, zText } from '../common/rules';
import { AuthUser, CurrentUser, Roles, tid } from '../auth/auth.decorators';
import { AuthService, SHOP_FIELDS, shopOut } from '../auth/auth.service';

const zStaff = z.object({
  name: zPersonName,
  phone: zPhoneOpt,
  email: zEmailOpt,
  role: z.enum(['manager', 'salesman']),
  password: zPassword.optional(),
  active: z.boolean().optional().default(true),
});

@Controller()
export class ShopController {
  constructor(
    private readonly db: Db,
    private readonly auth: AuthService,
  ) {}

  @Get('shop')
  async shop(@CurrentUser() u: AuthUser) {
    return shopOut(await this.db.one(`SELECT ${SHOP_FIELDS} FROM tenants WHERE id = ?`, [tid(u)]));
  }

  @Roles('owner', 'manager')
  @Put('shop')
  async updateShop(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(
      z.object({
        name: zBusinessName,
        owner_name: zPersonName,
        phone: zPhone,
        address: zText(255),
        currency: z.string().trim().min(1).max(10).default('Rs'),
        receipt_note: zText(255),
      }),
      body,
    );
    await this.db.run('UPDATE tenants SET name = ?, owner_name = ?, phone = ?, address = ?, currency = ?, receipt_note = ?, profile_updated_at = ? WHERE id = ?', [
      b.name,
      b.owner_name,
      b.phone,
      b.address,
      b.currency,
      b.receipt_note,
      Date.now(),
      tid(u),
    ]);
    return this.shop(u);
  }

  // ───── team (owner only)

  @Roles('owner')
  @Get('team')
  async team(@CurrentUser() u: AuthUser) {
    const users = await this.db.all<any>(
      `SELECT u.id, u.name, u.phone, u.email, u.role, u.active, u.last_login_at, u.created_at,
         (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
         (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked = 0 AND s.expires_at > NOW()) AS devices
       FROM users u WHERE u.tenant_id = ? ORDER BY FIELD(u.role, 'owner', 'manager', 'salesman'), u.name`,
      [tid(u)],
    );
    return { users: users.map((x) => ({ ...x, active: !!x.active, devices: Number(x.devices), me: x.id === u.id })), limit: u.sub?.users_limit ?? 0 };
  }

  private async assertSeat(u: AuthUser) {
    const r = await this.db.one<any>('SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND active = 1', [tid(u)]);
    const limit = u.sub?.users_limit ?? 0;
    if (Number(r?.n ?? 0) >= limit) throw new ForbiddenException(`Your plan allows ${limit} users. Upgrade the plan to add more.`);
  }

  @Roles('owner')
  @Post('team')
  async addStaff(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(zStaff, body);
    if (!b.phone && !b.email) throw new BadRequestException('Enter a phone number or email for login');
    if (!b.password) throw new BadRequestException('Set a password for this person');
    if (b.active) await this.assertSeat(u);
    const phone = b.phone ? normPhone(b.phone) : null;
    await this.auth.assertFree(this.db, phone, b.email || null);
    const r = await this.db.run('INSERT INTO users (tenant_id, name, phone, email, password_hash, role, active) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      tid(u),
      b.name,
      phone,
      b.email || null,
      await bcrypt.hash(b.password, 10),
      b.role,
      b.active ? 1 : 0,
    ]);
    return { id: r.insertId };
  }

  private async staff(u: AuthUser, id: number) {
    const s = await this.db.one<any>('SELECT * FROM users WHERE id = ? AND tenant_id = ?', [id, tid(u)]);
    if (!s) throw new NotFoundException('User not found');
    if (s.role === 'owner') throw new ForbiddenException('The owner account is changed from My account');
    return s;
  }

  @Roles('owner')
  @Put('team/:id')
  async updateStaff(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const s = await this.staff(u, id);
    const b = parse(zStaff, body);
    if (!b.phone && !b.email) throw new BadRequestException('Enter a phone number or email for login');
    if (b.active && !s.active) await this.assertSeat(u);
    const phone = b.phone ? normPhone(b.phone) : null;
    await this.auth.assertFree(this.db, phone, b.email || null, id);
    await this.db.run('UPDATE users SET name = ?, phone = ?, email = ?, role = ?, active = ? WHERE id = ?', [b.name, phone, b.email || null, b.role, b.active ? 1 : 0, id]);
    if (b.password) await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(b.password, 10), id]);
    // Role, password or access changed: sign the person out everywhere.
    if (b.password || !b.active || b.role !== s.role) await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [id]);
    return { ok: true };
  }

  @Roles('owner')
  @Delete('team/:id')
  async removeStaff(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.staff(u, id);
    // Records keep the person's id, so the account is turned off rather than erased.
    await this.db.run('UPDATE users SET active = 0 WHERE id = ?', [id]);
    await this.db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [id]);
    return { ok: true };
  }
}
