/**
 * Module-level access ⇄ permission keys.
 *
 * The server's catalogue (GET /admin/roles/catalog → modules) describes each
 * module's cumulative levels (view ⊂ edit ⊂ full) and, for document modules,
 * record scopes (own ⊂ accounts ⊂ all). Roles are still stored as permission
 * keys; these helpers read a level/scope out of a key set and write one back.
 */

export const LEVELS = ['view', 'edit', 'full'];
export const SCOPES = ['own', 'accounts', 'all'];

export const LEVEL_LABEL = { none: 'No access', view: 'View', edit: 'Edit', full: 'Full' };
export const SCOPE_LABEL = { own: 'Own records', accounts: 'Their accounts', all: 'All records' };

export const availableLevels = (m) => LEVELS.filter((l) => m.levels[l]?.length);

const atLeast = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

/** Keys granted by a level, including every lower level. */
export function levelKeys(m, level) {
  if (!level || level === 'none') return [];
  return LEVELS.slice(0, LEVELS.indexOf(level) + 1).flatMap((l) => m.levels[l] ?? []);
}

/** Scopes worth offering: 'accounts' is hidden when it means the same as 'own'. */
export function scopeOptions(m) {
  if (!m.scopes) return [];
  const same = (a, b) => a.length === b.length && a.every((k) => b.includes(k));
  return SCOPES.filter((s) => !(s === 'accounts' && same(m.scopes.accounts.view, m.scopes.own.view)));
}

/** Visibility keys for a scope (cumulative), with edit keys when the level allows editing. */
export function scopeKeys(m, scope, level) {
  if (!m.scopes || !scope || !level || level === 'none') return [];
  const upTo = SCOPES.slice(0, SCOPES.indexOf(scope) + 1);
  return upTo.flatMap((s) => [...m.scopes[s].view, ...(atLeast(level, 'edit') ? m.scopes[s].edit : [])]);
}

/** Every key this module could ever write. */
export function moduleKeys(m) {
  return [
    ...Object.values(m.levels).flat(),
    ...(m.scopes ? Object.values(m.scopes).flatMap((s) => [...s.view, ...s.edit]) : []),
  ];
}

/** Highest level whose keys are all present. `*` (super admin) is the top level. */
export function levelOf(m, set) {
  const levels = availableLevels(m);
  if (set.has('*')) return levels.at(-1) ?? 'none';
  let current = 'none';
  for (const l of levels) {
    if (levelKeys(m, l).every((k) => set.has(k))) current = l;
    else break;
  }
  return current;
}

/** Widest scope whose visibility keys are all present. */
export function scopeOf(m, set) {
  if (!m.scopes) return null;
  if (set.has('*')) return 'all';
  // Only scopes offered for this module (dashboard has no separate "accounts").
  for (const s of [...scopeOptions(m)].reverse()) if (m.scopes[s].view.every((k) => set.has(k))) return s;
  return null;
}

/**
 * True when the role holds keys for this module that no level + scope explains.
 * Keys another module legitimately uses (shared scope keys) do not count.
 */
export function isCustom(m, set, all = []) {
  if (set.has('*')) return false;
  const level = levelOf(m, set);
  const scope = scopeOf(m, set);
  const expected = new Set([...levelKeys(m, level), ...scopeKeys(m, scope, level)]);
  const usedElsewhere = new Set(
    all
      .filter((o) => o.key !== m.key)
      .flatMap((o) => {
        const l = levelOf(o, set);
        return l === 'none' ? [] : [...levelKeys(o, l), ...scopeKeys(o, scopeOf(o, set) ?? 'own', l)];
      }),
  );
  return moduleKeys(m).some((k) => !usedElsewhere.has(k) && set.has(k) !== expected.has(k));
}

/**
 * Return a new key set with module `m` set to `level` + `scope`.
 *
 * Some visibility keys are shared (Customers and Suppliers both use the
 * company.* scope keys), so after clearing this module's keys we put back any
 * key that another module's current level still relies on. Pass every module
 * as `all` for that protection.
 */
export function applyModule(set, m, level, scope, all = []) {
  const keep = all
    .filter((o) => o.key !== m.key)
    .flatMap((o) => {
      const l = levelOf(o, set);
      return l === 'none' ? [] : [...levelKeys(o, l), ...scopeKeys(o, scopeOf(o, set) ?? 'own', l)];
    })
    .filter((k) => set.has(k));
  const next = new Set(set);
  moduleKeys(m).forEach((k) => next.delete(k));
  if (level && level !== 'none') {
    levelKeys(m, level).forEach((k) => next.add(k));
    if (m.scopes) scopeKeys(m, scope ?? 'own', level).forEach((k) => next.add(k));
  }
  keep.forEach((k) => next.add(k));
  return next;
}

/** Per-module summary of a key set, for "what can this person do" panels. */
export function summarize(modules, set) {
  return modules.map((m) => ({ module: m, level: levelOf(m, set), scope: scopeOf(m, set) }));
}
