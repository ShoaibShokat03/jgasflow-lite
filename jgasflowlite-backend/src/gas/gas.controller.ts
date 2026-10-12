import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { parse, z } from '../common/util';
import { zBusinessName, zMethod, zMoney, zMoneySigned, zPhoneOpt, zQty, zText, zUid } from '../common/rules';
import { AuthUser, CurrentUser, Roles, tid } from '../auth/auth.decorators';
import { GasService } from './gas.service';

const MGR = ['owner', 'manager'] as const;

const zType = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  kg: z.coerce.number().min(0).max(1000).default(0),
  price: zMoney.default(0),
  wholesale_price: zMoney.default(0),
  purchase_price: zMoney.default(0),
  deposit: zMoney.default(0),
  low_level: zQty.default(5),
  sort: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
  full_qty: zQty.optional(),
  empty_qty: zQty.optional(),
});

const zParty = z.object({
  name: zBusinessName,
  phone: zPhoneOpt,
  address: zText(255),
  type: z.enum(['retail', 'wholesale']).optional().default('retail'),
  opening_balance: zMoneySigned.default(0),
  note: zText(1000),
});

const zDateOpt = z.string().trim().max(19).optional();

const zSale = z.object({
  customer_uid: zUid.nullable().optional(),
  date: zDateOpt,
  lines: z.array(z.object({ type_uid: zUid, qty: zQty.default(0), empty: zQty.default(0), price: zMoney.default(0) })).min(1).max(50),
  charge_deposit: z.boolean().default(false),
  discount: zMoney.default(0),
  paid: zMoney.default(0),
  method: zMethod,
  note: zText(500),
});

const zPurchase = z.object({
  supplier_uid: zUid.nullable().optional(),
  date: zDateOpt,
  lines: z.array(z.object({ type_uid: zUid, qty: zQty.default(0), empty_sent: zQty.default(0), price: zMoney.default(0) })).min(1).max(50),
  paid: zMoney.default(0),
  method: zMethod,
  note: zText(500),
  update_prices: z.boolean().default(true),
});

const zPay = (key: 'customer_uid' | 'supplier_uid') =>
  z.object({ [key]: zUid, amount: zMoney.refine((v) => v > 0, 'Enter an amount'), date: zDateOpt, method: zMethod, note: zText(500) }) as z.ZodObject<any>;

const zRange = z.object({ from: z.string().optional(), to: z.string().optional(), q: z.string().max(80).optional().default(''), customer: z.string().optional(), supplier: z.string().optional(), type: z.string().optional(), filter: z.string().optional(), all: z.string().optional(), limit: z.coerce.number().optional() });

@Controller()
export class GasController {
  constructor(private readonly gas: GasService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser) {
    return this.gas.dashboard(tid(u));
  }

  @Roles(...MGR)
  @Get('reports/summary')
  report(@CurrentUser() u: AuthUser, @Query() query: unknown) {
    const p = parse(zRange, query);
    return this.gas.report(tid(u), p.from, p.to);
  }

  // ── types / stock / prices
  @Get('types')
  types(@CurrentUser() u: AuthUser, @Query('all') all?: string) {
    return this.gas.types(tid(u), all === '1');
  }

  @Roles(...MGR)
  @Post('types')
  createType(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.gas.saveType(u, parse(zType, body));
  }

  @Roles(...MGR)
  @Put('types/:uid')
  updateType(@CurrentUser() u: AuthUser, @Param('uid') uid: string, @Body() body: unknown) {
    return this.gas.saveType(u, parse(zType, body), uid);
  }

  @Roles(...MGR)
  @Delete('types/:uid')
  deleteType(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.deleteType(u, uid);
  }

  @Roles(...MGR)
  @Post('types/:uid/stock')
  setStock(@CurrentUser() u: AuthUser, @Param('uid') uid: string, @Body() body: unknown) {
    const b = parse(z.object({ full: zQty, empty: zQty, note: zText(60) }), body);
    return this.gas.setStock(u, uid, b.full, b.empty, b.note);
  }

  @Roles(...MGR)
  @Post('types/:uid/prices')
  setPrices(@CurrentUser() u: AuthUser, @Param('uid') uid: string, @Body() body: unknown) {
    const b = parse(z.object({ sale: zMoney.optional(), wholesale: zMoney.optional(), purchase: zMoney.optional(), note: zText(255), date: zDateOpt }), body);
    return this.gas.setPrices(u, uid, b);
  }

  @Roles(...MGR)
  @Get('stock/moves')
  moves(@CurrentUser() u: AuthUser, @Query('type') type?: string) {
    return this.gas.stockMoves(tid(u), type || undefined);
  }

  @Get('prices/history')
  priceHistory(@CurrentUser() u: AuthUser, @Query('type') type?: string) {
    return this.gas.priceHistory(tid(u), type || undefined);
  }

  @Get('prices/customers')
  customerPriceList(@CurrentUser() u: AuthUser) {
    return this.gas.allCustomerPrices(tid(u));
  }

  // ── customers
  @Get('customers')
  customers(@CurrentUser() u: AuthUser, @Query() query: unknown) {
    const p = parse(zRange, query);
    return this.gas.customers(tid(u), p.q, p.filter || 'all');
  }

  @Get('customers/:uid')
  customer(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.customer(tid(u), uid);
  }

  @Get('customers/:uid/ledger')
  ledger(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.ledger(tid(u), uid);
  }

  @Post('customers')
  createCustomer(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.gas.saveCustomer(u, parse(zParty, body));
  }

  @Put('customers/:uid')
  updateCustomer(@CurrentUser() u: AuthUser, @Param('uid') uid: string, @Body() body: unknown) {
    return this.gas.saveCustomer(u, parse(zParty, body), uid);
  }

  @Roles(...MGR)
  @Delete('customers/:uid')
  deleteCustomer(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.deleteCustomer(u, uid);
  }

  @Roles(...MGR)
  @Put('customers/:uid/prices')
  setCustomerPrice(@CurrentUser() u: AuthUser, @Param('uid') uid: string, @Body() body: unknown) {
    const b = parse(z.object({ type_uid: zUid, price: zMoney.nullable() }), body);
    return this.gas.setCustomerPrice(u, uid, b.type_uid, b.price);
  }

  @Roles(...MGR)
  @Put('customers/:uid/held')
  setHeld(@CurrentUser() u: AuthUser, @Param('uid') uid: string, @Body() body: unknown) {
    const b = parse(z.object({ type_uid: zUid, qty: z.coerce.number().int().min(0).max(100000), deposit: zMoney.default(0) }), body);
    return this.gas.setHeld(u, uid, b.type_uid, b.qty, b.deposit);
  }

  @Post('customers/:uid/returns')
  returnCylinders(@CurrentUser() u: AuthUser, @Param('uid') uid: string, @Body() body: unknown) {
    const b = parse(z.object({ type_uid: zUid, qty: zQty.refine((v) => v > 0, 'Enter quantity'), refund: zMoney.default(0), note: zText(500) }), body);
    return this.gas.returnCylinders(u, uid, b.type_uid, b.qty, b.refund, b.note);
  }

  // ── sales
  @Get('sales')
  sales(@CurrentUser() u: AuthUser, @Query() query: unknown) {
    const p = parse(zRange, query);
    return this.gas.sales(tid(u), p.from, p.to, p.q, p.limit ?? 500, p.customer || undefined);
  }

  @Get('sales/:uid')
  sale(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.sale(tid(u), uid);
  }

  @Post('sales')
  createSale(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.gas.createSale(u, parse(zSale, body));
  }

  @Roles(...MGR)
  @Delete('sales/:uid')
  deleteSale(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.deleteSale(u, uid);
  }

  // ── payments
  @Get('payments')
  payments(@CurrentUser() u: AuthUser, @Query() query: unknown) {
    const p = parse(zRange, query);
    return this.gas.payments(tid(u), p.from, p.to, p.customer || undefined);
  }

  @Get('payments/:uid')
  payment(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.payment(tid(u), uid);
  }

  @Post('payments')
  addPayment(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.gas.addPayment(u, parse(zPay('customer_uid'), body) as any);
  }

  @Roles(...MGR)
  @Delete('payments/:uid')
  deletePayment(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.deletePayment(u, uid);
  }

  // ── suppliers / purchases
  @Roles(...MGR)
  @Get('suppliers')
  suppliers(@CurrentUser() u: AuthUser, @Query('q') q = '') {
    return this.gas.suppliers(tid(u), q);
  }

  @Roles(...MGR)
  @Get('suppliers/:uid')
  supplier(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.supplier(tid(u), uid);
  }

  @Roles(...MGR)
  @Get('suppliers/:uid/ledger')
  supplierLedger(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.supplierLedger(tid(u), uid);
  }

  @Roles(...MGR)
  @Post('suppliers')
  createSupplier(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.gas.saveSupplier(u, parse(zParty, body));
  }

  @Roles(...MGR)
  @Put('suppliers/:uid')
  updateSupplier(@CurrentUser() u: AuthUser, @Param('uid') uid: string, @Body() body: unknown) {
    return this.gas.saveSupplier(u, parse(zParty, body), uid);
  }

  @Roles(...MGR)
  @Delete('suppliers/:uid')
  deleteSupplier(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.deleteSupplier(u, uid);
  }

  @Roles(...MGR)
  @Post('supplier-payments')
  addSupplierPayment(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.gas.addSupplierPayment(u, parse(zPay('supplier_uid'), body) as any);
  }

  @Roles(...MGR)
  @Delete('supplier-payments/:uid')
  deleteSupplierPayment(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.deleteSupplierPayment(u, uid);
  }

  @Roles(...MGR)
  @Get('purchases')
  purchases(@CurrentUser() u: AuthUser, @Query() query: unknown) {
    const p = parse(zRange, query);
    return this.gas.purchases(tid(u), p.from, p.to, p.supplier || undefined);
  }

  @Roles(...MGR)
  @Get('purchases/:uid')
  purchase(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.purchase(tid(u), uid);
  }

  @Roles(...MGR)
  @Post('purchases')
  createPurchase(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.gas.createPurchase(u, parse(zPurchase, body));
  }

  @Roles(...MGR)
  @Delete('purchases/:uid')
  deletePurchase(@CurrentUser() u: AuthUser, @Param('uid') uid: string) {
    return this.gas.deletePurchase(u, uid);
  }
}
