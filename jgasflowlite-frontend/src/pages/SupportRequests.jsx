import { useState } from 'react';
import { CheckCircle2, ChevronRight, Headset, MessageSquarePlus, Send } from 'lucide-react';
import { postForm, useAct, useGet } from '@/lib/api';
import { fDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, cn, Empty, SectionHeader, Tag } from '@/ui/kit';
import { Chips, Textarea, TextInput } from '@/ui/form';
import { Modal, toast } from '@/ui/overlay';
import { ScreenshotPicker, SecureImage } from '@/ui/attach';

const TOPICS = ['problem', 'payment', 'question', 'feature', 'other'];
const STATUS_TONE = { open: 'amber', answered: 'green', closed: 'navy' };

/** Help requests to the JGasFlow team: write, attach screenshots, read replies. */
export default function SupportRequests() {
  const list = useGet('/support/requests');
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  return (
    <>
      <SectionHeader
        title={t('my_requests')}
        action={
          <Button size="sm" variant="accent" icon={MessageSquarePlus} onClick={() => setNewOpen(true)}>
            {t('new_request')}
          </Button>
        }
      />
      <Async q={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <Empty icon={Headset} title={t('no_requests')} sub={t('no_requests_sub')} />
            </Card>
          ) : (
            <Card className="overflow-hidden divide-rows">
              {rows.map((r) => (
                <button key={r.id} type="button" onClick={() => setViewing(r.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-soft/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">
                      #{r.id} {r.subject}
                    </div>
                    <div className="text-[12px] text-muted truncate">
                      {t(`topic_${r.topic}`)} · {fDateTime(r.updated_at)} · {t('n_messages', { n: r.messages })}
                    </div>
                  </div>
                  {r.status === 'answered' && r.last_from === 'admin' && <span className="size-2.5 rounded-full bg-accent shrink-0" title={t('new_reply')} />}
                  <Tag tone={STATUS_TONE[r.status]}>{t(`req_status_${r.status}`)}</Tag>
                  <ChevronRight className="size-4 text-muted shrink-0" />
                </button>
              ))}
            </Card>
          )
        }
      </Async>
      <NewRequest open={newOpen} onClose={() => setNewOpen(false)} onCreated={(r) => (setNewOpen(false), setViewing(r.id))} />
      <Thread id={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function NewRequest({ open, onClose, onCreated }) {
  const [f, setF] = useState({ topic: 'problem', subject: '', message: '' });
  const [shots, setShots] = useState([]);
  const [errs, setErrs] = useState({});
  const send = useAct(() => postForm('/support/requests', f, shots), {
    onSuccess: (r) => {
      toast(t('request_sent'));
      setF({ topic: 'problem', subject: '', message: '' });
      setShots([]);
      onCreated(r);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const submit = () => {
    const es = { subject: f.subject.trim().length < 3 ? t('subject_needed') : null, message: f.message.trim().length < 5 ? t('message_needed') : null };
    setErrs(es);
    if (!es.subject && !es.message) send.mutate();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('new_request')}
      sub={t('new_request_sub')}
      icon={MessageSquarePlus}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="accent" icon={Send} loading={send.isPending} onClick={submit}>
            {t('send')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <div className="label">{t('topic')}</div>
          <Chips size="sm" value={f.topic} onChange={(v) => setF({ ...f, topic: v })} options={TOPICS.map((k) => ({ value: k, label: t(`topic_${k}`) }))} />
        </div>
        <TextInput label={t('subject')} value={f.subject} onChange={(v) => setF({ ...f, subject: v })} maxLength={120} error={errs.subject} placeholder={t('subject_placeholder')} autoFocus />
        <Textarea label={t('message')} rows={5} value={f.message} onChange={(v) => setF({ ...f, message: v })} maxLength={3000} error={errs.message} placeholder={t('message_placeholder')} />
        <ScreenshotPicker files={shots} onChange={setShots} label={t('screenshots_optional')} />
      </div>
    </Modal>
  );
}

function Thread({ id, onClose }) {
  const q = useGet(id ? `/support/requests/${id}` : null);
  const [msg, setMsg] = useState('');
  const [shots, setShots] = useState([]);
  const reply = useAct(() => postForm(`/support/requests/${id}/messages`, { message: msg }, shots), {
    onSuccess: () => {
      setMsg('');
      setShots([]);
      toast(t('reply_sent'));
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const r = q.data;
  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={r ? `#${r.id} ${r.subject}` : t('loading')} sub={r ? `${t(`topic_${r.topic}`)} · ${t(`req_status_${r.status}`)}` : undefined} icon={Headset}>
      <Async q={q}>
        {(d) => (
          <div className="space-y-3">
            {d.thread.map((m) => (
              <div key={m.id} className={cn('flex', m.from_admin ? 'justify-start' : 'justify-end')}>
                <div className={cn('max-w-[88%] rounded-2xl px-3.5 py-2.5 border', m.from_admin ? 'bg-soft border-[#dfe0f0]' : 'bg-[#fff4ec] border-[#ffdcc4]')}>
                  <div className="text-[11.5px] font-bold text-muted mb-0.5">
                    {m.from_admin ? t('jgasflow_team') : m.author || t('you_label')} · {fDateTime(m.created_at)}
                  </div>
                  {m.body && <div className="text-[14px] whitespace-pre-line [overflow-wrap:anywhere]">{m.body}</div>}
                  {m.files > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Array.from({ length: m.files }, (_, k) => (
                        <SecureImage key={k} src={`/support/files/${m.id}/${k}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {d.status === 'closed' ? (
              <div className="flex items-center gap-2 rounded-[var(--radius-ctl)] bg-bg px-3 py-2.5 text-[13px] text-muted">
                <CheckCircle2 className="size-4 text-good" /> {t('request_closed')}
              </div>
            ) : null}
            <div className="pt-2 space-y-2.5">
              <Textarea label={d.status === 'closed' ? t('reopen_with_message') : t('your_reply')} rows={3} value={msg} onChange={setMsg} maxLength={3000} />
              <ScreenshotPicker files={shots} onChange={setShots} />
              <div className="flex justify-end">
                <Button icon={Send} loading={reply.isPending} onClick={() => (msg.trim() || shots.length ? reply.mutate() : toast(t('message_needed'), 'error'))}>
                  {t('send_reply')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Async>
    </Modal>
  );
}
