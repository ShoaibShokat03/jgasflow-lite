import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { parse, z } from '../common/util';
import { MAX_AMOUNT, zMoney, zText } from '../common/rules';
import { AuthUser, CurrentUser, OnlineOnly, Roles, tid } from '../auth/auth.decorators';
import { AccountsService } from './accounts.service';
import { METHODS, MoneyService } from './money.service';

const MGR = ['owner', 'manager'] as const;
const zDayOpt = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const zRange = z.object({ from: zDayOpt, to: zDayOpt, kind: z.string().max(20).optional(), limit: z.coerce.number().optional() });
const zCode = z.string().trim().regex(/^\d{4}$/, 'Choose an account');

const zVoucher = z.object({
  kind: z.enum(['expense', 'income', 'capital', 'drawing', 'transfer', 'opening', 'journal', 'loan_taken', 'loan_repaid', 'loan_given', 'loan_back']),
  date: zDayOpt,
  amount: zMoney.refine((v) => v > 0, 'Enter an amount'),
  account: zCode.optional(),
  money: zCode.optional(),
  money_id: z.coerce.number().int().positive().optional(),
  to_id: z.coerce.number().int().positive().optional(),
  from: zCode.optional(),
  to: zCode.optional(),
  party: zText(120),
  note: zText(200),
});

/** Double-entry accounts: chart, reports and accounting-only entries. */
@OnlineOnly()
@Roles(...MGR)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly acc: AccountsService,
    private readonly money: MoneyService,
  ) {}

  // ── cash drawers, banks and wallets
  @Get('money')
  moneyList(@CurrentUser() u: AuthUser) {
    return this.money.list(tid(u));
  }

  private moneyBody(body: unknown) {
    return parse(
      z.object({
        name: z.string().trim().min(2, 'Enter a name').max(120),
        kind: z.enum(['cash', 'bank']),
        title: zText(120),
        number: zText(60),
        branch: zText(120),
        opening_balance: z.coerce.number().min(0, 'Opening balance cannot be below zero').max(MAX_AMOUNT, 'An amount cannot be more than Rs 1,00,00,000').default(0),
        opening_date: zDayOpt,
        methods: z.array(z.enum(METHODS)).max(5).default([]),
      }),
      body,
    );
  }

  @Post('money')
  moneyAdd(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.money.save(tid(u), this.moneyBody(body));
  }

  @Put('money/:id')
  moneyUpdate(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.money.save(tid(u), this.moneyBody(body), id);
  }

  @Delete('money/:id')
  moneyDelete(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.money.remove(tid(u), id);
  }

  @Get('money/:id/statement')
  moneyStatement(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Query() q: unknown) {
    const p = parse(zRange, q);
    return this.money.statement(tid(u), id, p.from, p.to);
  }

  @Get('chart')
  chart(@CurrentUser() u: AuthUser) {
    return this.acc.accounts(tid(u));
  }

  @Post('chart')
  addAccount(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().trim().min(2, 'Enter a name').max(160), type: z.enum(['asset', 'liability', 'income', 'expense', 'equity']) }), body);
    return this.acc.addAccount(tid(u), b);
  }

  @Put('chart/:code')
  updateAccount(@CurrentUser() u: AuthUser, @Param('code') code: string, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().trim().min(2).max(160).optional(), active: z.boolean().optional() }), body);
    return this.acc.updateAccount(tid(u), code, b);
  }

  @Get('summary')
  summary(@CurrentUser() u: AuthUser, @Query() q: unknown) {
    const p = parse(zRange, q);
    return this.acc.summary(tid(u), p.from, p.to);
  }

  @Get('profit-loss')
  profitLoss(@CurrentUser() u: AuthUser, @Query() q: unknown) {
    const p = parse(zRange, q);
    return this.acc.profitLoss(tid(u), p.from, p.to);
  }

  @Get('balance-sheet')
  balanceSheet(@CurrentUser() u: AuthUser, @Query() q: unknown) {
    return this.acc.balanceSheet(tid(u), parse(zRange, q).to);
  }

  @Get('trial-balance')
  trialBalance(@CurrentUser() u: AuthUser, @Query() q: unknown) {
    return this.acc.trialBalance(tid(u), parse(zRange, q).to);
  }

  @Get('ledger/:code')
  ledger(@CurrentUser() u: AuthUser, @Param('code') code: string, @Query() q: unknown) {
    const p = parse(zRange, q);
    return this.acc.ledger(tid(u), code, p.from, p.to);
  }

  @Get('journal')
  journal(@CurrentUser() u: AuthUser, @Query() q: unknown) {
    const p = parse(zRange, q);
    return this.acc.journalLines(tid(u), p.from, p.to, p.limit);
  }

  @Get('loans')
  loans(@CurrentUser() u: AuthUser) {
    return this.acc.loans(tid(u));
  }

  @Get('vouchers')
  vouchers(@CurrentUser() u: AuthUser, @Query() q: unknown) {
    const p = parse(zRange, q);
    return this.acc.vouchers(tid(u), p.from, p.to, p.kind);
  }

  private body(u: AuthUser, body: unknown) {
    const b = parse(zVoucher, body);
    if (b.kind === 'journal' && u.role !== 'owner') throw new ForbiddenException('Only the owner can make journal entries');
    return { ...b, date: b.date ?? '' };
  }

  @Post('vouchers')
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.acc.saveVoucher(tid(u), u.id, this.body(u, body));
  }

  @Put('vouchers/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.acc.saveVoucher(tid(u), u.id, this.body(u, body), id);
  }

  @Delete('vouchers/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.acc.deleteVoucher(tid(u), id);
  }
}
