import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { errorMessage, post } from '@/lib/api';
import { Button, Field, PasswordInput } from '@/components/ui/core';
import { Modal, useToast } from '@/components/ui/overlay';

export default function ChangePasswordDialog({ open, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const m = useMutation({
    mutationFn: () => post('/auth/change-password', { current_password: form.current_password, new_password: form.new_password }),
    onSuccess: () => {
      toast.success('Password changed');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const mismatch = form.confirm && form.confirm !== form.new_password;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      icon={KeyRound}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!form.current_password || !form.new_password || mismatch} onClick={() => m.mutate()}>
            Change password
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Current password">{(id) => <PasswordInput id={id} autoComplete="current-password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} />}</Field>
        <Field label="New password" hint="8+ characters with upper case, lower case and a number.">
          {(id) => <PasswordInput id={id} autoComplete="new-password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />}
        </Field>
        <Field label="Repeat new password" error={mismatch ? 'Passwords do not match' : undefined}>
          {(id) => <PasswordInput id={id} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  );
}
