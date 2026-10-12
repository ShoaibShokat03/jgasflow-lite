import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Printer, ArrowRightCircle, Ban, RotateCcw, ChevronDown, Rows3, Landmark, Paperclip, History, PackageCheck, Truck, Pencil, Building2, CalendarDays, User, ArrowUpRight,
} from 'lucide-react';
import { errorMessage, get, openBlob, post } from '@/lib/api';
import { fmtDate, fmtMoney, humanize } from '@/lib/format';
import { useMaster } from '@/lib/hooks';
import { Button, Card, DetailList, PageHeader, Skeleton, Spinner, Tabs } from '@/components/ui/core';
import { ConfirmDialog, Menu, useToast } from '@/components/ui/overlay';
import { StatusBadge, Badge } from '@/components/ui/status';
import { DOCS, docPath } from './doc-types';
import LinesPanel from './LinesPanel';
import TermsPanel from './TermsPanel';
import HeaderDialog from './HeaderDialog';
import { AttachmentsPanel } from '@/features/shared/AttachmentsPanel';
import { HistoryPanel } from '@/features/shared/HistoryPanel';

const FulfilmentPanel = lazy(() => import('@/features/fulfilment/FulfilmentPanel'));
const ReceivingPanel = lazy(() => import('@/features/fulfilment/ReceivingPanel'));

const PDF_KIND = { requirement: 'requirement', quote: 'quote', sales_order: 'sales_order', offer: 'offer', purchase_order: 'purchase_order' };

export default function DocDetailPage({ kind }) {
  const cfg = DOCS[kind];
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { name } = useMaster();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || (cfg.fulfilment ? 'fulfilment' : 'lines');
  const [confirm, setConfirm] = useState(null);
  const [editHeader, setEditHeader] = useState(false);

  const key = [cfg.api, 'detail', id];
  const q = useQuery({ queryKey: key, queryFn: () => get(`${cfg.api}/${id}`) });
  const doc = q.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: [cfg.api, 'list'] });
  };

  const action = useMutation({
    mutationFn: ({ path, body }) => post(`${cfg.api}/${id}/${path}`, body),
    onSuccess: (r, v) => {
      refresh();
      setConfirm(null);
      if (v.path === 'convert') {
        const target = DOCS[r.kind];
        qc.invalidateQueries({ queryKey: [target.api] });
        toast.success(r.existing ? `Already converted, opening ${r.doc_no}` : `${target.label} ${r.doc_no} created`, { action: { label: 'Open', onClick: () => navigate(docPath(r.kind, r.id)) } });
        navigate(docPath(r.kind, r.id));
      } else toast.success(v.success);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (q.isError) return <Card className="p-8 text-center text-muted">{errorMessage(q.error)}</Card>;

  const currency = doc.totals?.currency;
  const tabs = [
    cfg.fulfilment && { value: 'fulfilment', label: 'Fulfilment', icon: Truck },
    cfg.receiving && { value: 'receiving', label: 'Receiving', icon: PackageCheck },
    { value: 'lines', label: 'Lines', icon: Rows3, count: doc.lines.length },
    { value: 'terms', label: 'Terms & totals', icon: Landmark },
    { value: 'files', label: 'Files', icon: Paperclip },
    { value: 'history', label: 'History', icon: History, count: doc.events.length || undefined },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: cfg.plural, to: `/${cfg.route}` }, { label: doc.doc_no }]}
        title={<span className="mono text-[22px]">{doc.doc_no}</span>}
        badge={
          <>
            <StatusBadge status={doc.status} />
            {doc.priority && doc.priority !== 'normal' && <Badge tone={doc.priority === 'urgent' ? 'rose' : doc.priority === 'high' ? 'amber' : 'slate'}>{humanize(doc.priority)}</Badge>}
          </>
        }
        subtitle={doc.title}
        actions={
          <>
            <Button icon={Printer} onClick={() => openBlob(`/pdf/${PDF_KIND[kind]}/${id}`).catch((e) => toast.error(errorMessage(e)))}>
              PDF
            </Button>
            {doc.can.update && doc.manual_statuses?.length > 0 && (
              <Menu
                trigger={
                  <Button>
                    Status <ChevronDown className="size-3.5" />
                  </Button>
                }
                items={doc.manual_statuses.map((s) => ({
                  label: humanize(s),
                  disabled: s === doc.status,
                  onClick: () => action.mutate({ path: 'status', body: { status: s }, success: `Marked as ${humanize(s).toLowerCase()}` }),
                }))}
              />
            )}
            {(doc.can.cancel || doc.can.uncancel) && (
              <Menu
                trigger={<Button aria-label="More actions">More <ChevronDown className="size-3.5" /></Button>}
                items={[
                  doc.can.update && { label: 'Edit details', icon: Pencil, onClick: () => setEditHeader(true) },
                  doc.can.cancel && { label: `Cancel ${cfg.label.toLowerCase()}`, icon: Ban, danger: true, onClick: () => setConfirm('cancel') },
                  doc.can.uncancel && { label: 'Restore', icon: RotateCcw, onClick: () => setConfirm('uncancel') },
                ]}
              />
            )}
            {doc.can.convert && (
              <Button variant="primary" icon={ArrowRightCircle} loading={action.isPending && action.variables?.path === 'convert'} onClick={() => action.mutate({ path: 'convert' })}>
                {cfg.convertLabel}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] mb-5">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <Link to={`/companies/${doc.partner?.id}`} className="group flex items-center gap-3 min-w-0">
              <div className="grid place-items-center size-10 rounded-xl bg-surface-3 text-muted group-hover:bg-brand-50 group-hover:text-link transition-colors">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-faint font-medium">{cfg.side}</p>
                <p className="font-semibold truncate group-hover:text-link flex items-center gap-1">
                  {doc.partner?.legal_name} <ArrowUpRight className="size-3.5 opacity-0 group-hover:opacity-100" />
                </p>
              </div>
            </Link>
            {doc.can.update && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditHeader(true)}>Edit</Button>}
          </div>
          <DetailList
            cols={3}
            items={[
              { label: cfg.dateLabel, value: <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5 text-faint" />{fmtDate(doc.doc_date)}</span> },
              ...cfg.extra.map((x) => ({ label: x.label, value: x.type === 'date' ? (doc[x.key] ? fmtDate(doc[x.key]) : null) : doc[x.key] })),
              { label: cfg.side === 'customer' ? 'Sales rep' : 'Buyer', value: doc.owner && <span className="flex items-center gap-1.5"><User className="size-3.5 text-faint" />{doc.owner.full_name || doc.owner.username}</span> },
              { label: 'Contact', value: doc.contact && `${doc.contact.first_name ?? ''} ${doc.contact.last_name}`.trim() },
              { label: 'Currency', value: name('currencies', doc.currency_id) },
              { label: 'Source', value: doc.source && humanize(doc.source), hidden: kind !== 'requirement' },
            ]}
          />
          {(doc.parents.length > 0 || doc.children.length > 0) && (
            <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center gap-2 text-[12.5px]">
              {doc.parents.map((p) => (
                <Link key={`${p.kind}-${p.id}`} to={docPath(p.kind, p.id)} className="chip bg-surface-3 hover:bg-brand-50 hover:text-link text-muted">
                  ← {DOCS[p.kind].label} <span className="mono">{p.no}</span>
                </Link>
              ))}
              {doc.children.map((c) => (
                <Link key={`${c.kind}-${c.id}`} to={docPath(c.kind, c.id)} className="chip bg-brand-50 text-link hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
                  {DOCS[c.kind].label} <span className="mono">{c.no}</span> → <StatusBadge status={c.status} className="h-4 px-1.5 text-[11px]" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 bg-gradient-to-br from-brand-700 to-cyan-800 text-white border-0">
          <p className="text-[12px] text-indigo-100 font-medium">Total</p>
          <p className="text-[28px] font-semibold tracking-tight mt-0.5">{fmtMoney(doc.totals.grand_total, currency)}</p>
          <div className="mt-3 space-y-1 text-[12.5px] text-indigo-50">
            <p className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(doc.totals.subtotal)}</span></p>
            {doc.totals.shipping + doc.totals.handling + doc.totals.misc > 0 && (
              <p className="flex justify-between"><span>Costs</span><span className="tabular-nums">{fmtMoney(doc.totals.shipping + doc.totals.handling + doc.totals.misc)}</span></p>
            )}
            <p className="flex justify-between"><span>Tax{doc.totals.tax_rate ? ` ${doc.totals.tax_rate}%` : ''}</span><span className="tabular-nums">{fmtMoney(doc.totals.tax_amount)}</span></p>
            <p className="flex justify-between"><span>Lines priced</span><span>{doc.totals.lines_priced} / {doc.lines.length}</span></p>
          </div>
          {doc.totals.notes.length > 0 && <p className="mt-3 text-[12px] text-indigo-100 border-t border-white/25 pt-2">{doc.totals.notes.join(' ')}</p>}
        </Card>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} className="mb-4" />

      <Suspense fallback={<div className="py-16 grid place-items-center"><Spinner /></div>}>
        {tab === 'lines' && <LinesPanel kind={kind} doc={doc} onChange={refresh} />}
        {tab === 'terms' && <TermsPanel kind={kind} doc={doc} onChange={refresh} />}
        {tab === 'files' && <AttachmentsPanel table={cfg.kind} id={doc.id} />}
        {tab === 'history' && <HistoryPanel events={doc.events} createdAt={doc.created_at} />}
        {tab === 'fulfilment' && <FulfilmentPanel doc={doc} onChange={refresh} />}
        {tab === 'receiving' && <ReceivingPanel doc={doc} onChange={refresh} />}
      </Suspense>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger={confirm === 'cancel'}
        reason
        loading={action.isPending}
        title={confirm === 'cancel' ? `Cancel ${doc.doc_no}?` : `Restore ${doc.doc_no}?`}
        message={confirm === 'cancel' ? 'The document stays in the system with its history; it just stops counting as open.' : 'The document returns to its starting status.'}
        confirmLabel={confirm === 'cancel' ? 'Cancel document' : 'Restore'}
        onConfirm={(reason) => action.mutate({ path: confirm, body: { reason }, success: confirm === 'cancel' ? 'Cancelled' : 'Restored' })}
      />

      {editHeader && <HeaderDialog kind={kind} doc={doc} onClose={() => setEditHeader(false)} onSaved={refresh} />}
    </div>
  );
}

