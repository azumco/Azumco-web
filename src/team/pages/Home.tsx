import { Eyebrow } from '../../components/ui';
import { formatDate } from '../../../shared/time';
import type { TeamUser } from '../TeamApp';
import { Card } from '../ui';

const ROLE_LABEL = { super_admin: 'Super admin', admin: 'Founder', employee: 'Team member' } as const;

/** Phase 1 landing page. Leads, bookings and dashboards arrive in later phases. */
export default function Home({ user }: { user: TeamUser }) {
  return (
    <div>
      <Eyebrow>{ROLE_LABEL[user.role]}</Eyebrow>
      <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-6xl">
        Hello, <span className="font-serif font-normal italic tracking-normal text-brand">{user.name.split(' ')[0]}</span>
      </h1>
      <p className="mt-4 text-fg-2">{formatDate(new Date())}</p>
      <Card className="mt-10">
        <p className="text-fg-2">Your workspace is being set up. Leads, bookings and dashboards will appear here.</p>
      </Card>
    </div>
  );
}
