import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { PlatformConfig } from './platform-config.service';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sends email through the SMTP server set in the console (Settings > Email). */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');

  constructor(private readonly config: PlatformConfig) {}

  ready() {
    return !!this.config.smtp();
  }

  async send(to: string, subject: string, html: string, text: string) {
    const s = this.config.smtp();
    if (!s) throw new BadRequestException('Email is not set up yet. Please contact JGasFlow support.');
    const transport = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure === 'ssl',
      requireTLS: s.secure === 'starttls',
      ignoreTLS: s.secure === 'none',
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    try {
      await transport.sendMail({ from: { name: s.fromName, address: s.fromEmail }, to, subject, html, text });
    } catch (e: any) {
      this.log.warn(`Could not send "${subject}" to ${to}: ${e?.message ?? e}`);
      throw new BadRequestException(`Could not send the email: ${String(e?.response || e?.message || e).slice(0, 160)}`);
    } finally {
      transport.close();
    }
  }

  /** The branded email: a title, a few lines and an optional big code. */
  layout(title: string, lines: string[], code?: string) {
    const support = this.config.publicConfig().support;
    const html = `<!doctype html><html><body style="margin:0;background:#f3f4f9;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#14142b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e3e5ef;overflow:hidden">
<tr><td style="background:#020033;padding:18px 24px;font-size:20px;font-weight:800;color:#ffffff">JGas<span style="color:#F26B1D">Flow</span></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:19px">${esc(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:#3d3d5c">${esc(l)}</p>`).join('')}
${code ? `<div style="margin:18px 0;padding:14px;border-radius:12px;background:#f3f4f9;border:1px solid #e3e5ef;text-align:center;font-size:32px;font-weight:800;letter-spacing:10px;color:#020033">${esc(code)}</div>` : ''}
<p style="margin:16px 0 0;font-size:12px;color:#7a7a96">If you did not ask for this, you can ignore this email.</p>
</td></tr>
<tr><td style="padding:14px 24px;background:#fafbfd;font-size:11.5px;color:#7a7a96">Software developed by Jantrah Tech${support.phone ? ` | &#9742; ${esc(support.phone)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
    const text = [title, '', ...lines, ...(code ? ['', `Code: ${code}`] : []), '', 'If you did not ask for this, you can ignore this email.', '', `Software developed by Jantrah Tech${support.phone ? ` | ${support.phone}` : ''}`].join('\n');
    return { html, text };
  }
}
