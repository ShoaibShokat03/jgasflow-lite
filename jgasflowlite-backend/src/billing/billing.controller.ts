import { Body, Controller, Get, Param, ParseIntPipe, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { parse, z } from '../common/util';
import { zText } from '../common/rules';
import { AllowExpired, AuthUser, CurrentUser, Public, Roles, tid } from '../auth/auth.decorators';
import { ENV } from '../config/env';
import { publicPlans } from './plans';
import { PlatformConfig } from '../platform/platform-config.service';
import { BillingService } from './billing.service';
import { IMAGE_UPLOAD, MAX_IMAGES } from '../common/uploads';

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

  /**
   * Payment proof for a plan: sent as a form with 1 to 3 screenshots of the bank
   * transfer. Plans are paid by bank transfer only.
   */
  @Roles('owner')
  @AllowExpired()
  @Post('requests')
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES, IMAGE_UPLOAD))
  request(@CurrentUser() u: AuthUser, @Body() body: unknown, @UploadedFiles() files: Express.Multer.File[]) {
    const b = parse(
      z.object({
        plan: z.string(),
        // 0 = lifetime (one payment)
        months: z.coerce.number().int().refine((m) => [0, 1, 3, 6, 12].includes(m), 'Choose 1, 3, 6 or 12 months, or Lifetime'),
        txn_ref: z.string().trim().max(80).optional().default(''),
        note: zText(255),
      }),
      body,
    );
    return this.billing.request(tid(u), u.id, { ...b, method: 'bank' }, files);
  }

  /** A screenshot the shop attached to one of its own payments. */
  @Roles('owner')
  @AllowExpired()
  @Get('requests/:id/proof/:n')
  async proof(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('n', ParseIntPipe) n: number, @Res() res: Response) {
    return this.billing.sendProof(res, id, n, tid(u));
  }
}
