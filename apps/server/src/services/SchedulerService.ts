type TickProcessor = {
  processTick(sessionId: string, reason: string): Promise<void>;
};

export class SchedulerService {
  private readonly pendingReasons = new Map<string, Set<string>>();
  private readonly inFlight = new Set<string>();
  private readonly scheduled = new Set<string>();

  constructor(private readonly processor: TickProcessor) {}

  syncSession(): void {}

  requestTick(sessionId: string, reason: string): void {
    const set = this.pendingReasons.get(sessionId) ?? new Set<string>();
    set.add(reason);
    this.pendingReasons.set(sessionId, set);
    if (this.scheduled.has(sessionId)) {
      return;
    }
    this.scheduled.add(sessionId);
    queueMicrotask(() => {
      this.scheduled.delete(sessionId);
      void this.flush(sessionId);
    });
  }

  private async flush(sessionId: string): Promise<void> {
    if (this.inFlight.has(sessionId)) {
      return;
    }
    this.inFlight.add(sessionId);
    try {
      while ((this.pendingReasons.get(sessionId)?.size ?? 0) > 0) {
        const reasons = [...(this.pendingReasons.get(sessionId) ?? new Set<string>())];
        this.pendingReasons.set(sessionId, new Set<string>());
        try {
          await this.processor.processTick(sessionId, reasons.join("; "));
        } catch (error) {
          console.error(`Failed to process tick for session ${sessionId}`, error);
        }
      }
    } finally {
      this.inFlight.delete(sessionId);
    }
  }
}
