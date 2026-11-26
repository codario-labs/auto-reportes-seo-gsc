import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { CancellationError, ReportQueue } from '../report.queue';

const logger = pino({ level: 'silent' });

describe('ReportQueue', () => {
  it('respects the concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    const done: string[] = [];
    const queue = new ReportQueue(
      async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 20));
        active -= 1;
        done.push(id);
      },
      { concurrency: 1, timeoutMs: 5000, logger },
    );
    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueue('a'); // duplicado ignorado
    await new Promise((r) => setTimeout(r, 120));
    expect(done).toEqual(['a', 'b']);
    expect(maxActive).toBe(1);
  });

  it('aborts running jobs on cancel', async () => {
    let reason: unknown;
    const queue = new ReportQueue(
      (_id, signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            reason = signal.reason;
            resolve();
          });
        }),
      { concurrency: 1, timeoutMs: 5000, logger },
    );
    queue.enqueue('job');
    expect(queue.cancel('job')).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(reason).toBeInstanceOf(CancellationError);
    expect(queue.cancel('missing')).toBe(false);
  });

  it('aborts jobs that exceed the timeout', async () => {
    let aborted = false;
    const queue = new ReportQueue(
      (_id, signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        }),
      { concurrency: 1, timeoutMs: 30, logger },
    );
    queue.enqueue('slow');
    await new Promise((r) => setTimeout(r, 100));
    expect(aborted).toBe(true);
  });
});
