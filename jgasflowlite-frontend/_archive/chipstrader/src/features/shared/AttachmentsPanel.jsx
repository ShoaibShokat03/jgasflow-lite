import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, UploadCloud, Download, Trash2, FileText, FileImage, FileSpreadsheet } from 'lucide-react';
import { errorMessage, get, openBlob, post, upload } from '@/lib/api';
import { fmtBytes, fmtRelative } from '@/lib/format';
import { useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui/core';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';

const iconFor = (mime = '') => (mime.startsWith('image/') ? FileImage : /sheet|excel|csv/.test(mime) ? FileSpreadsheet : FileText);

/** Drag-and-drop files onto any record. Stored outside the web root. */
export function AttachmentsPanel({ table, id }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useMe();
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [removing, setRemoving] = useState(null);
  const key = ['attachments', table, id];
  const q = useQuery({ queryKey: key, queryFn: () => get('/attachments', { table, id }) });

  const up = useMutation({
    mutationFn: async (files) => {
      for (const f of files) await upload('/attachments', f, { table, id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success('Uploaded');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (fid) => post(`/attachments/${fid}/archive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setRemoving(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const canUpload = can('file.upload');

  return (
    <Card
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (canUpload && e.dataTransfer.files.length) up.mutate([...e.dataTransfer.files]);
      }}
      className={cn('transition-colors', drag && 'ring-2 ring-brand-500 bg-brand-50/40')}
    >
      <CardHeader
        icon={Paperclip}
        title="Files"
        actions={
          canUpload && (
            <>
              <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files.length && up.mutate([...e.target.files], { onSettled: () => (e.target.value = '') })} />
              <Button size="sm" icon={UploadCloud} loading={up.isPending} onClick={() => input.current?.click()}>
                Upload
              </Button>
            </>
          )
        }
      />
      {q.data?.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {q.data.map((f) => {
            const Icon = iconFor(f.mime_type);
            return (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 group">
                <div className="grid place-items-center size-9 rounded-lg bg-surface-3 text-muted"><Icon className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium truncate">{f.original_name}</p>
                  <p className="text-xs text-muted">{fmtBytes(f.size_bytes)} · {fmtRelative(f.created_at)}</p>
                </div>
                <Button variant="ghost" size="sm" icon={Download} onClick={() => openBlob(`/attachments/${f.id}/download`, { download: true, filename: f.original_name })} aria-label="Download" />
                {canUpload && <Button variant="ghost" size="sm" icon={Trash2} className="" onClick={() => setRemoving(f)} aria-label="Remove" />}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={UploadCloud} title={q.isLoading ? 'Loading…' : 'No files yet'}>{canUpload ? 'Drop files here or use Upload.' : ''}</EmptyState>
      )}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} danger title="Remove file?" message={removing?.original_name} confirmLabel="Remove" loading={del.isPending} onConfirm={() => del.mutate(removing.id)} />
    </Card>
  );
}
