// Team member: add a lead they found themselves (e.g. online). It is theirs
// straight away, with no expiry timer; the founders are notified.

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { BUSINESS_CATEGORIES, LEAD_SOURCES } from '../../../shared/rules';
import { api } from '../api';
import { useAction } from '../hooks';
import { navigate } from '../router';
import { Button, ChipGroup, ErrorText, Field, Modal, SearchableSelect } from '../ui';

const SOURCES = LEAD_SOURCES.filter((s) => s !== 'Google Places');
const BLANK = { businessName: '', category: '', contactPerson: '', phone: '', area: '', city: '', websiteOrInstagram: '', source: '', serviceInterest: '' };

export default function AddOwnLead({ className = '', primary = false }: { className?: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(BLANK);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof BLANK) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => api<{ id: string }>('POST', '/leads', f));
    if (r) {
      setF(BLANK);
      setOpen(false);
      navigate(`/team/leads/${r.id}`);
    }
  };

  return (
    <>
      <Button variant={primary ? 'primary' : 'secondary'} size={primary ? 'md' : 'sm'} className={className} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add a lead
      </Button>
      <Modal title="Add a" accent="lead" subtitle="Found a business yourself? It's yours to call. The founders are told." open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={submit} className="space-y-5">
          <Field label="Business name" required value={f.businessName} onChange={set('businessName')} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SearchableSelect label="Business type" value={f.category} options={BUSINESS_CATEGORIES} allowCustom onChange={(v) => setF({ ...f, category: v })} />
            <Field label="Area" placeholder="e.g. MP Nagar" value={f.area} onChange={set('area')} />
          </div>
          <Field label="City" value={f.city} onChange={set('city')} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact person" value={f.contactPerson} onChange={set('contactPerson')} />
            <Field label="Phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} />
          </div>
          <Field label="Website / Instagram" value={f.websiteOrInstagram} onChange={set('websiteOrInstagram')} />
          <ChipGroup label="Where did you find it?" options={SOURCES} value={f.source as (typeof SOURCES)[number] | ''} onChange={(v) => setF({ ...f, source: v })} />
          <Field label="What might they need?" placeholder="e.g. a website, Instagram ads" value={f.serviceInterest} onChange={set('serviceInterest')} />
          <ErrorText>{error}</ErrorText>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" busy={busy} disabled={!f.businessName.trim()}>Add lead</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
