import {
  createEmptyUsageStats,
  defaultPromptVersions,
  sessionDraftSchema,
  storyStateSchema,
  timerUpdateSchema,
  type LlmConfig,
  type Session,
  type SessionDraft,
  type SessionEvent,
  type SessionSnapshot,
  type UpdateDraftRequest
} from "@dglab-ai/shared";
import { HttpError } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import { LockManager } from "../lib/locks.js";
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

export class SessionService {
  private readonly locks = new LockManager();
  private scheduler?: SchedulerLike;

  constructor(
    private readonly store: SessionStore,
    private readonly channel: ChannelAdapter,
    private readonly orchestrator: OrchestratorService,
    private readonly prompts: PromptTemplateService
  ) {}

  attachScheduler(scheduler: SchedulerLike): void {
    this.scheduler = scheduler;
  }

  listSessions() {
    return this.store.listSessions();
  }

  async getSession(sessionId: string): Promise<Session> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new HttpError(404, "Session not found");
    }
    return session;
  }

  async getEvents(sessionId: string, cursor?: number, limit?: number): Promise<SessionEvent[]> {
    await this.getSession(sessionId);
    return this.store.getEvents(sessionId, cursor, limit);
  }

  listSchedulableSessions(): Promise<Session[]> {
    return this.store.listSchedulableSessions();
  }

  async createDraft(playerBrief: string): Promise<Session> {
    const config = await this.store.getConfig();
    const draft = sessionDraftSchema.parse(await this.orchestrator.generateDraft(playerBrief, config));
    const now = new Date().toISOString();
    const session: Session = {
      id: createId("session"),
      status: "draft",
      title: draft.title,
      initialPrompt: playerBrief,
      draft,
      confirmedSetup: null,
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
      timerState: {
        enabled: false,
        intervalMs: 10000,
        queuedReasons: [],
        queuedPlayerMessages: [],
        pendingWaits: []
      },
      usageTotals: createEmptyUsageStats(),
      createdAt: now,
      updatedAt: now,
      lastSeq: 0,
      lastSnapshotSeq: 0
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
      const session = await this.getSession(sessionId);
      if (session.status !== "draft") {
        throw new HttpError(400, "Only draft sessions can be edited");
      }
      session.draft = sessionDraftSchema.parse({
        ...session.draft,
        ...patch
      });
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

  async confirmSession(sessionId: string): Promise<Session> {
    return this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSession(sessionId);
      if (session.status !== "draft") {
        throw new HttpError(400, "Session is already confirmed");
      }
      const config = await this.store.getConfig();
      const versions = this.prompts.versions();
      session.status = "active";
      session.confirmedSetup = session.draft;
      session.llmConfigSnapshot = config;
      session.promptVersions = {
        ...defaultPromptVersions(),
        sharedSafety: versions.shared_safety_preamble ?? "1.1.0",
        toolContract: versions.tool_contract ?? "2.2.0",
        worldBuilder: versions.world_builder ?? "1.1.0",
        directorAgent: versions.director_agent ?? "1.1.0",
        supportAgent: versions.support_agent ?? "1.1.0",
        ensembleTurn: versions.ensemble_turn ?? "1.1.0",
        sceneSummarizer: versions.scene_summarizer ?? "1.1.0"
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
        }
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
    return this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSession(sessionId);
      if (session.status !== "active") {
        throw new HttpError(400, "Session is not active");
      }
      const now = new Date().toISOString();
      session.storyState.lastPlayerMessageAt = now;
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
      const session = await this.getSession(sessionId);
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

  async processTick(sessionId: string, reason: string): Promise<void> {
    await this.locks.runExclusive(sessionId, async () => {
      const session = await this.getSession(sessionId);
      if (session.status !== "active") {
        return;
      }
      const config = session.llmConfigSnapshot ?? await this.store.getConfig();
      const now = new Date().toISOString();
      const queuedPlayerMessages = [...session.timerState.queuedPlayerMessages];
      const queuedReasons = [...session.timerState.queuedReasons];
      session.timerState.pendingWaits = [];
      session.timerState.queuedReasons = queuedReasons;
      session.timerState.queuedPlayerMessages = queuedPlayerMessages;
      session.timerState.nextTickAt = session.timerState.enabled
        ? new Date(Date.now() + session.timerState.intervalMs).toISOString()
        : undefined;
      const tickStartEvent = {
        type: "system.tick_started" as const,
        source: "system" as const,
        createdAt: now,
        payload: {
          reason
        }
      };
      const currentEvents = await this.store.getEvents(sessionId, Math.max(0, session.lastSeq - 30), 40);
      const result = await this.orchestrator.runTick(session, reason, currentEvents, config);
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
      session.updatedAt = tickCompletedAt;
      const events = await this.store.appendEvents(sessionId, session.lastSeq, [
        tickStartEvent,
        ...result.events,
        tickEndEvent
      ]);
      session.lastSeq += events.length;
      await this.store.replaceSession(session);
      this.publishSession(session, events);
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
      const storyEnded = result.events.some((event) => event.type === "system.story_ended")
        || (session.status as string) === "ended";
      if (session.lastSeq - session.lastSnapshotSeq >= 12 || storyEnded) {
        const summary = await this.orchestrator.summarizeScene(session, config);
        const snapshot: SessionSnapshot = {
          sessionId,
          seq: session.lastSeq,
          storyState: session.storyState,
          agentStates: session.agentStates,
          recentSummary: summary.recentSummary,
          timerState: session.timerState,
          usageTotals: session.usageTotals,
          promptVersions: session.promptVersions,
          llmConfigSnapshot: session.llmConfigSnapshot,
          createdAt: new Date().toISOString()
        };
        await this.store.createSnapshot(snapshot);
        session.lastSnapshotSeq = session.lastSeq;
        await this.store.replaceSession(session);
      }
      this.scheduler?.syncSession(session);
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
}
