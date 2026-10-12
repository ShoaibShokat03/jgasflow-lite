import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, KeyRound, Mic, Radio, CheckCircle2, XCircle, Save, Wrench } from 'lucide-react';
import { errorMessage, get, patch, post } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Button, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Spinner, PasswordInput } from '@/components/ui/core';
import { useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/status';

/** Provider key, model and voice settings for the assistant (stored encrypted). */
export default function AiSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['ai-settings'], queryFn: () => get('/assistant/settings') });
  const caps = useQuery({ queryKey: ['ai-caps'], queryFn: () => get('/assistant/capabilities') });
  const [f, setF] = useState(null);
  const [test, setTest] = useState(null);
  useEffect(() => {
    if (q.data) setF({ api_key: '', model: q.data.model, max_output_tokens: q.data.max_output_tokens, voice_enabled: q.data.voice_enabled, voice_api_key: '', voice_name: q.data.voice_name, voice_speed: q.data.voice_speed, live_enabled: q.data.live_enabled, live_model: q.data.live_model });
  }, [q.data]);
  const models = useQuery({ queryKey: ['ai-models'], queryFn: () => get('/assistant/settings/models'), enabled: !!q.data?.configured, retry: false });

  const save = useMutation({
    mutationFn: () => patch('/assistant/settings', Object.fromEntries(Object.entries(f).filter(([k, v]) => !((k === 'api_key' || k === 'voice_api_key') && v === '')).map(([k, v]) => [k, ['max_output_tokens', 'voice_speed'].includes(k) ? Number(v) : v]))),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['ai-settings'] }), qc.invalidateQueries({ queryKey: ['ai-caps'] }), toast.success('AI settings saved')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const testM = useMutation({ mutationFn: () => post('/assistant/settings/test', { api_key: f.api_key || undefined, model: f.model }), onSuccess: setTest, onError: (e) => setTest({ ok: false, error: errorMessage(e) }) });

  if (q.isLoading || !f) return <div className="py-24 grid place-items-center"><Spinner /></div>;
  const s = q.data;
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  return (
    <div>
      <PageHeader title="AI assistant" badge={s.configured ? <Badge tone="green">Connected</Badge> : <Badge tone="amber">Not configured</Badge>} actions={<Button variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader icon={KeyRound} title="Provider" subtitle={`Key source: ${s.key_source}${s.updated_at ? ` · updated ${fmtDateTime(s.updated_at)}${s.updated_by_name ? ` by ${s.updated_by_name}` : ''}` : ''}`} />
            <div className="grid sm:grid-cols-2 gap-3.5 px-4 pb-4">
              <Field label="API key" span={2} hint={s.api_key_masked ? `Current: ${s.api_key_masked}. Leave empty to keep it.` : 'Stored encrypted; never shown again.'}>{(id) => <PasswordInput id={id} autoComplete="off" value={f.api_key} onChange={set('api_key')} placeholder={s.api_key_masked ?? 'Paste key…'} />}</Field>
              <Field label="Model">
                {(id) => models.data?.length ? (
                  <Select id={id} value={f.model} onChange={set('model')}>{models.data.map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}</Select>
                ) : <Input id={id} value={f.model} onChange={set('model')} />}
              </Field>
              <Field label="Max output tokens">{(id) => <Input id={id} type="number" min="256" max="32000" value={f.max_output_tokens} onChange={set('max_output_tokens')} />}</Field>
              <div className="sm:col-span-2 flex items-center gap-3">
                <Button icon={Wrench} loading={testM.isPending} onClick={() => testM.mutate()}>Test connection</Button>
                {test && (test.ok ? <span className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" />Works, {test.model} in {test.latency_ms} ms</span> : <span className="flex items-center gap-1.5 text-sm text-danger"><XCircle className="size-4" />{test.error}</span>)}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader icon={Mic} title="Voice" />
            <div className="grid sm:grid-cols-2 gap-3.5 px-4 pb-4">
              <div className="sm:col-span-2"><Checkbox label="Enable voice mode" checked={f.voice_enabled} onChange={set('voice_enabled')} /></div>
              <Field label="Voice API key" span={2} hint={s.voice_api_key_masked ? `Current: ${s.voice_api_key_masked}` : undefined}>{(id) => <PasswordInput id={id} autoComplete="off" value={f.voice_api_key} onChange={set('voice_api_key')} />}</Field>
              <Field label="Voice">{(id) => <Input id={id} value={f.voice_name} onChange={set('voice_name')} />}</Field>
              <Field label="Speed">{(id) => <Input id={id} type="number" min="0.5" max="2" step="0.05" value={f.voice_speed} onChange={set('voice_speed')} />}</Field>
            </div>
          </Card>
          <Card>
            <CardHeader icon={Radio} title="Live conversation" subtitle={s.live_available ? 'Real-time spoken conversation.' : 'Needs a provider key first.'} />
            <div className="grid sm:grid-cols-2 gap-3.5 px-4 pb-4">
              <div className="sm:col-span-2"><Checkbox label="Enable live voice" checked={f.live_enabled} onChange={set('live_enabled')} /></div>
              <Field label="Live model">{(id) => <Input id={id} value={f.live_model} onChange={set('live_model')} />}</Field>
            </div>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader icon={Sparkles} title="What the assistant can do" />
          <ul className="divide-y divide-line border-t border-line">
            {(caps.data?.tools ?? []).map((t) => (
              <li key={t.name} className="px-4 py-2.5">
                <p className="mono text-[12.5px] font-semibold">{t.name}</p>
                <p className="text-xs text-muted line-clamp-2">{t.description}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
