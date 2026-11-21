// One-time seed data (expenses, project, goals). Each set is inserted once,
// guarded by a Meta row, so restarts never duplicate it. Fictional nothing:
// these are the company's own records from the brief — no customer data.

import type { Db } from './sheets/db.ts';
import { log } from './lib/log.ts';
import { COMPANY_FUND } from '../shared/rules.ts';

/** Map a first name from the brief to the team member's full name, when one exists. */
function person(users: Record<string, string>[], first: string): string {
  return users.find((u) => u.name.toLowerCase().split(' ')[0] === first.toLowerCase())?.name ?? first;
}

async function once(db: Db, key: string, insert: () => Promise<void>) {
  const meta = await db.all('Meta');
  if (meta.some((m) => m.key === key)) return;
  await insert();
  await db.insert('Meta', { key, value: new Date().toISOString() }, 'system');
  log.info('seed applied', { key });
}

export async function seed(db: Db): Promise<void> {
  const users = await db.all('Users');
  const p = (first: string) => person(users, first);

  await once(db, 'seed:finance:v1', async () => {
    await db.exclusive(async () => {
      await db.insertManyUnqueued('Expenses', [
        { date: '2026-08-17', item: 'Company SIM card', amount: '150', paidBy: p('Ayan'), project: 'General', repaid: 'FALSE' },
        { date: '2026-11-14', item: 'Domain purchase', amount: '1295', paidBy: COMPANY_FUND, project: 'Zevia', repaid: 'FALSE' },
        { date: '2026-11-14', item: 'SIM recharge', amount: '99', paidBy: COMPANY_FUND, project: 'Zevia', repaid: 'FALSE' },
      ], 'system');
      await db.insertManyUnqueued('Projects', [{ name: 'Zevia', dealTotal: '8000', received: '4000', status: 'Active' }], 'system');
    });
  });

  // Quote from the company secretary (Baani Consultancy). The CS fee is ₹8,500
  // with GST registration, ₹7,000 without (the ₹1,500 is not charged if GST
  // is not applicable).
  await once(db, 'seed:milestone:v1', async () => {
    await db.exclusive(async () => {
      const [m] = await db.insertManyUnqueued('Milestones', [{
        name: 'Register Azumco as a Private Limited Company',
        provider: 'Baani Consultancy (CS)',
        gstIncluded: 'TRUE',
        targetOverride: '',
        notes: 'Quote from our CS, Baani Consultancy.',
      }], 'system');
      await db.insertManyUnqueued('MilestoneItems', [
        { milestoneId: m.id, sortOrder: '1', paid: 'FALSE', label: 'CS professional fee (certificate of incorporation, company PAN, TAN and GST registration)', amount: '8500', amountWithoutGst: '7000', note: '₹7,000 if GST registration is not included' },
        { milestoneId: m.id, sortOrder: '2', paid: 'FALSE', label: 'Government fee: name application', amount: '1000', amountWithoutGst: '', note: '' },
        { milestoneId: m.id, sortOrder: '3', paid: 'FALSE', label: 'Government fee: incorporation (up to ₹10,00,000 authorised capital)', amount: '7693', amountWithoutGst: '', note: '₹7,550 + ₹143' },
        { milestoneId: m.id, sortOrder: '4', paid: 'FALSE', label: 'Digital signature certificates for directors', amount: '0', amountWithoutGst: '', note: 'confirm amount with the CS' },
      ], 'system');
    });
  });

  await once(db, 'seed:goals:v1', async () => {
    const zeeshan = p('Zeeshan');
    await db.exclusive(() =>
      db.insertManyUnqueued('Goals', [
        { goal: 'Zevia Website', task: 'Build the website', owner: p('Ayan'), support: '', start: '2026-11-16', deadline: '2026-11-30', status: 'Not Started' },
        { goal: 'Zevia Website', task: '100% testing + rework', owner: p('Ayan'), support: `${p('Yameen')}; ${zeeshan}`, start: '2026-11-16', deadline: '2026-12-05', status: 'Not Started' },
        { goal: 'Gym Client', task: 'Close the deal with gym owner', owner: p('Yameen'), support: '', start: '', deadline: '2026-11-30', status: 'Not Started' },
        { goal: 'Company Setup', task: 'Talk to CA/CS about registration steps + cost', owner: p('Yameen'), support: '', start: '', deadline: '2026-11-30', status: 'Not Started' },
        { goal: 'Azumco', task: 'Fix Azumco website', owner: zeeshan, support: '', start: '', deadline: '2026-11-30', status: 'Not Started' },
        { goal: 'Azumco', task: 'Create domain emails', owner: zeeshan, support: '', start: '', deadline: '2026-11-30', status: 'Not Started' },
        { goal: 'Gym Software', task: 'Build gym software after deal is confirmed', owner: zeeshan, support: '', start: '', deadline: '', status: 'On Hold' },
      ], 'system'),
    );
  });
}
