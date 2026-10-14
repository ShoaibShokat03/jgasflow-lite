import type { AuthUser } from '../auth/auth.decorators';

/** What a platform admin can be given. Super admins have everything, including Admins. */
export const ADMIN_MODULES = [
  { key: 'overview', label: 'Overview' },
  { key: 'shops', label: 'Shops' },
  { key: 'payments', label: 'Payments' },
  { key: 'plans', label: 'Plans' },
  { key: 'reports', label: 'Reports' },
  { key: 'activity', label: 'Activity log' },
  { key: 'support', label: 'Support inbox' },
  { key: 'assistant', label: 'AI assistant' },
  { key: 'ai_settings', label: 'AI settings' },
  { key: 'settings', label: 'Platform settings' },
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number]['key'] | 'admins';

export const isSuperAdmin = (u: Pick<AuthUser, 'isSuper' | 'role'>) => u.isSuper && u.role !== 'admin';

/** The one check every console route and AI tool uses. */
export function adminCan(u: Pick<AuthUser, 'isSuper' | 'role' | 'adminPerms'>, module: string): boolean {
  if (!u.isSuper) return false;
  if (u.role !== 'admin') return true;
  if (module === 'admins') return false;
  return !u.adminPerms || u.adminPerms.includes(module);
}

export function parsePerms(v: unknown): string[] | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    const p = JSON.parse(String(v));
    return Array.isArray(p) ? p.map(String) : null;
  } catch {
    return null;
  }
}
