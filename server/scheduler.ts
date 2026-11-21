// In-process scheduler for the maintenance sweep. Replaces the need for an
// external cron: one catch-up run shortly after boot (a service that just woke
// from sleep processes anything overdue), then one run every interval.
//
// - Overlap guard: a tick that arrives while a run is still going is skipped.
// - Errors are logged (message only, trimmed) and never escape: a failed run
//   never crashes the server and never stops later ticks.
// - The task itself (runMaintenance) goes through the Db write queue and is
//   idempotent, so it is safe alongside the manual /api/maintenance/run trigger.
// - Timers are unref'd, so they never keep a process alive on their own.
// - It only runs while the process is awake; on a sleeping free instance the
//   catch-up run handles whatever became due in the meantime.

import { log } from './lib/log.ts';

export interface SchedulerOptions {
  name: string;
  task: () => Promise<Record<string, unknown> | void>;
  intervalMs: number;
  startDelayMs: number;
}

export interface Scheduler {
  /** Run once now, unless a run is already in progress. Resolves to whether it ran. */
  tick: (reason: string) => Promise<'ran' | 'failed' | 'skipped' | 'stopped'>;
  stop: () => void;
  readonly running: boolean;
}

export const MAINTENANCE_INTERVAL_MS = 15 * 60_000;
export const MAINTENANCE_START_DELAY_MS = 10_000;

export function startScheduler(opts: SchedulerOptions): Scheduler {
  let running = false;
  let stopped = false;

  const tick: Scheduler['tick'] = async (reason) => {
    if (stopped) return 'stopped';
    if (running) {
      log.warn('scheduler: previous run still in progress; skipping this tick', { name: opts.name, reason });
      return 'skipped';
    }
    running = true;
    const started = Date.now();
    try {
      const result = await opts.task();
      log.info('scheduler: run complete', { name: opts.name, reason, ms: Date.now() - started, ...(result ?? {}) });
      return 'ran';
    } catch (err) {
      log.error('scheduler: run failed', { name: opts.name, reason, error: String((err as Error)?.message ?? err).slice(0, 200) });
      return 'failed';
    } finally {
      running = false;
    }
  };

  const startTimer = setTimeout(() => void tick('startup'), opts.startDelayMs);
  const interval = setInterval(() => void tick('interval'), opts.intervalMs);
  startTimer.unref?.();
  interval.unref?.();

  return {
    tick,
    stop() {
      stopped = true;
      clearTimeout(startTimer);
      clearInterval(interval);
    },
    get running() {
      return running;
    },
  };
}
