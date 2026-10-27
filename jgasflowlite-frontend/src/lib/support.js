import { useGet } from './api';

/** WhatsApp wants digits with the country code: "0303 1234567" becomes "923031234567". */
export function waDigits(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.startsWith('0') ? `92${d.slice(1)}` : d;
}

/**
 * Support contact set in the console (Settings > Support). Nothing is built in:
 * an empty field stays empty and the screen hides it.
 */
export function useSupport() {
  const s = useGet('/public/config', undefined, { staleTime: 10 * 60_000 }).data?.support ?? {};
  const phone = s.phone || '';
  return {
    company: s.company || '',
    phone,
    whatsapp: waDigits(s.whatsapp || phone),
    email: s.email || '',
    hours: s.hours || '',
  };
}

export const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
