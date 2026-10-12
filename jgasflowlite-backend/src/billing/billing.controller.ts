import { Body, Controller, Get, Post } from '@nestjs/common';
import { parse, z } from '../common/util';
import { zText } from '../common/rules';
import { AllowExpired, AuthUser, CurrentUser, Public, Roles, tid } from '../auth/auth.decorators';
import { ENV } from '../config/env';
import { publicPlans } from './plans';
import { PlatformConfig } from '../platform/platform-config.service';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly config: PlatformConfig,
  ) {}

  /** Plans and prices for the public website. */
  @Public()
  @Get('plans')
  plans() {
    const days = this.config.trialDays();
    return { trial_days: days, plans: publicPlans(days) };
  }

  @Roles('owner')
  @Get()
  overview(@CurrentUser() u: AuthUser) {
    return this.billing.overview(tid(u));
  }

  @Roles('owner')
  @AllowExpired()
  @Post('requests')
  request(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(
      z.object({
        plan: z.string(),
        months: z.coerce.number().int().refine((m) => [1, 3, 6, 12].includes(m), 'Choose 1, 3, 6 or 12 months'),
        method: z.enum(['jazzcash', 'easypaisa', 'bank']),
        txn_ref: z.string().trim().min(4, 'Enter the transaction ID').max(80),
        note: zText(255),
      }),
      body,
    );
    return this.billing.request(tid(u), u.id, b);
  }
}
