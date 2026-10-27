import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { ENV } from '../config/env';
import { Db, Q } from '../db/db.service';
import { MailService } from '../platform/mail.service';

/** signup: confirm a new account's email. reset: forgot password. change: confirm a new email for an account. */
export type CodePurpose = 'signup' | 'reset' | 'change';

const CODE_MINUTES = 10;
const RESEND_SECONDS = 60;
const MAX_TRIES = 5;
const MAX_PER_EMAIL_HOUR = 6;
const MAX_PER_IP_HOUR = 20;

const hashCode = (email: string, purpose: string, code: string) => createHash('sha256').update(`${ENV.tokenSecret}:${purpose}:${email}:${code}`).digest('hex');

/**
 * 6-digit codes sent by email: confirm the email on sign-up, and reset a
 * forgotten password. Only a hash is stored; a code works once, for 10 minutes,
 * with 5 tries.
 */
@Injectable()
export class EmailCodesService {
  constructor(
    private readonly db: Db,
    private readonly mail: MailService,
  ) {}

  /** Sends a new code. Returns when the next one may be asked for. */
  async request(rawEmail: string, purpose: CodePurpose, ip = '') {
    const email = rawEmail.trim().toLowerCase();
    if (!this.mail.ready()) throw new BadRequestException('Email is not set up yet. Please contact JGasFlow support.');

    const last = await this.db.one<any>('SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1', [email, purpose]);
    if (last && Number(last.age) < RESEND_SECONDS) {
      const wait = RESEND_SECONDS - Number(last.age);
      throw new HttpException({ message: `Please wait ${wait} seconds before asking for a new code.`, code: 'CODE_WAIT', wait }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const perEmail = await this.db.one<any>('SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)', [email]);
    const perIp = ip ? await this.db.one<any>('SELECT COUNT(*) AS n FROM email_codes WHERE ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)', [ip]) : { n: 0 };
    if (Number(perEmail?.n) >= MAX_PER_EMAIL_HOUR || Number(perIp?.n) >= MAX_PER_IP_HOUR) {
      throw new HttpException({ message: 'Too many codes asked for. Please try again in an hour.', code: 'CODE_LIMIT' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.db.one<any>('SELECT id, name, active FROM users WHERE email = ?', [email]);
    if (purpose === 'signup' && user) throw new ConflictException('This email is already registered. Please log in.');
    if (purpose === 'change' && user) throw new ConflictException('This email is already used by another account.');
    // Password reset: never say whether an email has an account. Unknown or
    // turned-off accounts get the same answer, but no email is sent.
    const send = purpose !== 'reset' || (user && user.active);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const res = await this.db.run(
      `INSERT INTO email_codes (email, purpose, code_hash, ip, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ${CODE_MINUTES} MINUTE))`,
      [email, purpose, hashCode(email, purpose, code), ip.slice(0, 64)],
    );
    if (send) {
      const m =
        purpose === 'signup'
          ? this.mail.layout('Confirm your email', ['Use this code to finish creating your JGasFlow shop account.', `It works for ${CODE_MINUTES} minutes.`], code)
          : purpose === 'change'
          ? this.mail.layout('Confirm your new email', ['Use this code to change the email on your JGasFlow account to this address.', `It works for ${CODE_MINUTES} minutes.`], code)
          : this.mail.layout('Reset your password', [`Hello ${user.name || ''},`.replace(' ,', ','), 'Use this code to set a new password for your JGasFlow account.', `It works for ${CODE_MINUTES} minutes.`], code);
      try {
        await this.mail.send(email, purpose === 'reset' ? `${code} is your JGasFlow password reset code` : `${code} is your JGasFlow code`, m.html, m.text);
      } catch (e) {
        // Not sent: do not count it against the wait or the hourly limit.
        await this.db.run('DELETE FROM email_codes WHERE id = ?', [res.insertId]);
        throw e;
      }
    }
    return { ok: true, resend_in: RESEND_SECONDS, expires_in: CODE_MINUTES * 60 };
  }

  /** Checks the latest code for this email and uses it up. Throws a clear message when it does not match. */
  async consume(rawEmail: string, purpose: CodePurpose, rawCode: string, q: Q = this.db) {
    const email = rawEmail.trim().toLowerCase();
    const code = String(rawCode || '').replace(/\D/g, '');
    if (code.length !== 6) throw new BadRequestException({ message: 'Enter the 6-digit code sent to your email.', code: 'CODE_WRONG' });
    const row = await q.one<any>(
      'SELECT id, code_hash, attempts, used_at, expires_at < NOW() AS expired FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1',
      [email, purpose],
    );
    if (!row || row.used_at || Number(row.expired)) throw new BadRequestException({ message: 'This code has expired. Click Get code for a new one.', code: 'CODE_EXPIRED' });
    if (Number(row.attempts) >= MAX_TRIES) throw new BadRequestException({ message: 'Too many wrong tries. Click Get code for a new one.', code: 'CODE_EXPIRED' });
    const a = Buffer.from(hashCode(email, purpose, code), 'hex');
    const b = Buffer.from(String(row.code_hash), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await q.run('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      const left = MAX_TRIES - Number(row.attempts) - 1;
      throw new BadRequestException({ message: left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong code. Click Get code for a new one.', code: 'CODE_WRONG' });
    }
    await q.run('UPDATE email_codes SET used_at = NOW() WHERE id = ?', [row.id]);
  }
}
