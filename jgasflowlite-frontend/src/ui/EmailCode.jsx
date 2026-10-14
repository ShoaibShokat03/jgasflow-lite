import { useEffect, useState } from 'react';
import { MailCheck, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { Button } from './kit';
import { emailError, Field } from './form';
import { toast } from './overlay';

/**
 * "Enter code" box with a Get code button beside it (sign-up and forgot password).
 * The code goes to `email`; the button waits 60 seconds before it can resend.
 * onEmailError(message) shows a problem with the email itself on the email field.
 */
export function EmailCodeField({ email, purpose, value, onChange, error, onEmailError, reserve = true }) {
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  // A different email needs a new code.
  useEffect(() => {
    if (sentTo && email.trim().toLowerCase() !== sentTo) {
      setSentTo('');
      setWait(0);
    }
  }, [email, sentTo]);

  const send = async () => {
    const mail = email.trim().toLowerCase();
    const bad = !mail ? t('email_required') : emailError(mail);
    if (bad) return onEmailError?.(bad);
    onEmailError?.(null);
    setSending(true);
    try {
      const res = await api.post('/auth/email-code', { email: mail, purpose });
      setSentTo(mail);
      setWait(res?.resend_in ?? 60);
      toast(t('code_sent_toast'));
    } catch (e) {
      if (e.code === 'CODE_WAIT') {
        setSentTo(mail);
        setWait(Number(String(e.message).match(/\d+/)?.[0]) || 60);
      }
      if (e.status === 409) onEmailError?.(e.message);
      else toast(e.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const hint = sentTo ? t('code_sent_to', { email: sentTo }) : t('code_hint');
  return (
    <Field label={t('email_code')} error={error} hint={!error ? hint : undefined} reserve={reserve}>
      <div className="flex gap-2.5">
        <div className="relative flex-1 min-w-0">
          <MailCheck className="absolute left-3 top-1/2 -translate-y-1/2 size-[18px] text-muted pointer-events-none" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={t('code_placeholder')}
            aria-invalid={!!error}
            aria-label={t('email_code')}
            className="ctl pl-10 num tracking-[0.3em] font-bold"
          />
        </div>
        <Button variant="accent" icon={Send} className="min-w-[132px]" loading={sending} disabled={wait > 0} onClick={send}>
          {wait > 0 ? t('resend_in', { n: wait }) : sentTo ? t('resend_code') : t('get_code')}
        </Button>
      </div>
    </Field>
  );
}
