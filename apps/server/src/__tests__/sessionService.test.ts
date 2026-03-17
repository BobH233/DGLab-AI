import { createEmptyMemoryState, createEmptyUsageStats, defaultToolStates, normalizeAppConfig, type AppConfig, type LlmConfig, type Session, type SessionEvent } from "@dglab-ai/shared";
import { describe, expect, it, vi } from "vitest";
import { SessionService } from "../services/SessionService.js";

const config: LlmConfig = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test",
  model: "test-model",
  temperature: 0.7,
  maxTokens: 500,
  topP: 1,
  requestTimeoutMs: 1000,
  toolStates: defaultToolStates()
};

function createSession(): Session {
  return {
    id: "session_test",
    status: "active",
    title: "Test",
    initialPrompt: "brief",
    draft: {
      title: "Test",
      playerBrief: "brief",
      worldSummary: "world",
      openingSituation: "opening",
      playerState: "player state",
      suggestedPace: "slow burn",
      safetyFrame: "fiction only",
      agents: [
        {
          id: "director",
          name: "Director",
          role: "director",
          summary: "summary",
          persona: "persona",
          goals: ["goal"],
          style: ["calm"],
          boundaries: [],
          sortOrder: 0
        }
      ],
      sceneGoals: [],
      contentNotes: []
    },
    confirmedSetup: null,
    storyState: {
      location: "room",
      phase: "opening",
      tension: 3,
      summary: "summary",
      activeObjectives: []
    },
    agentStates: {
      director: {
        mood: "focused",
        intent: "observe"
      }
    },
    memoryState: createEmptyMemoryState(),
    timerState: {
      enabled: false,
      intervalMs: 10000,
      inFlight: false,
      queuedReasons: ["player_message"],
      queuedPlayerMessages: ["你好"],
      pendingWaits: []
    },
    usageTotals: createEmptyUsageStats(),
    llmConfigSnapshot: config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeq: 0
  };
}

class InMemoryStore {
  public session = createSession();
  public events: SessionEvent[] = [];
  public appConfig: AppConfig = normalizeAppConfig(config);

  async init() {}
  async getConfig() { return config; }
  async saveConfig(next: LlmConfig) { return next; }
  async getAppConfig() { return this.appConfig; }
  async saveAppConfig(next: AppConfig) {
    this.appConfig = next;
    return next;
  }
  async listSessions() { return []; }
  async createSession(session: Session) { this.session = session; return session; }
  async getSession(sessionId: string) { return sessionId === this.session.id ? this.session : null; }
  async replaceSession(session: Session) { this.session = session; }
  async appendEvents(sessionId: string, startSeq: number, events: Array<Omit<SessionEvent, "seq" | "sessionId">>) {
    const documents = events.map((event, index) => ({
      ...event,
      sessionId,
      seq: startSeq + index + 1
    }));
    this.events.push(...documents);
    return documents;
  }
  async getEvents() { return this.events; }
  async listSchedulableSessions() { return [this.session]; }
}

describe("SessionService", () => {
  it("publishes tick_started before waiting for the model response", async () => {
    let finishTick!: () => void;
    const pendingTick = new Promise<{ events: SessionEvent[]; usageCalls: [] }>((resolve) => {
      finishTick = () => resolve({ events: [], usageCalls: [] });
    });
    const store = new InMemoryStore();
    const channel = {
      publish: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      normalizeInbound: vi.fn()
    };
    const orchestrator = {
      generateDraft: vi.fn(),
      summarizeScene: vi.fn(),
      runTick: vi.fn(() => pendingTick)
    };
    const prompts = {
      getTemplate: vi.fn(),
      render: vi.fn(),
      versions: vi.fn(() => ({}))
    };
    const memoryService = {
      refreshSessionMemory: vi.fn(),
      markRefreshFailure: vi.fn()
    };
    const memoryContextAssembler = {
      assemble: vi.fn(() => ({
        coreState: {
          sessionDraft: "{}",
          storyState: "{}",
          agentStates: "{}"
        },
        archiveBlock: "",
        episodeBlocks: [],
        turnSummaryBlocks: [],
        recentRawTurns: [],
        recentRawTurnsBlock: "",
        playerMessagesBlock: "",
        tickContextBlock: "{}",
        stats: {
          charCounts: {
            archive: 0,
            episodes: 0,
            turns: 0,
            rawTurns: 0,
            playerMessages: 0,
            tickContext: 0,
            coreState: 0
          },
          droppedBlocks: [],
          rawTurnsIncluded: 0,
          episodeCountIncluded: 0,
          turnSummaryCountIncluded: 0,
          usedFallback: false
        }
      }))
    };
    const service = new SessionService(
      store as never,
      channel as never,
      orchestrator as never,
      prompts as never,
      memoryService as never,
      memoryContextAssembler as never
    );

    const processing = service.processTick("session_test", "player_message");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.events.map((event) => event.type)).toEqual(["system.tick_started"]);
    expect(channel.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "event.appended",
      payload: {
        event: expect.objectContaining({
          type: "system.tick_started"
        })
      }
    }));

    finishTick();
    await processing;

    expect(store.events.map((event) => event.type)).toEqual(["system.tick_started", "system.tick_completed"]);
  });

  it("records a retryable failure event when a tick crashes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = new InMemoryStore();
    const channel = {
      publish: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      normalizeInbound: vi.fn()
    };
    const orchestrator = {
      generateDraft: vi.fn(),
      summarizeScene: vi.fn(),
      runTick: vi.fn(async () => {
        throw new Error("Provider returned non-JSON content");
      })
    };
    const prompts = {
      getTemplate: vi.fn(),
      render: vi.fn(),
      versions: vi.fn(() => ({}))
    };
    const memoryService = {
      refreshSessionMemory: vi.fn(),
      markRefreshFailure: vi.fn()
    };
    const memoryContextAssembler = {
      assemble: vi.fn(() => ({
        coreState: {
          sessionDraft: "{}",
          storyState: "{}",
          agentStates: "{}"
        },
        archiveBlock: "",
        episodeBlocks: [],
        turnSummaryBlocks: [],
        recentRawTurns: [],
        recentRawTurnsBlock: "",
        playerMessagesBlock: "",
        tickContextBlock: "{}",
        stats: {
          charCounts: {
            archive: 0,
            episodes: 0,
            turns: 0,
            rawTurns: 0,
            playerMessages: 0,
            tickContext: 0,
            coreState: 0
          },
          droppedBlocks: [],
          rawTurnsIncluded: 0,
          episodeCountIncluded: 0,
          turnSummaryCountIncluded: 0,
          usedFallback: false
        }
      }))
    };
    const service = new SessionService(
      store as never,
      channel as never,
      orchestrator as never,
      prompts as never,
      memoryService as never,
      memoryContextAssembler as never
    );

    await expect(service.processTick("session_test", "player_message")).resolves.toBeUndefined();

    expect(store.events.map((event) => event.type)).toEqual(["system.tick_started", "system.tick_failed"]);
    expect(store.events[1]?.payload).toMatchObject({
      reason: "player_message",
      message: "Provider returned non-JSON content",
      retryable: true
    });
    expect(store.session.timerState.queuedReasons).toEqual(["player_message"]);
    expect(store.session.timerState.queuedPlayerMessages).toEqual(["你好"]);
    expect(store.session.lastSeq).toBe(2);
    errorSpy.mockRestore();
  });

  it("schedules the next auto tick from completion time, not tick start", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));

    const store = new InMemoryStore();
    store.session.timerState.enabled = true;
    store.session.timerState.inFlight = true;
    store.session.timerState.intervalMs = 10000;
    const channel = {
      publish: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      normalizeInbound: vi.fn()
    };
    const orchestrator = {
      generateDraft: vi.fn(),
      summarizeScene: vi.fn(),
      runTick: vi.fn(async () => {
        vi.setSystemTime(new Date("2026-03-17T12:00:15.000Z"));
        return {
          events: [],
          usageCalls: []
        };
      })
    };
    const prompts = {
      getTemplate: vi.fn(),
      render: vi.fn(),
      versions: vi.fn(() => ({}))
    };
    const memoryService = {
      refreshSessionMemory: vi.fn(),
      markRefreshFailure: vi.fn()
    };
    const memoryContextAssembler = {
      assemble: vi.fn(() => ({
        coreState: {
          sessionDraft: "{}",
          storyState: "{}",
          agentStates: "{}"
        },
        archiveBlock: "",
        episodeBlocks: [],
        turnSummaryBlocks: [],
        recentRawTurns: [],
        recentRawTurnsBlock: "",
        playerMessagesBlock: "",
        tickContextBlock: "{}",
        stats: {
          charCounts: {
            archive: 0,
            episodes: 0,
            turns: 0,
            rawTurns: 0,
            playerMessages: 0,
            tickContext: 0,
            coreState: 0
          },
          droppedBlocks: [],
          rawTurnsIncluded: 0,
          episodeCountIncluded: 0,
          turnSummaryCountIncluded: 0,
          usedFallback: false
        }
      }))
    };
    const service = new SessionService(
      store as never,
      channel as never,
      orchestrator as never,
      prompts as never,
      memoryService as never,
      memoryContextAssembler as never
    );

    await expect(service.processTick("session_test", "timer_interval:frontend")).resolves.toBeUndefined();

    expect(store.session.timerState.nextTickAt).toBe("2026-03-17T12:00:25.000Z");
    vi.useRealTimers();
  });

  it("reconciles a stale tick_started after restart so the UI does not stay in thinking state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));

    const store = new InMemoryStore();
    store.session.timerState.enabled = true;
    store.session.timerState.inFlight = true;
    store.session.timerState.intervalMs = 10000;
    store.events = [
      {
        sessionId: "session_test",
        seq: 1,
        type: "system.tick_started",
        source: "system",
        createdAt: "2026-03-17T11:59:40.000Z",
        payload: {
          reason: "timer_interval:frontend"
        }
      }
    ];
    store.session.lastSeq = 1;

    const channel = {
      publish: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      normalizeInbound: vi.fn()
    };
    const orchestrator = {
      generateDraft: vi.fn(),
      summarizeScene: vi.fn(),
      runTick: vi.fn()
    };
    const prompts = {
      getTemplate: vi.fn(),
      render: vi.fn(),
      versions: vi.fn(() => ({}))
    };
    const memoryService = {
      refreshSessionMemory: vi.fn(),
      markRefreshFailure: vi.fn()
    };
    const memoryContextAssembler = {
      assemble: vi.fn()
    };
    const service = new SessionService(
      store as never,
      channel as never,
      orchestrator as never,
      prompts as never,
      memoryService as never,
      memoryContextAssembler as never
    );

    const session = await service.getSession("session_test");

    expect(session.lastSeq).toBe(2);
    expect(store.events.map((event) => event.type)).toEqual(["system.tick_started", "system.tick_failed"]);
    expect(store.events[1]?.payload).toMatchObject({
      reason: "timer_interval:frontend",
      retryable: true
    });
    expect(store.session.timerState.nextTickAt).toBe("2026-03-17T12:00:10.000Z");
    vi.useRealTimers();
  });

  it("queues a manual retry through the scheduler when requested", async () => {
    const store = new InMemoryStore();
    const channel = {
      publish: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      normalizeInbound: vi.fn()
    };
    const orchestrator = {
      generateDraft: vi.fn(),
      summarizeScene: vi.fn(),
      runTick: vi.fn()
    };
    const prompts = {
      getTemplate: vi.fn(),
      render: vi.fn(),
      versions: vi.fn(() => ({}))
    };
    const memoryService = {
      refreshSessionMemory: vi.fn(),
      markRefreshFailure: vi.fn()
    };
    const memoryContextAssembler = {
      assemble: vi.fn()
    };
    const service = new SessionService(
      store as never,
      channel as never,
      orchestrator as never,
      prompts as never,
      memoryService as never,
      memoryContextAssembler as never
    );
    const scheduler = {
      syncSession: vi.fn(),
      requestTick: vi.fn()
    };
    service.attachScheduler(scheduler);

    const session = await service.retrySession("session_test");

    expect(session.id).toBe("session_test");
    expect(scheduler.requestTick).toHaveBeenCalledWith("session_test", "manual_retry");
  });

  it("claims a due auto tick from the frontend and queues processing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));

    const store = new InMemoryStore();
    store.session.timerState.enabled = true;
    store.session.timerState.intervalMs = 5000;
    store.session.timerState.nextTickAt = "2026-03-17T11:59:59.000Z";
    const channel = {
      publish: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      normalizeInbound: vi.fn()
    };
    const orchestrator = {
      generateDraft: vi.fn(),
      summarizeScene: vi.fn(),
      runTick: vi.fn()
    };
    const prompts = {
      getTemplate: vi.fn(),
      render: vi.fn(),
      versions: vi.fn(() => ({}))
    };
    const memoryService = {
      refreshSessionMemory: vi.fn(),
      markRefreshFailure: vi.fn()
    };
    const memoryContextAssembler = {
      assemble: vi.fn()
    };
    const service = new SessionService(
      store as never,
      channel as never,
      orchestrator as never,
      prompts as never,
      memoryService as never,
      memoryContextAssembler as never
    );
    const scheduler = {
      syncSession: vi.fn(),
      requestTick: vi.fn()
    };
    service.attachScheduler(scheduler);

    const session = await service.requestAutoTick("session_test");

    expect(session.id).toBe("session_test");
    expect(store.session.timerState.nextTickAt).toBe("2026-03-17T12:00:05.000Z");
    expect(scheduler.requestTick).toHaveBeenCalledWith("session_test", "timer_interval:frontend");
    expect(channel.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "session.updated",
      sessionId: "session_test",
      payload: {
        session: expect.objectContaining({
          timerState: expect.objectContaining({
            nextTickAt: "2026-03-17T12:00:05.000Z"
          })
        })
      }
    }));

    vi.useRealTimers();
  });

  it("does not queue another auto tick while the same session is already in flight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));

    const store = new InMemoryStore();
    store.session.timerState.enabled = true;
    store.session.timerState.inFlight = true;
    store.session.timerState.intervalMs = 5000;
    store.session.timerState.nextTickAt = "2026-03-17T11:59:59.000Z";
    const channel = {
      publish: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      normalizeInbound: vi.fn()
    };
    const orchestrator = {
      generateDraft: vi.fn(),
      summarizeScene: vi.fn(),
      runTick: vi.fn()
    };
    const prompts = {
      getTemplate: vi.fn(),
      render: vi.fn(),
      versions: vi.fn(() => ({}))
    };
    const memoryService = {
      refreshSessionMemory: vi.fn(),
      markRefreshFailure: vi.fn()
    };
    const memoryContextAssembler = {
      assemble: vi.fn()
    };
    const service = new SessionService(
      store as never,
      channel as never,
      orchestrator as never,
      prompts as never,
      memoryService as never,
      memoryContextAssembler as never
    );
    const scheduler = {
      syncSession: vi.fn(),
      requestTick: vi.fn()
    };
    service.attachScheduler(scheduler);

    const session = await service.requestAutoTick("session_test");

    expect(session.timerState.inFlight).toBe(true);
    expect(scheduler.requestTick).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
