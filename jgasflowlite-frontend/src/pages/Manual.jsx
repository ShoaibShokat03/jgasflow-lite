import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Crown,
  Cylinder,
  DatabaseBackup,
  FileSpreadsheet,
  HelpCircle,
  Home,
  Layers,
  Lightbulb,
  Printer,
  Receipt,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Tag as TagIcon,
  Truck,
  Undo2,
  Users,
  UsersRound,
  Wallet,
  Keyboard,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { getLang, t, useLang } from '@/lib/i18n';
import { printNow } from '@/lib/print';
import { MANUAL, MANUAL_UPDATED } from '@/features/manual';
import { Button, Card, cn, Empty, IconBox, PageHeader, Tag } from '@/ui/kit';
import { SearchBox } from '@/ui/form';
import { PrintCredit } from '@/ui/receipt';

const ICONS = {
  rocket: [Rocket, '#F26B1D'],
  home: [Home, '#020033'],
  layers: [Layers, '#3B3A8F'],
  cylinder: [Cylinder, '#020033'],
  truck: [Truck, '#1565C0'],
  users: [Users, '#6A3FB5'],
  cart: [ShoppingCart, '#F26B1D'],
  receipt: [Receipt, '#2E7D32'],
  wallet: [Wallet, '#C62828'],
  undo: [Undo2, '#B77D00'],
  tag: [TagIcon, '#B77D00'],
  chart: [BarChart3, '#2E7D32'],
  team: [UsersRound, '#1565C0'],
  phone: [Smartphone, '#020033'],
  database: [DatabaseBackup, '#3B3A8F'],
  sheet: [FileSpreadsheet, '#2E7D32'],
  crown: [Crown, '#B77D00'],
  printer: [Printer, '#1565C0'],
  shield: [ShieldCheck, '#2E7D32'],
  help: [HelpCircle, '#6A3FB5'],
  keyboard: [Keyboard, '#F26B1D'],
};
const ROLE_TONE = { owner: 'orange', manager: 'blue', salesman: 'green' };

/** Turns **label** into bold on-screen labels. */
function Rich({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') ? (
      <b key={i} className="font-semibold text-primary">
        {p.slice(2, -2)}
      </b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function Manual() {
  useLang();
  const auth = useAuth();
  const lang = getLang() === 'ur' ? 'ur' : 'en';
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [active, setActive] = useState(MANUAL[0].id);

  const sections = useMemo(() => {
    const s = q.trim().toLowerCase();
    return MANUAL.filter((m) => (!mine || m.roles.includes(auth.role)) && (!s || JSON.stringify(m[lang]).toLowerCase().includes(s)));
  }, [q, mine, lang, auth.role]);

  // Highlight the section being read in the contents list.
  useEffect(() => {
    const els = sections.map((m) => document.getElementById(`m-${m.id}`)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id.slice(2));
      },
      { rootMargin: '-90px 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);

  const go = (id) => document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div>
      <PageHeader
        title={t('user_manual')}
        sub={`${t('manual_sub')} · ${t('manual_updated')} ${MANUAL_UPDATED}`}
        actions={
          <Button data-shortcut="print" variant="outline" icon={Printer} onClick={() => printNow('doc')}>
            {t('print')}
          </Button>
        }
      />

      <div className="grid lg:grid-cols-[260px_1fr] gap-5 items-start">
        {/* contents */}
        <aside className="no-print lg:sticky lg:top-[84px] space-y-3">
          <SearchBox value={q} onChange={setQ} placeholder={t('manual_search')} />
          <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer select-none px-1">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="size-4 accent-[#020033]" />
            {t('manual_only_mine')}
          </label>
          <Card className="p-1.5 max-h-[calc(100dvh-230px)] overflow-y-auto no-scrollbar hidden lg:block">
            {sections.map((m, i) => {
              const [Icon] = ICONS[m.icon];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => go(m.id)}
                  className={cn('w-full flex items-center gap-2.5 h-9 px-2.5 rounded-[var(--radius-xs)] text-left text-[13px] transition', active === m.id ? 'bg-soft text-primary font-semibold' : 'hover:bg-bg text-ink/80')}
                >
                  <span className="w-5 text-[11px] font-bold text-muted num">{i + 1}</span>
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{m[lang].title}</span>
                </button>
              );
            })}
          </Card>
          {/* phone: chips */}
          <div className="lg:hidden flex gap-1.5 overflow-x-auto no-scrollbar">
            {sections.map((m) => (
              <button key={m.id} type="button" onClick={() => go(m.id)} className="h-8 px-3 rounded-[var(--radius-ctl)] border border-line bg-white text-[12.5px] font-semibold whitespace-nowrap shrink-0">
                {m[lang].title}
              </button>
            ))}
          </div>
        </aside>

        {/* sections */}
        <div className="print-area space-y-4 min-w-0">
          <div className="hidden print:block mb-2">
            <div className="text-[20px] font-black">JGasFlow: {t('user_manual')}</div>
            <div className="text-[12px]">{auth.shop?.name}</div>
          </div>
          {sections.length === 0 && (
            <Card>
              <Empty icon={BookOpen} title={t('nothing_found')} />
            </Card>
          )}
          {sections.map((m, i) => {
            const [Icon, color] = ICONS[m.icon];
            const c = m[lang];
            return (
              <Card key={m.id} id={`m-${m.id}`} className="p-5 scroll-mt-[90px] break-inside-avoid">
                <div className="flex flex-wrap items-start gap-3">
                  <IconBox icon={Icon} color={color} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold text-muted">
                      {t('manual_section')} {i + 1}
                    </div>
                    <h2 className="text-[18px] font-bold leading-tight">{c.title}</h2>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.roles.map((r) => (
                        <Tag key={r} tone={ROLE_TONE[r]}>
                          {t(`role_${r}`)}
                        </Tag>
                      ))}
                    </div>
                  </div>
                  {m.to && (
                    <Button size="sm" variant="soft" iconRight={ArrowRight} to={m.to} className="no-print">
                      {t('manual_open')}
                    </Button>
                  )}
                </div>
                <p className="mt-3 text-[14px] text-ink/80">
                  <Rich text={c.intro} />
                </p>
                <ol className="mt-3 space-y-2.5">
                  {c.steps.map((s, k) => (
                    <li key={k} className="flex gap-3 text-[14px] leading-relaxed">
                      <span className="grid place-items-center size-6 rounded-full bg-primary text-white text-[12px] font-bold shrink-0 mt-0.5">{k + 1}</span>
                      <span className="min-w-0">
                        <Rich text={s} />
                      </span>
                    </li>
                  ))}
                </ol>
                {c.tips?.length > 0 && (
                  <div className="mt-4 rounded-[var(--radius-ctl)] bg-[#fff8e6] px-3.5 py-2.5 space-y-1">
                    {c.tips.map((tip, k) => (
                      <div key={k} className="flex gap-2 text-[13px]">
                        <Lightbulb className="size-4 text-warn shrink-0 mt-0.5" />
                        <span>
                          <Rich text={tip} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
          <PrintCredit className="hidden print:block" />
        </div>
      </div>
    </div>
  );
}
