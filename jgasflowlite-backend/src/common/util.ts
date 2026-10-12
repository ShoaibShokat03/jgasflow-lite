import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { z, ZodTypeAny } from 'zod';
import { ENV } from '../config/env';

export { z };

/** Validate a request body/query with zod; the first problem becomes a 400. */
export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue.path.join('.');
    throw new BadRequestException(field ? `${field}: ${issue.message}` : issue.message);
  }
  return r.data;
}

/** 32 hex chars, same format as the mobile app's lower(hex(randomblob(16))). */
export const newUid = () => randomBytes(16).toString('hex');

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock parts in the shop timezone (dates are stored as local text like the app). */
function zoned(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ENV.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') };
}

/** 'yyyy-MM-dd HH:mm:ss' in the shop timezone, the format the mobile app stores. */
export function toDb(d: Date = new Date()): string {
  const z = zoned(d);
  return `${z.y}-${pad(z.m)}-${pad(z.d)} ${pad(z.h)}:${pad(z.mi)}:${pad(z.s)}`;
}

export const todayKey = () => toDb().slice(0, 10);

/** Day key n days from a 'yyyy-MM-dd' key. */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Accepts 'yyyy-MM-dd' or 'yyyy-MM-dd HH:mm[:ss]'; returns db text or null. */
export function normDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} ${toDb().slice(11)}`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 19);
  return null;
}

export const docNo = (prefix: string, n: number | null | undefined) =>
  n ? `${prefix}-${String(n).padStart(5, '0')}` : `${prefix}-new`;

/** Digits-only phone used for login matching (0300-1234567 == 03001234567). */
export const phoneKey = (p: string) => p.replace(/[^0-9]/g, '');
