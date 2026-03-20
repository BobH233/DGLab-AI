import {
  createEmptyMemoryState,
  createEmptyUsageStats,
  defaultPromptVersions,
  memoryDebugResponseSchema,
  sessionDraftSchema,
  storyStateSchema,
  timerUpdateSchema,
  type LlmConfig,
  type MemoryDebugResponse,
  type Session,
  type SessionDraft,
  type SessionEvent,
  type SseEvent,
  type ToolContext,
  type UpdateDraftRequest
} from "@dglab-ai/shared";
import { HttpError } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import { LockManager } from "../lib/locks.js";
import {
  applyPreviewSnapshotEvent,
  type PreviewTurnSnapshot
} from "../lib/previewTurnState.js";
import { MemoryContextAssembler } from "./MemoryContextAssembler.js";
import { MemoryService } from "./MemoryService.js";
import type {
  ChannelAdapter,
  OrchestratorService,
  PromptTemplateService,
  SessionStore
} from "../types/contracts.js";

type SchedulerLike = {
  syncSession(session: Session): void;
  requestTick(sessionId: string, reason: string): void;
};

function formatRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "模型调用失败，请稍后重试。";
}

function mergeToolContext(base: ToolContext | undefined, next: ToolContext | undefined): ToolContext | undefined {
  if (!base && !next) {
    return undefined;
  }
  return {
    ...(base ?? {}),
    ...(next ?? {})
  };
}

export class SessionService {
  private readonly locks = new LockManager();
  private readonly activeTicks = new Set<string>();
  private readonly previewSnapshots = new Map<string, PreviewTurnSnapshot>();
  private scheduler?: SchedulerLike;

  constructor(
    private readonly store: SessionStore,
    private readonly channel: ChannelAdapter,
    private readonly orchestrator: OrchestratorService,
    private readonly prompts: PromptTemplateService,
    private readonly memoryService: MemoryService,
    private readonly memoryContextAssembler: MemoryContextAssembler
  ) {}

  attachScheduler(scheduler: SchedulerLike): void {
    this.scheduler = scheduler;
  }

  listSessions() {
    return this.store.listSessions();
  }

  async getSession(sessionId: string): Promise<Session> {
    await this.reconcileStaleTick(sessionId);
    return this.getSessionRecord(sessionId);
  }

  getPreviewSnapshot(sessionId: string): PreviewTurnSnapshot | null {
    const snapshot = this.previewSnapshots.get(sessionId);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async getEvents(sessionId: string, cursor?: number, limit?: number): Promise<SessionEvent[]> {
    await this.reconcileStaleTick(sessionId);
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new HttpError(404, "Session not found");
    }
    return this.store.getEvents(sessionId, cursor, limit);
  }

  async getMemoryDebug(sessionId: string): Promise<MemoryDebugResponse> {
    const session = await this.getSession(sessionId);
    const events = await this.getAllEvents(session);
    const reason = session.timerState.queuedReasons.join(", ") || "debug_preview";
    const assembledContext = this.memoryContextAssembler.assemble(session, events, reason);
    return memoryDebugResponseSchema.parse({
      sessionId,
      memoryState: session.memoryState,
      recentRawTurns: assembledContext.recentRawTurns,
      assembledContext,
      storyStateSnapshot: session.storyState,
      queueSnapshot: {
        queuedPlayerMessages: session.timerState.queuedPlayerMessages,
        queuedReasons: session.timerState.queuedReasons
      }
    });
  }

  listSchedulableSessions(): Promise<Session[]> {
    return this.store.listSchedulableSessions();
  }

  async createDraft(playerBrief: string, toolContext?: ToolContext): Promise<Session> {
    const config = await this.store.getConfig();
    const draft = sessionDraftSchema.parse(await this.orchestrator.generateDraft(playerBrief, config, toolContext));
    const now = new Date().toISOString();
    const session: Session = {
      id: createId("session"),
      status: "draft",
      title: draft.title,
      initialPrompt: playerBrief,
      draft,
      confirmedSetup: null,
      playerBodyItemState: draft.initialPlayerBodyItemState,
      storyState: storyStateSchema.parse({
        location: "未揭示",
        phase: "draft",
        tension: 3,
        summary: draft.openingSituation,
        activeObjectives: draft.sceneGoals
      }),
      agentStates: Object.fromEntries(
        draft.agents.map((agent) => [agent.id, { mood: "focused", intent: "observe" }])
      ),
      memoryState: createEmptyMemoryState(),
      timerState: {
        enabled: false,
        intervalMs: 10000,
        inFlight: false,
        queuedReasons: [],
        queuedPlayerMessages: [],
        pendingWaits: []
      },
      usageTotals: createEmptyUsageStats(),
      toolContext,
      createdAt: now,
      updatedAt: now,
      lastSeq: 0
    };
    await this.store.createSession(session);
    const events = await this.store.appendEvents(session.id, session.lastSeq, [
      {
        type: "session.created",
        source: "system",
        createdAt: now,
        payload: {
          title: draft.title,
          initialPrompt: playerBrief
        }
      },
      {
        type: "draft.generated",
        source: "system",
        createdAt: now,
        payload: {
          draft
        }
      }
    ]);
    session.lastSeq = events.length;
    await this.store.replaceSession(session);
    this.publishSession(session, events);
    return session;
  }

  async updateDraft(sessionId: string, patch: UpdateDraftRequest): Promise<Session> {
    return this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSessionRecord(sessionId);
      if (session.status !== "draft") {
        throw new HttpError(400, "Only draft sessions can be edited");
      }
      session.draft = sessionDraftSchema.parse({
        ...session.draft,
        ...patch
      });
      session.playerBodyItemState = session.draft.initialPlayerBodyItemState;
      session.title = session.draft.title;
      session.updatedAt = new Date().toISOString();
      const events = await this.store.appendEvents(sessionId, session.lastSeq, [
        {
          type: "draft.updated",
          source: "system",
          createdAt: session.updatedAt,
          payload: patch
        }
      ]);
      session.lastSeq += events.length;
      await this.store.replaceSession(session);
      this.publishSession(session, events);
      return session;
    });
  }

  async confirmSession(sessionId: string, toolContext?: ToolContext): Promise<Session> {
    return this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSessionRecord(sessionId);
      if (session.status !== "draft") {
        throw new HttpError(400, "Session is already confirmed");
      }
      const config = await this.store.getConfig();
      const versions = this.prompts.versions();
      session.status = "active";
      session.confirmedSetup = session.draft;
      session.playerBodyItemState = session.draft.initialPlayerBodyItemState;
      session.toolContext = mergeToolContext(session.toolContext, toolContext);
      session.llmConfigSnapshot = config;
      session.promptVersions = {
        ...defaultPromptVersions(),
        sharedSafety: versions.shared_safety_preamble ?? "1.3.0",
        toolContract: versions.tool_contract ?? "3.0.0",
        worldBuilder: versions.world_builder ?? "1.6.0",
        ensembleTurn: versions.ensemble_turn ?? "1.6.0"
      };
      session.storyState = {
        ...session.storyState,
        phase: "opening",
        summary: session.draft.openingSituation
      };
      session.updatedAt = new Date().toISOString();
      const events = await this.store.appendEvents(sessionId, session.lastSeq, [
        {
          type: "session.confirmed",
          source: "system",
          createdAt: session.updatedAt,
          payload: {
            confirmedAt: session.updatedAt
          }
        },
        ...(session.playerBodyItemState.length > 0 ? [{
          type: "player.body_item_state_updated" as const,
          source: "system" as const,
          createdAt: session.updatedAt,
          payload: {
            previousPlayerBodyItemState: [],
            playerBodyItemState: session.playerBodyItemState,
            reason: "session_confirmed"
          }
        }] : [])
      ]);
      session.lastSeq += events.length;
      await this.store.replaceSession(session);
      this.publishSession(session, events);
      this.scheduler?.syncSession(session);
      this.scheduler?.requestTick(sessionId, "session_confirmed");
      return session;
    });
  }

  async postPlayerMessage(sessionId: string, text: string): Promise<Session> {
    return this.postPlayerMessageWithContext(sessionId, text);
  }

  async postPlayerMessageWithContext(sessionId: string, text: string, toolContext?: ToolContext): Promise<Session> {
    return this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSessionRecord(sessionId);
      if (session.status !== "active") {
        throw new HttpError(400, "Session is not active");
      }
      const now = new Date().toISOString();
      session.storyState.lastPlayerMessageAt = now;
      session.toolContext = mergeToolContext(session.toolContext, toolContext);
      session.timerState.queuedPlayerMessages.push(text);
      session.timerState.queuedReasons.push("player_message");
      session.updatedAt = now;
      const events = await this.store.appendEvents(sessionId, session.lastSeq, [
        {
          type: "player.message",
          source: "player",
          createdAt: now,
          payload: {
            text
          }
        }
      ]);
      session.lastSeq += events.length;
      await this.store.replaceSession(session);
      this.publishSession(session, events);
      this.scheduler?.requestTick(sessionId, "player_message");
      return session;
    });
  }

  async updateTimer(sessionId: string, update: unknown): Promise<Session> {
    const patch = timerUpdateSchema.parse(update);
    return this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSessionRecord(sessionId);
      if (session.status !== "active") {
        throw new HttpError(400, "Session is not active");
      }
      const now = new Date().toISOString();
      session.timerState.enabled = patch.enabled;
      if (patch.intervalMs) {
        session.timerState.intervalMs = patch.intervalMs;
      }
      session.timerState.nextTickAt = patch.enabled
        ? new Date(Date.now() + session.timerState.intervalMs).toISOString()
        : undefined;
      session.updatedAt = now;
      const events = await this.store.appendEvents(sessionId, session.lastSeq, [
        {
          type: "system.timer_updated",
          source: "system",
          createdAt: now,
          payload: {
            enabled: session.timerState.enabled,
            intervalMs: session.timerState.intervalMs,
            nextTickAt: session.timerState.nextTickAt
          }
        }
      ]);
      session.lastSeq += events.length;
      await this.store.replaceSession(session);
      this.publishSession(session, events);
      this.channel.publish({
        type: "timer.updated",
        sessionId,
        payload: {
          timerState: session.timerState
        }
      });
      this.scheduler?.syncSession(session);
      return session;
    });
  }

  async retrySession(sessionId: string, toolContext?: ToolContext): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (session.status !== "active") {
      throw new HttpError(400, "Session is not active");
    }
    if (toolContext) {
      await this.locks.runExclusive(sessionId, async () => {
        const current = await this.getSessionRecord(sessionId);
        current.toolContext = mergeToolContext(current.toolContext, toolContext);
        current.updatedAt = new Date().toISOString();
        await this.store.replaceSession(current);
        this.publishSession(current, []);
      });
    }
    if (this.scheduler) {
      this.scheduler.requestTick(sessionId, "manual_retry");
      return this.getSession(sessionId);
    }
    await this.processTick(sessionId, "manual_retry");
    return this.getSession(sessionId);
  }

  async requestAutoTick(sessionId: string, toolContext?: ToolContext): Promise<Session> {
    const reason = `timer_interval:frontend`;
    let shouldProcessImmediately = false;
    const session = await this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSessionRecord(sessionId);
      if (session.status !== "active" || !session.timerState.enabled || session.timerState.inFlight) {
        return session;
      }

      session.toolContext = mergeToolContext(session.toolContext, toolContext);

      const nextTickAt = session.timerState.nextTickAt ? Date.parse(session.timerState.nextTickAt) : Number.NaN;
      if (!Number.isNaN(nextTickAt) && nextTickAt > Date.now()) {
        return session;
      }

      session.timerState.nextTickAt = new Date(Date.now() + session.timerState.intervalMs).toISOString();
      session.updatedAt = new Date().toISOString();
      await this.store.replaceSession(session);
      this.publishSession(session, []);
      if (this.scheduler) {
        this.scheduler.requestTick(sessionId, reason);
      } else {
        shouldProcessImmediately = true;
      }
      return session;
    });

    if (shouldProcessImmediately) {
      await this.processTick(sessionId, reason);
      return this.getSession(sessionId);
    }

    return session;
  }

  async processTick(sessionId: string, reason: string): Promise<void> {
    this.activeTicks.add(sessionId);
    try {
      await this.locks.runExclusive(sessionId, async () => {
        const session = await this.getSessionRecord(sessionId);
        if (session.status !== "active") {
          return;
        }
        const config = session.llmConfigSnapshot ?? await this.store.getConfig();
        const now = new Date().toISOString();
        const queuedPlayerMessages = [...session.timerState.queuedPlayerMessages];
        const queuedReasons = [...session.timerState.queuedReasons];
        session.timerState.pendingWaits = [];
        session.timerState.inFlight = true;
        session.timerState.queuedReasons = queuedReasons;
        session.timerState.queuedPlayerMessages = queuedPlayerMessages;
        const tickStartEvent = {
          type: "system.tick_started" as const,
          source: "system" as const,
          createdAt: now,
          payload: {
            reason
          }
        };
        try {
          const currentEvents = await this.getAllEvents(session);
          const contextBundle = this.memoryContextAssembler.assemble(session, currentEvents, reason);
          session.updatedAt = now;
          const startEvents = await this.store.appendEvents(sessionId, session.lastSeq, [tickStartEvent]);
          const turnId = `tick_${startEvents[0]?.seq ?? session.lastSeq + 1}`;
          session.lastSeq += startEvents.length;
          await this.store.replaceSession(session);
          this.publishSession(session, startEvents);
          this.publishPreviewEvent(sessionId, "llm.turn.started", {
            turnId,
            model: config.model
          });

          const result = await this.orchestrator.runTick(session, reason, contextBundle, config, {
            turnId,
            onPreviewEvent: (event) => {
              this.publishPreviewEvent(sessionId, event.type, event.payload);
            }
          });
          session.timerState.queuedReasons = [];
          session.timerState.queuedPlayerMessages = [];
          const tickCompletedAt = new Date().toISOString();
          const tickEndEvent = {
            type: "system.tick_completed" as const,
            source: "system" as const,
            createdAt: tickCompletedAt,
            payload: {
              reason,
              status: session.status as Session["status"]
            }
          };
          session.timerState.inFlight = false;
          session.timerState.nextTickAt = session.timerState.enabled
            ? new Date(Date.parse(tickCompletedAt) + session.timerState.intervalMs).toISOString()
            : undefined;
          session.updatedAt = tickCompletedAt;
          const events = await this.store.appendEvents(sessionId, session.lastSeq, [...result.events, tickEndEvent]);
          session.lastSeq += events.length;
          await this.store.replaceSession(session);
          this.clearPreviewSnapshot(sessionId);
          this.publishSession(session, events);
          void this.refreshMemory(sessionId);
          if (result.usageCalls.length > 0) {
            this.channel.publish({
              type: "usage.updated",
              sessionId,
              payload: {
                usageTotals: session.usageTotals,
                recentCalls: result.usageCalls
              }
            });
          }
        } catch (error) {
          const failedAt = new Date().toISOString();
          const message = formatRuntimeError(error);
          console.error(`Tick failed for session ${sessionId}`, error);
          this.publishPreviewEvent(sessionId, "llm.turn.failed", {
            turnId: `tick_${session.lastSeq}`,
            message
          });
          session.timerState.inFlight = false;
          session.timerState.nextTickAt = session.timerState.enabled
            ? new Date(Date.parse(failedAt) + session.timerState.intervalMs).toISOString()
            : undefined;
          session.updatedAt = failedAt;
          const events = await this.store.appendEvents(sessionId, session.lastSeq, [
            {
              type: "system.tick_failed",
              source: "system",
              createdAt: failedAt,
              payload: {
                reason,
                message,
                retryable: true
              }
            }
          ]);
          session.lastSeq += events.length;
          await this.store.replaceSession(session);
          this.clearPreviewSnapshot(sessionId);
          this.publishSession(session, events);
        }
        this.scheduler?.syncSession(session);
      });
    } finally {
      this.activeTicks.delete(sessionId);
    }
  }

  private async reconcileStaleTick(sessionId: string): Promise<void> {
    if (this.activeTicks.has(sessionId)) {
      return;
    }
    await this.locks.runExclusive(sessionId, async () => {
      if (this.activeTicks.has(sessionId)) {
        return;
      }
      const session = await this.store.getSession(sessionId);
      if (!session) {
        return;
      }
      if (!session.timerState.inFlight) {
        return;
      }
      const events = await this.store.getEvents(sessionId, undefined, Math.max(200, session.lastSeq + 50));
      let unfinishedTick: SessionEvent | null = null;
      for (const event of events) {
        if (event.type === "system.tick_started") {
          unfinishedTick = event;
          continue;
        }
        if (
          event.type === "system.tick_completed" ||
          event.type === "system.tick_failed" ||
          event.type === "system.story_ended"
        ) {
          unfinishedTick = null;
        }
      }
      if (!unfinishedTick) {
        return;
      }

      const now = new Date().toISOString();
      session.timerState.inFlight = false;
      session.timerState.nextTickAt = session.timerState.enabled
        ? new Date(Date.now() + session.timerState.intervalMs).toISOString()
        : undefined;
      session.updatedAt = now;
      const recoveredEvents = await this.store.appendEvents(sessionId, session.lastSeq, [
        {
          type: "system.tick_failed",
          source: "system",
          createdAt: now,
          payload: {
            reason: typeof unfinishedTick.payload.reason === "string" ? unfinishedTick.payload.reason : "interrupted",
            message: "上一次推演在服务中断后未完成，已标记为失败。",
            retryable: true
          }
        }
      ]);
      session.lastSeq += recoveredEvents.length;
      await this.store.replaceSession(session);
      this.publishSession(session, recoveredEvents);
    });
  }

  private publishSession(session: Session, appendedEvents: SessionEvent[]): void {
    this.channel.publish({
      type: "session.updated",
      sessionId: session.id,
      payload: {
        session
      }
    });
    for (const event of appendedEvents) {
      this.channel.publish({
        type: "event.appended",
        sessionId: session.id,
        payload: {
          event
        }
      });
    }
  }

  private publishPreviewEvent(sessionId: string, type: SseEvent["type"], payload: Record<string, unknown>): void {
    const next = applyPreviewSnapshotEvent(this.previewSnapshots.get(sessionId) ?? null, type, payload);
    if (next) {
      this.previewSnapshots.set(sessionId, next);
    } else {
      this.previewSnapshots.delete(sessionId);
    }
    this.channel.publish({
      type,
      sessionId,
      payload
    });
  }

  private clearPreviewSnapshot(sessionId: string): void {
    this.previewSnapshots.delete(sessionId);
  }

  private async getAllEvents(session: Session): Promise<SessionEvent[]> {
    return this.store.getEvents(session.id, undefined, Math.max(200, session.lastSeq + 50));
  }

  private async getSessionRecord(sessionId: string): Promise<Session> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new HttpError(404, "Session not found");
    }
    return session;
  }

  private async refreshMemory(sessionId: string): Promise<void> {
    await this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSessionRecord(sessionId);
      if (session.status !== "active" && session.status !== "ended") {
        return;
      }
      const events = await this.getAllEvents(session);
      const config = session.llmConfigSnapshot ?? await this.store.getConfig();
      try {
        const changed = await this.memoryService.refreshSessionMemory(session, events, config);
        if (!changed) {
          return;
        }
      } catch (error) {
        console.error(`Memory refresh failed for session ${sessionId}`, error);
        this.memoryService.markRefreshFailure(session, error);
      }
      session.updatedAt = new Date().toISOString();
      await this.store.replaceSession(session);
      this.publishSession(session, []);
    });
  }
}
