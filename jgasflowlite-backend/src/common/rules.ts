import { z } from 'zod';

/** Same input rules as the mobile app (lib/core/validators.dart). */

export const normPhone = (p: string) => {
  let d = p.replace(/[^0-9]/g, '');
  if (d.startsWith('92') && d.length === 12) d = `0${d.slice(2)}`;
  return d;
};

export const zPhone = z
  .string()
  .trim()
  .refine((v) => /^[0-9+\- ]+$/.test(v), 'Enter a valid phone number')
  .refine((v) => {
    const n = v.replace(/[^0-9]/g, '').length;
    return n >= 10 && n <= 13;
  }, 'Enter a valid phone number');

export const zPhoneOpt = z
  .string()
  .trim()
  .max(30)
  .optional()
  .default('')
  .refine((v) => v === '' || (/^[0-9+\- ]+$/.test(v) && v.replace(/[^0-9]/g, '').length >= 10 && v.replace(/[^0-9]/g, '').length <= 13), 'Enter a valid phone number');

const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

export const zPersonName = z
  .string()
  .transform(clean)
  .refine((v) => v.length >= 2 && v.length <= 50, 'Name must be 2 to 50 letters')
  .refine((v) => /^[\p{L} .'\-]+$/u.test(v), 'Use letters only');

export const zBusinessName = z
  .string()
  .transform(clean)
  .refine((v) => v.length >= 2 && v.length <= 50, 'Name must be 2 to 50 characters')
  .refine((v) => /^[\p{L}\p{N} .,&'\-()/#]+$/u.test(v) && /\p{L}/u.test(v), 'Use letters, numbers and . , & \' - ( ) / # only');

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
export const zMoney = z.coerce.number().min(0).max(999999999);
export const zMoneySigned = z.coerce.number().min(-999999999).max(999999999);
export const zQty = z.coerce.number().int().min(0).max(100000);
export const zMethod = z.enum(['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque']).default('cash');
export const zUid = z.string().trim().min(8).max(64);
