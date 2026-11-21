// Employee: follow-ups that are overdue or due today, then upcoming.

import { useApi, useServerNow } from '../hooks';
import { Async, Empty, PageHeader } from '../ui';
import LeadCard from '../components/LeadCard';
import type { Lead, LeadsResponse } from '../types';

function Section({ title, leads, now }: { title: string; leads: Lead[]; now: number }) {
  if (!leads.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-[0.18em] text-fg-3">
        {title} · {leads.length}
      </h2>
      {leads.map((l) => (
        <LeadCard key={l.id} lead={l} now={now} />
      ))}
    </section>
  );
}

export default function FollowUps() {
  const state = useApi<LeadsResponse>('/leads');
  const now = useServerNow(state.data?.serverNow);
  return (
    <div>
      <PageHeader eyebrow="Your workspace" title="Follow" accent="-ups" />
      <Async state={state}>
        {({ leads }) => {
          const by = (k: Lead['followUp']) => leads.filter((l) => l.followUp === k).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
          const overdue = by('overdue');
          const today = by('today');
          const upcoming = by('upcoming');
          if (!overdue.length && !today.length && !upcoming.length) {
            return <Empty title="No follow-ups scheduled">Set a follow-up date when you log a call and it will show here.</Empty>;
          }
          return (
            <div className="space-y-8">
              <Section title="Overdue" leads={overdue} now={now} />
              <Section title="Due today" leads={today} now={now} />
              <Section title="Upcoming" leads={upcoming} now={now} />
            </div>
          );
        }}
      </Async>
    </div>
  );
}
