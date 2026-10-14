import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { parse, z } from '../common/util';
import { AdminPerm, AllowExpired, AuthUser, CurrentUser, Roles, SuperAdmin, tid } from '../auth/auth.decorators';
import { IMAGE_UPLOAD, MAX_IMAGES } from '../common/uploads';
import { SUPPORT_STATUSES, SUPPORT_TOPICS, SupportService } from './support.service';

const zMessage = z.string().trim().max(3000, 'Keep the message under 3000 characters').optional().default('');

/** Shop side: every shop user can ask for help, even when the plan has ended. */
@Roles('owner', 'manager', 'salesman')
@AllowExpired()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('requests')
  list(@CurrentUser() u: AuthUser) {
    return this.support.list(tid(u));
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('requests')
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES, IMAGE_UPLOAD))
  open(@CurrentUser() u: AuthUser, @Body() body: unknown, @UploadedFiles() files: Express.Multer.File[]) {
    const b = parse(
      z.object({
        subject: z.string().trim().min(3, 'Write a short subject').max(120),
        topic: z.enum(SUPPORT_TOPICS).default('other'),
        message: z.string().trim().min(5, 'Tell us a little more').max(3000, 'Keep the message under 3000 characters'),
      }),
      body,
    );
    return this.support.open(tid(u), u.id, b, files);
  }

  @Get('requests/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.support.get(id, tid(u));
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  @Post('requests/:id/messages')
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES, IMAGE_UPLOAD))
  reply(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown, @UploadedFiles() files: Express.Multer.File[]) {
    const b = parse(z.object({ message: zMessage }), body);
    return this.support.reply(id, tid(u), u.id, false, b.message, files);
  }

  @Get('files/:messageId/:k')
  file(@CurrentUser() u: AuthUser, @Param('messageId', ParseIntPipe) messageId: number, @Param('k', ParseIntPipe) k: number, @Res() res: Response) {
    return this.support.sendFile(res, messageId, k, tid(u));
  }
}

/** Console side: the support inbox. */
@SuperAdmin()
@AdminPerm('support')
@Controller('platform/support')
export class PlatformSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  inbox(@Query() q: any) {
    return this.support.inbox(q);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.support.get(id);
  }

  @HttpCode(200)
  @Post(':id/messages')
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES, IMAGE_UPLOAD))
  reply(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown, @UploadedFiles() files: Express.Multer.File[]) {
    const b = parse(z.object({ message: zMessage, status: z.enum(SUPPORT_STATUSES).optional() }), body);
    return this.support.reply(id, null, u.id, true, b.message, files, b.status);
  }

  @HttpCode(200)
  @Post(':id/status')
  status(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.support.setStatus(id, parse(z.object({ status: z.enum(SUPPORT_STATUSES) }), body).status);
  }

  @Get('files/:messageId/:k')
  file(@Param('messageId', ParseIntPipe) messageId: number, @Param('k', ParseIntPipe) k: number, @Res() res: Response) {
    return this.support.sendFile(res, messageId, k);
  }
}
