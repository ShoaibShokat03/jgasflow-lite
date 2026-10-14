import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, normalize, sep } from 'path';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

/**
 * Screenshots shops attach to payment proofs and support messages.
 *
 * Files never become public: they are written outside any web root under
 * UPLOAD_DIR (default ./uploads) and only streamed back by endpoints that
 * check the shop or the console permission. Only real images are kept,
 * recognised by their first bytes, not by the name the browser sent.
 */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 3;

/** Multer options for `FilesInterceptor('files', MAX_IMAGES, IMAGE_UPLOAD)`. */
export const IMAGE_UPLOAD = { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES } };

const KINDS: { ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', type: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', type: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', type: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];
const TYPE_OF: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.ext, k.type]));

/** Saves up to MAX_IMAGES screenshots; returns their stored keys (relative paths). */
export function saveImages(files: Express.Multer.File[] | undefined, area: 'payments' | 'support', tenantId: number): string[] {
  const list = (files ?? []).filter((f) => f?.buffer?.length);
  if (list.length > MAX_IMAGES) throw new BadRequestException(`Attach up to ${MAX_IMAGES} screenshots`);
  const kinds = list.map((f) => {
    const k = KINDS.find((x) => x.test(f.buffer));
    if (!k) throw new BadRequestException('Screenshots must be JPG, PNG or WebP pictures');
    return k;
  });
  const dir = join(UPLOAD_ROOT, area, String(tenantId));
  if (list.length) mkdirSync(dir, { recursive: true });
  return list.map((f, i) => {
    const name = `${Date.now()}-${randomBytes(9).toString('hex')}.${kinds[i].ext}`;
    writeFileSync(join(dir, name), f.buffer);
    return `${area}/${tenantId}/${name}`;
  });
}

/** Stored keys from a TEXT column (JSON array). */
export const fileKeys = (v: unknown): string[] => {
  try {
    const a = JSON.parse(String(v ?? '[]'));
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
};

/** Streams one stored screenshot. The caller has already checked who may see it. */
export function sendImage(res: Response, key: string | undefined) {
  if (!key) throw new NotFoundException('Picture not found');
  const full = normalize(join(UPLOAD_ROOT, key));
  if (!full.startsWith(normalize(UPLOAD_ROOT) + sep) || !existsSync(full)) throw new NotFoundException('Picture not found');
  const ext = full.split('.').pop() ?? '';
  res.setHeader('Content-Type', TYPE_OF[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.end(readFileSync(full));
}
