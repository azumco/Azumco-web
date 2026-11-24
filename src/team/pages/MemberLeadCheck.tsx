// Team member: "Google check" — the same view founders have, over the leads
// this person can see. Only the leads they added themselves can be checked
// (once a week per lead, within their monthly allowance).

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, BoxInput, Segmented } from '../ui';
import LeadCheckList from '../components/LeadCheckList';
import AddOwnLead from '../components/AddOwnLead';
import type { LeadsResponse, TeamUser } from '../types';

export default function MemberLeadCheck({ user }: { user: TeamUser }) {
  const state = useApi<LeadsResponse>('/leads');
  const [q, setQ] = useState('');
  const leads = state.data?.leads ?? [];
  return (
    <div>
      <div className="mb-6 space-y-4">
        <div>
          <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
            Google <span className="font-serif font-normal italic tracking-normal text-brand">check</span>
          </h1>
          <p className="mt-1 text-fg-2">Check the leads you added against Google Maps.</p>
          <AddOwnLead className="mt-4" />
        </div>
        <Segmented
          className="md:hidden"
          options={[{ value: 'call', label: 'To call' }, { value: 'history', label: 'History' }, { value: 'google', label: 'Google' }]}
          value="google"
          onChange={(v) => navigate(v === 'call' ? '/team' : '/team/history')}
        />
        <BoxInput aria-label="Search leads" placeholder="Search business, phone or city" value={q} onChange={(e) => setQ(e.target.value)} icon={<Search className="h-4 w-4 text-fg-3" />} />
      </div>
      <Async state={state} label="Loading your leads…">
        {() => <LeadCheckList leads={leads} user={user} onChanged={() => void state.reload()} q={q} />}
      </Async>
    </div>
  );
}
