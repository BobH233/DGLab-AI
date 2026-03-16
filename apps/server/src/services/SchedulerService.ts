import type { Session } from "@dglab-ai/shared";
import { createId } from "../lib/ids.js";

type TickProcessor = {
  processTick(sessionId: string, reason: string): Promise<void>;
};

export class SchedulerService {
  private readonly intervalHandles = new Map<string, NodeJS.Timeout>();
  private readonly wakeHandles = new Map<string, NodeJS.Timeout>();
  private readonly pendingReasons = new Map<string, Set<string>>();
  private readonly inFlight = new Set<string>();
  private readonly scheduled = new Set<string>();

  constructor(
    private readonly listSessions: () => Promise<Session[]>,
    private readonly processor: TickProcessor
  ) {}

  async bootstrap(): Promise<void> {
    const sessions = await this.listSessions();
    for (const session of sessions) {
      this.syncSession(session);
    }
  }

  syncSession(session: Session): void {
    this.clearSession(session.id);
    if (session.status !== "active") {
      return;
    }
    if (session.timerState.enabled) {
      const handle = setInterval(() => {
        this.requestTick(session.id, `timer_interval:${createId("interval")}`);
      }, session.timerState.intervalMs);
      this.intervalHandles.set(session.id, handle);
    }
  }

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

  private clearSession(sessionId: string): void {
    const interval = this.intervalHandles.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.intervalHandles.delete(sessionId);
    }
    const wake = this.wakeHandles.get(sessionId);
    if (wake) {
      clearTimeout(wake);
      this.wakeHandles.delete(sessionId);
    }
  }
}
