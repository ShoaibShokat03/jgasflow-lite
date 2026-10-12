import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorSmartphone, LogOut } from 'lucide-react';
import { errorMessage, get, post } from '@/lib/api';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { Button, EmptyState, PageHeader } from '@/components/ui/core';
import { DataTable } from '@/components/ui/table';
import { useToast } from '@/components/ui/overlay';

const device = (ua = '') => {
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
};

export default function SessionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin-sessions'], queryFn: () => get('/admin/sessions'), refetchInterval: 30_000 });
  const revoke = useMutation({
    mutationFn: (id) => post(`/admin/sessions/${id}/revoke`),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['admin-sessions'] }), toast.success('Session ended')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageHeader title="Active sessions" />
      <DataTable
        columns={[
          { key: 'user', header: 'User', mobile: true, render: (s) => <span className="font-medium">{s.user?.full_name || s.user?.username}</span> },
          { key: 'device', header: 'Device', mobile: true, render: (s) => <span className="flex items-center gap-2"><MonitorSmartphone className="size-4 text-faint" />{device(s.user_agent)}</span> },
          { key: 'ip', header: 'IP', render: (s) => <span className="mono text-xs">{s.ip}</span> },
          { key: 'created', header: 'Signed in', render: (s) => fmtDateTime(s.created_at) },
          { key: 'last', header: 'Last active', render: (s) => fmtRelative(s.last_used_at) },
          { key: 'a', header: '', align: 'right', render: (s) => <Button variant="ghost" size="sm" icon={LogOut} onClick={(e) => (e.stopPropagation(), revoke.mutate(s.id))}>End</Button> },
        ]}
        rows={q.data}
        loading={q.isLoading}
        empty={<EmptyState icon={MonitorSmartphone} title="No active sessions" />}
      />
    </div>
  );
}
