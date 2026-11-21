// Team member follow-ups: Today / This week / Overdue, with live counts.
// Laptop reuses the Queue layout (list + Log a call panel).

import { useState } from 'react';
import { addDays } from '../../../shared/slots';
import { formatDate, istDate } from '../../../shared/time';
import { useApi } from '../hooks';
import { Async, ChoiceChip, Tag } from '../ui';
import Workspace, { LeadRow } from '../components/Workspace';
import { shortLabel } from './LeadDetail';
import type { Lead, LeadsResponse, TeamUser } from '../types';

type Chip = 'today' | 'week' | 'overdue';
const EMPTY: Record<Chip, string> = { today: 'Nothing due today.', week: 'Nothing else this week.', overdue: 'Nothing overdue.' };

export default function FollowUps({ user }: { user: TeamUser }) {
  const state = useApi<LeadsResponse>('/leads');
  const [chip, setChip] = useState<Chip>('today');
  const today = istDate();
  const weekEnd = addDays(today, 7);

  return (
    <Async state={state} label="Loading follow-ups…">
      {({ leads }) => {
        const withDate = leads.filter((l) => l.followUpDate && l.status !== 'Won' && l.status !== 'Lost');
        const groups: Record<Chip, Lead[]> = {
          today: withDate.filter((l) => l.followUpDate === today),
          week: withDate.filter((l) => l.followUpDate > today && l.followUpDate < weekEnd),
          overdue: withDate.filter((l) => l.followUpDate < today),
        };
        const list = [...groups[chip]].sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
        const total = groups.today.length + groups.week.length + groups.overdue.length;
        const header = (
          <div className="mb-4">
            <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em]">
              Your <span className="font-serif font-normal italic tracking-normal text-brand">follow-ups</span>
            </h1>
            <p className="mt-1 text-fg-2">{total ? `${total} ${total === 1 ? 'person' : 'people'} to get back to.` : 'Nobody to get back to right now.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ChoiceChip on={chip === 'today'} onClick={() => setChip('today')}>Today · {groups.today.length}</ChoiceChip>
              <ChoiceChip on={chip === 'week'} onClick={() => setChip('week')}>This week · {groups.week.length}</ChoiceChip>
              <ChoiceChip on={chip === 'overdue'} onClick={() => setChip('overdue')}>Overdue · {groups.overdue.length}</ChoiceChip>
            </div>
          </div>
        );
        return (
          <Workspace
            user={user}
            leads={list}
            header={header}
            onChanged={() => void state.reload()}
            renderList={(selected, open) =>
              list.length === 0 ? (
                <p className="px-1 py-3 text-sm text-fg-3">{EMPTY[chip]}</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((l) => (
                    <LeadRow
                      key={l.id}
                      title={shortLabel(l)}
                      sub={[l.nextStep, l.lastNote].filter(Boolean).join(' · ') || 'No next step noted'}
                      right={
                        l.followUpDate === today ? <Tag tone="brand" dot={false}>Today</Tag> : l.followUpDate < today ? <Tag tone="bad" dot={false}>{formatDate(l.followUpDate).slice(0, 6)}</Tag> : <Tag dot={false}>{new Date(`${l.followUpDate}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} {formatDate(l.followUpDate).slice(0, 6)}</Tag>
                      }
                      selected={selected === l.id}
                      onOpen={() => open(l.id)}
                    />
                  ))}
                </ul>
              )
            }
          />
        );
      }}
    </Async>
  );
}
