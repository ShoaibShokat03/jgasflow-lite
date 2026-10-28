import { z } from 'zod';

/** Same input rules as the mobile app (lib/core/validators.dart). */

export const normPhone = (p: string) => {
  let d = p.replace(/[^0-9]/g, '');
  if (d.startsWith('92') && d.length === 12) d = `0${d.slice(2)}`;
  return d;
};

/** The same character 4 or more times in a row ("KKKK", "1111"): typing, not a name. */
const JUNK_RUN = /(.)\1{3,}/u;

/** A Pakistani number: 10 to 13 digits starting 0 or 92, not 0000000000 or one digit repeated. */
export const phoneLooksReal = (v: string) => {
  const d = v.replace(/[^0-9]/g, '');
  return d.length >= 10 && d.length <= 13 && /^(0|92)/.test(d) && !/^(\d)\1+$/.test(d) && !/(\d)\1{6,}/.test(d);
};

export const zPhone = z
  .string()
  .trim()
  .refine((v) => /^[0-9+\- ]+$/.test(v), 'Enter a valid phone number')
  .refine(phoneLooksReal, 'Enter a real phone number, like 0300 1234567');

export const zPhoneOpt = z
  .string()
  .trim()
  .max(30)
  .optional()
  .default('')
  .refine((v) => v === '' || (/^[0-9+\- ]+$/.test(v) && phoneLooksReal(v)), 'Enter a real phone number, like 0300 1234567');

const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

export const zPersonName = z
  .string()
  .transform(clean)
  .refine((v) => v.length >= 2 && v.length <= 50, 'Name must be 2 to 50 letters')
  .refine((v) => /^[\p{L} .'\-]+$/u.test(v), 'Use letters only')
  .refine((v) => !JUNK_RUN.test(v.replace(/\s/g, '')), 'Write a real name');

export const zBusinessName = z
  .string()
  .transform(clean)
  .refine((v) => v.length >= 2 && v.length <= 50, 'Name must be 2 to 50 characters')
  .refine((v) => /^[\p{L}\p{N} .,&'\-()/#]+$/u.test(v) && /\p{L}/u.test(v), 'Use letters, numbers and . , & \' - ( ) / # only')
  .refine((v) => (v.match(/\p{L}/gu) || []).length >= 2 && !JUNK_RUN.test(v.replace(/\s/g, '')), 'Write a real name');

/** Free text like an address: optional, but not a run of one character. */
export const zPlainText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .default('')
    .refine((v) => !JUNK_RUN.test(v.replace(/\s/g, '')), 'Write real text, not repeated letters');

export const zEmailOpt = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .optional()
  .default('')
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email');

export const zPassword = z.string().min(6, 'Password must be at least 6 characters').max(100);

export const zText = (max = 255) => z.string().trim().max(max).optional().default('');
/** One amount (payment, balance, discount, entry): at most Rs 1 crore. */
export const MAX_AMOUNT = 10000000;
export const zMoney = z.coerce.number().min(0).max(MAX_AMOUNT, 'An amount cannot be more than Rs 1,00,00,000');
/** One cylinder's price or deposit. Nothing an LPG shop sells costs more. */
export const MAX_UNIT_PRICE = 500000;
export const zUnitPrice = z.coerce.number().min(0).max(MAX_UNIT_PRICE, 'A cylinder price cannot be more than Rs 500,000');
export const zMoneySigned = z.coerce.number().min(-MAX_AMOUNT, 'An amount cannot be more than Rs 1,00,00,000').max(MAX_AMOUNT, 'An amount cannot be more than Rs 1,00,00,000');
export const zQty = z.coerce.number().int().min(0).max(100000);
export const zMethod = z.enum(['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque']).default('cash');
export const zUid = z.string().trim().min(8).max(64);
