import type { Logger } from '../../lib/logger';

export type ReportProcessor = (reportId: string, signal: AbortSignal) => Promise<void>;

/**
 * Cola de trabajos en proceso con concurrencia limitada.
 * El estado durable vive en la base de datos (status/stage de cada reporte); al arrancar,
 * `recover` reencola los reportes QUEUED y marca como fallidos los que quedaron a medias.
 */
export class ReportQueue {
  private readonly pending: string[] = [];
  private readonly running = new Map<string, AbortController>();
  private stopped = false;

  constructor(
    private readonly processor: ReportProcessor,
    private readonly options: { concurrency: number; timeoutMs: number; logger: Logger },
  ) {}

  get size(): { pending: number; running: number } {
    return { pending: this.pending.length, running: this.running.size };
  }

  isActive(reportId: string): boolean {
    return this.running.has(reportId) || this.pending.includes(reportId);
  }

  enqueue(reportId: string): void {
    if (this.stopped || this.isActive(reportId)) return;
    this.pending.push(reportId);
    this.pump();
  }

  /** Cancela un trabajo pendiente o en curso. Devuelve true si estaba en la cola. */
  cancel(reportId: string, reason = 'cancelled'): boolean {
    const index = this.pending.indexOf(reportId);
    if (index >= 0) {
      this.pending.splice(index, 1);
      return true;
    }
    const controller = this.running.get(reportId);
    if (controller) {
      controller.abort(new CancellationError(reason));
      return true;
    }
    return false;
  }

  private pump(): void {
    while (!this.stopped && this.running.size < this.options.concurrency && this.pending.length > 0) {
      const reportId = this.pending.shift()!;
      const controller = new AbortController();
      this.running.set(reportId, controller);
      const timeout = AbortSignal.timeout(this.options.timeoutMs);
      const signal = AbortSignal.any([controller.signal, timeout]);
      this.processor(reportId, signal)
        .catch((error) => this.options.logger.error({ err: error, reportId }, 'report job crashed'))
        .finally(() => {
          this.running.delete(reportId);
          this.pump();
        });
    }
  }

  /** Detiene la cola (apagado ordenado): aborta los trabajos en curso. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.pending.length = 0;
    for (const controller of this.running.values()) controller.abort(new CancellationError('shutdown'));
    const deadline = Date.now() + 10_000;
    while (this.running.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

export class CancellationError extends Error {
  constructor(readonly reason: string) {
    super(`Report generation ${reason}`);
    this.name = 'CancellationError';
  }
}
