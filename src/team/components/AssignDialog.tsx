import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Button, ChipGroup, ErrorText, Modal } from '../ui';
import type { TeamMember } from '../types';

/** Assign (or unassign) leads. Google leads always get a deadline; manual ones only if chosen. */
export default function AssignDialog({ leadIds, open, onClose, onDone, requireDeadline, defaultHours = 24 }: {
  leadIds: string[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  requireDeadline?: boolean;
  defaultHours?: number;
}) {
  const team = useApi<{ users: TeamMember[] }>(open ? '/team' : null);
  const [assignee, setAssignee] = useState('');
  const [hours, setHours] = useState<string>(String(defaultHours));
  const { busy, error, run } = useAction();
  useEffect(() => {
    if (open) setHours(requireDeadline ? String(defaultHours) : 'none');
  }, [open, requireDeadline, defaultHours]);

  // Only people who can receive leads can be assigned.
  const people = (team.data?.users ?? []).filter((u) => u.canReceiveLeads);
  const submit = async () => {
    const ok = await run(() => api('POST', '/leads/assign', { leadIds, assigneeId: assignee || null, hours: assignee && hours !== 'none' ? Number(hours) : null }));
    if (ok) {
      onDone();
      onClose();
    }
  };
  const hourOptions = [
    { value: '12', label: '12 hours' },
    { value: '24', label: '24 hours' },
    { value: '48', label: '48 hours' },
    ...(requireDeadline ? [] : [{ value: 'none', label: 'No deadline' }]),
  ];

  return (
    <Modal title={leadIds.length > 1 ? `Assign ${leadIds.length}` : 'Assign'} accent="lead" open={open} onClose={onClose}>
      <div className="space-y-6">
        <ChipGroup
          label="Assign to"
          options={[{ value: '', label: 'Keep unassigned' }, ...people.map((u) => ({ value: u.id, label: u.name.split(' ')[0] }))]}
          value={assignee}
          onChange={(v) => setAssignee(v)}
          required
        />
        {assignee && <ChipGroup label="Must call within" options={hourOptions} value={hours} onChange={(v) => setHours(v || hours)} required />}
        {assignee && requireDeadline && <p className="text-xs text-fg-3">Google leads always get a deadline: they go back to Unclaimed if not called in time.</p>}
        <ErrorText>{error}</ErrorText>
        <Button busy={busy} className="w-full" onClick={submit}>
          {assignee ? 'Assign' : 'Move to Unclaimed'}
        </Button>
      </div>
    </Modal>
  );
}
