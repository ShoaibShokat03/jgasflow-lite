import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronRight, Keyboard, Lightbulb, MessageCircleQuestion, Printer, Rocket, Search, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, PageHeader } from '@/components/ui/core';
import { CHANGELOG, FAQ, MANUAL_UPDATED, QUICK_START, SECTIONS, SHORTCUTS } from './manual';

/**
 * The in-app user manual. All content lives in manual.js so it can be kept in
 * step with the app: whenever a feature is added, changed or removed, update
 * that file and add a line to CHANGELOG.
 */

/** Inline markup used in manual.js: **bold** and `Key` (shown as a key cap). */
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith('**') ? (
      <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>
    ) : p.startsWith('`') ? (
      <span key={i} className="kbd mx-0.5">{p.slice(1, -1)}</span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

const flatText = (s) => [s.title, s.summary, ...(s.tasks ?? []).flatMap((t) => [t.title, ...(t.steps ?? []), t.tip, t.note])].filter(Boolean).join(' ').toLowerCase();
const CHANGE_TONE = {
  new: 'bg-emerald-50 text-success dark:bg-emerald-500/15',
  improved: 'bg-brand-50 text-link dark:bg-brand-500/15',
  fixed: 'bg-cyan-50 text-info dark:bg-cyan-500/15',
  removed: 'bg-rose-50 text-danger dark:bg-rose-500/15',
};

export default function HelpPage() {
  const { can } = useMe();
  const location = useLocation();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(null);
  const searchRef = useRef(null);
  const q = term.trim().toLowerCase();

  const sections = useMemo(() => {
    if (!q) return SECTIONS;
    const words = q.split(/\s+/);
    return SECTIONS.map((s) => {
      const whole = flatText(s);
      if (!words.every((w) => whole.includes(w))) return null;
      // Inside a matching section keep only the tasks that match, unless the
      // match came from the section title or summary.
      const head = `${s.title} ${s.summary}`.toLowerCase();
      if (words.every((w) => head.includes(w))) return s;
      const tasks = s.tasks.filter((t) => words.every((w) => [t.title, ...(t.steps ?? []), t.tip, t.note].filter(Boolean).join(' ').toLowerCase().includes(w)));
      return { ...s, tasks: tasks.length ? tasks : s.tasks };
    }).filter(Boolean);
  }, [q]);

  const groups = useMemo(() => {
    const m = new Map();
    sections.forEach((s) => m.set(s.group, [...(m.get(s.group) ?? []), s]));
    return [...m.entries()];
  }, [sections]);

  // Deep links: /help#quotes scrolls to that section.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, [location.hash]);

  // Highlight the section in view in the table of contents.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-80px 0px -65% 0px' },
    );
    document.querySelectorAll('[data-manual-section]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  const jump = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <div>
      <PageHeader
        title="User manual"
        subtitle={`Step by step guides for every screen. Last updated ${MANUAL_UPDATED}.`}
        actions={<Button variant="secondary" icon={Printer} onClick={() => window.print()} className="print:hidden">Print</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="print:hidden lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100dvh-90px)] lg:overflow-y-auto">
          <div className="relative mb-3">
            <Search className="size-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search the manual"
              aria-label="Search the manual"
              className="input pl-9 pr-8"
            />
            {term && (
              <button onClick={() => (setTerm(''), searchRef.current?.focus())} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-faint hover:text-ink" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <nav className="space-y-3 text-[13px]">
            {!q && (
              <ul className="space-y-0.5">
                {[['quick-start', 'Quick start', Rocket], ['shortcuts', 'Keyboard shortcuts', Keyboard], ['faq', 'Questions and fixes', MessageCircleQuestion], ['whats-new', "What's new", Sparkles]].map(([id, label, Icon]) => (
                  <li key={id}>
                    <a href={`#${id}`} onClick={jump(id)} className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg', active === id ? 'bg-brand-50 text-link font-medium dark:bg-brand-500/12 dark:text-brand-200' : 'text-muted hover:bg-surface-3 hover:text-ink')}>
                      <Icon className="size-3.5" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{group}</p>
                <ul className="space-y-0.5">
                  {list.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} onClick={jump(s.id)} className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg', active === s.id ? 'bg-brand-50 text-link font-medium dark:bg-brand-500/12 dark:text-brand-200' : 'text-muted hover:bg-surface-3 hover:text-ink')}>
                        <s.icon className="size-3.5 shrink-0" />
                        <span className="truncate">{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {q && !sections.length && <p className="px-2.5 text-muted">Nothing matches "{term}". Try a shorter word.</p>}
          </nav>
        </aside>

        <div className="space-y-6 min-w-0">
          {!q && (
            <Card id="quick-start" data-manual-section className="p-5 scroll-mt-20">
              <div className="flex items-center gap-2 mb-1"><Rocket className="size-5 text-link" /><h2 className="text-[17px] font-semibold">Quick start</h2></div>
              <p className="text-[13.5px] text-muted mb-4">New to ChipsTrader? These steps take you from an empty system to your first invoice.</p>
              <ol className="grid gap-3 sm:grid-cols-2">
                {QUICK_START.map((step, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border border-line p-3">
                    <span className="grid place-items-center size-7 shrink-0 rounded-full bg-brand-600 text-white text-[13px] font-semibold">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold">{step.title}</p>
                      <p className="text-[12.5px] text-muted mt-0.5 leading-relaxed"><Rich text={step.text} /></p>
                      {step.section && (
                        <a href={`#${step.section}`} onClick={jump(step.section)} className="inline-flex items-center gap-1 text-[12.5px] text-link hover:underline mt-1">
                          Read the guide <ChevronRight className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {sections.map((s) => {
            const openable = s.open && (!s.open.perm || can(...[].concat(s.open.perm)));
            return (
              <Card key={s.id} id={s.id} data-manual-section className="scroll-mt-20 overflow-hidden">
                <div className="p-5 border-b border-line flex flex-wrap items-start gap-3">
                  <div className="grid place-items-center size-10 rounded-xl bg-brand-50 text-link dark:bg-brand-500/12 dark:text-brand-200 shrink-0">
                    <s.icon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">{s.group}</p>
                    <h2 className="text-[17px] font-semibold leading-tight">{s.title}</h2>
                    <p className="text-[13.5px] text-muted mt-1 leading-relaxed"><Rich text={s.summary} /></p>
                    {s.who && <p className="text-[12px] text-faint mt-1.5">Who can use it: {s.who}</p>}
                  </div>
                  {openable && (
                    <Link to={s.open.to} className="btn btn-secondary btn-sm print:hidden">
                      {s.open.label ?? 'Open this screen'} <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
                <div className="divide-y divide-line">
                  {s.tasks.map((t) => (
                    <div key={t.title} className="p-5">
                      <h3 className="text-[14.5px] font-semibold mb-2.5">{t.title}</h3>
                      {t.steps && (
                        <ol className="space-y-2">
                          {t.steps.map((step, i) => (
                            <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed">
                              <span className="grid place-items-center size-6 shrink-0 rounded-full bg-surface-3 text-ink text-[12px] font-semibold mt-px">{i + 1}</span>
                              <span className="min-w-0"><Rich text={step} /></span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {t.tip && (
                        <p className="mt-3 flex gap-2 rounded-lg bg-brand-50 dark:bg-brand-500/10 px-3 py-2 text-[13px] leading-relaxed">
                          <Lightbulb className="size-4 text-link shrink-0 mt-0.5" />
                          <span><Rich text={t.tip} /></span>
                        </p>
                      )}
                      {t.note && (
                        <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[13px] leading-relaxed">
                          <TriangleAlert className="size-4 text-warning shrink-0 mt-0.5" />
                          <span><Rich text={t.note} /></span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}

          {!q && (
            <>
              <Card id="shortcuts" data-manual-section className="p-5 scroll-mt-20">
                <div className="flex items-center gap-2 mb-3"><Keyboard className="size-5 text-link" /><h2 className="text-[17px] font-semibold">Keyboard shortcuts</h2></div>
                <p className="text-[13px] text-muted mb-3">Single-key shortcuts work anywhere except while you are typing in a field. On a Mac use `Cmd` instead of `Ctrl`.</p>
                <ul className="grid gap-x-8 sm:grid-cols-2 divide-y divide-line sm:divide-y-0">
                  {SHORTCUTS.map((s) => (
                    <li key={s.text} className="flex items-center justify-between gap-4 py-2 sm:border-b sm:border-line text-[13.5px]">
                      <span>{s.text}</span>
                      <span className="flex gap-1 shrink-0">{s.keys.map((k) => <span key={k} className="kbd">{k}</span>)}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card id="faq" data-manual-section className="p-5 scroll-mt-20">
                <div className="flex items-center gap-2 mb-3"><MessageCircleQuestion className="size-5 text-link" /><h2 className="text-[17px] font-semibold">Questions and fixes</h2></div>
                <div className="divide-y divide-line">
                  {FAQ.map((f) => (
                    <details key={f.q} className="group py-2.5">
                      <summary className="flex items-center gap-2 cursor-pointer list-none text-[13.5px] font-medium">
                        <ChevronRight className="size-4 text-faint transition-transform group-open:rotate-90" />
                        {f.q}
                      </summary>
                      <p className="pl-6 pt-1.5 text-[13.5px] text-muted leading-relaxed"><Rich text={f.a} /></p>
                    </details>
                  ))}
                </div>
              </Card>

              <Card id="whats-new" data-manual-section className="p-5 scroll-mt-20">
                <div className="flex items-center gap-2 mb-3"><Sparkles className="size-5 text-link" /><h2 className="text-[17px] font-semibold">What's new</h2></div>
                <div className="space-y-4">
                  {CHANGELOG.map((c) => (
                    <div key={c.date}>
                      <p className="text-[12.5px] font-semibold text-muted mb-1.5">{c.date}</p>
                      <ul className="space-y-1.5">
                        {c.items.map((it, i) => (
                          <li key={i} className="flex items-start gap-2 text-[13.5px]">
                            <span className={cn('chip shrink-0 capitalize', CHANGE_TONE[it.type])}>{it.type}</span>
                            <span className="leading-relaxed"><Rich text={it.text} /></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>

              <p className="flex items-center gap-2 text-[12px] text-faint"><BookOpen className="size-3.5" />Something missing or unclear? Tell your administrator so the manual can be improved.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
