import { describe, expect, it } from 'vitest';
import { MemoryBackend } from '../sheets/backend.ts';
import { ConflictError, Db } from '../sheets/db.ts';
import { columnsOf } from '../sheets/schema.ts';
import { withRetry, SheetsHttpError } from '../sheets/google.ts';

async function freshDb(now?: () => Date) {
  const backend = new MemoryBackend();
  const db = new Db(backend, { now });
  await db.ensureSchema();
  return { backend, db };
}

describe('Db', () => {
  it('creates every tab with its header, and is idempotent', async () => {
    const { backend, db } = await freshDb();
    await db.ensureSchema();
    const [users] = await backend.readTabs(['Users']);
    expect(users).toEqual([columnsOf('Users')]);
  });

  it('adds new schema columns to an existing tab without touching existing data', async () => {
    const backend = new MemoryBackend();
    await backend.addTabs(['Settings']);
    await backend.writeRanges([{ range: "'Settings'!A1", values: [['id', 'key'], ['s1', 'k']] }]);
    const db = new Db(backend);
    await db.ensureSchema();
    const [grid] = await backend.readTabs(['Settings']);
    expect(grid[0]).toEqual(['id', 'key', 'createdAt', 'updatedAt', 'updatedBy', 'value']);
    expect((await db.all('Settings'))[0]).toMatchObject({ id: 's1', key: 'k', value: '' });
  });

  it('maps columns by header name, so hand-reordered columns still work', async () => {
    const { backend, db } = await freshDb();
    const row = await db.insert('Settings', { key: 'a', value: '1' }, 'u1');
    // Swap two columns by hand, as a human might in the spreadsheet.
    const [grid] = await backend.readTabs(['Settings']);
    const swapped = grid.map((r) => [r[5], r[4], r[0], r[1], r[2], r[3]]);
    await backend.writeRanges([{ range: "'Settings'!A1", values: swapped }]);
    db.invalidate();
    expect(await db.find('Settings', row.id)).toMatchObject({ key: 'a', value: '1' });
    await db.update('Settings', row.id, { value: '2' }, 'u1');
    db.invalidate();
    expect(await db.find('Settings', row.id)).toMatchObject({ key: 'a', value: '2' });
  });

  it('serves repeat reads from cache and refreshes after a write', async () => {
    const { backend, db } = await freshDb();
    await db.all('Users');
    const reads = backend.calls.read;
    await db.all('Users');
    await db.all('Users');
    expect(backend.calls.read).toBe(reads);
    const u = await db.insert('Users', { email: 'a@example.test' }, 'x');
    expect((await db.all('Users')).map((r) => r.id)).toContain(u.id);
  });

  it('rejects a stale edit (optimistic concurrency)', async () => {
    const { db } = await freshDb();
    const row = await db.insert('Settings', { key: 'k', value: '1' }, 'a');
    await db.update('Settings', row.id, { value: '2' }, 'a', row.updatedAt);
    await expect(db.update('Settings', row.id, { value: '3' }, 'b', row.updatedAt)).rejects.toBeInstanceOf(ConflictError);
  });

  it('changes updatedAt on every write, even within the same millisecond', async () => {
    const fixed = new Date('2026-11-21T10:00:00.000Z');
    const { db } = await freshDb(() => fixed);
    const row = await db.insert('Settings', { key: 'k', value: '1' }, 'a');
    const one = await db.update('Settings', row.id, { value: '2' }, 'a');
    const two = await db.update('Settings', row.id, { value: '3' }, 'a');
    expect(new Set([row.updatedAt, one.after.updatedAt, two.after.updatedAt]).size).toBe(3);
  });

  it('never lets a patch overwrite id or timestamps', async () => {
    const { db } = await freshDb();
    const row = await db.insert('Settings', { key: 'k' }, 'a');
    const { after } = await db.update('Settings', row.id, { id: 'evil', createdAt: 'x', key: 'k2' }, 'a');
    expect(after).toMatchObject({ id: row.id, createdAt: row.createdAt, key: 'k2' });
  });

  it('runs exclusive tasks one at a time (no interleaving check-then-write)', async () => {
    const { db } = await freshDb();
    const counter = await db.insert('Settings', { key: 'counter', value: '0' }, 'a');
    // 20 concurrent read-modify-writes. Without serialization most would read
    // the same value and the final count would be far below 20.
    await Promise.all(
      Array.from({ length: 20 }, () =>
        db.exclusive(async () => {
          const [state] = await db.loadFresh(['Settings']);
          const cur = Number(state.rows.find((r) => r.id === counter.id)!.value);
          await new Promise((r) => setTimeout(r, 1));
          await db.updateUnqueued('Settings', counter.id, { value: String(cur + 1) }, 'a');
        }),
      ),
    );
    db.invalidate();
    expect((await db.find('Settings', counter.id))!.value).toBe('20');
  });

  it('a failing task does not block the queue', async () => {
    const { db } = await freshDb();
    await expect(db.exclusive(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(db.exclusive(async () => 'ok')).resolves.toBe('ok');
  });

  it('deletes by id even after rows above it moved', async () => {
    const { db } = await freshDb();
    const a = await db.insert('Settings', { key: 'a' }, 'x');
    const b = await db.insert('Settings', { key: 'b' }, 'x');
    const c = await db.insert('Settings', { key: 'c' }, 'x');
    await db.remove('Settings', a.id, 'x');
    await db.remove('Settings', c.id, 'x');
    expect((await db.all('Settings')).map((r) => r.key)).toEqual(['b']);
    expect(b.key).toBe('b');
  });
});

describe('withRetry', () => {
  const opts = { retries: 4, baseDelayMs: 1, sleep: async () => {} };

  it('retries 429 and 5xx, then succeeds', async () => {
    let n = 0;
    const result = await withRetry(async () => {
      n++;
      if (n === 1) throw new SheetsHttpError(429, 'quota');
      if (n === 2) throw new SheetsHttpError(503, 'down');
      return 'ok';
    }, opts);
    expect(result).toBe('ok');
    expect(n).toBe(3);
  });

  it('does not retry a 4xx other than 429', async () => {
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw new SheetsHttpError(400, 'bad');
      }, opts),
    ).rejects.toThrow('bad');
    expect(n).toBe(1);
  });

  it('gives up after the retry limit', async () => {
    let n = 0;
    await expect(
      withRetry(async () => {
        n++;
        throw new SheetsHttpError(500, 'down');
      }, opts),
    ).rejects.toThrow('down');
    expect(n).toBe(5);
  });
});
