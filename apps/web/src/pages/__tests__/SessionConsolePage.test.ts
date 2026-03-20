import { flushPromises, mount } from "@vue/test-utils";
import type { Session, SessionEvent } from "@dglab-ai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionConsolePage from "../SessionConsolePage.vue";

const apiMocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Session>>(),
  getEvents: vi.fn<() => Promise<SessionEvent[]>>(),
  streamUrl: vi.fn(() => "http://example.test/stream"),
  postMessage: vi.fn(),
  retrySession: vi.fn(),
  updateTimer: vi.fn(),
  requestAutoTick: vi.fn<() => Promise<Session>>()
}));

vi.mock("../../api", () => ({
  api: {
    getSession: apiMocks.getSession,
    getEvents: apiMocks.getEvents,
    streamUrl: apiMocks.streamUrl,
    postMessage: apiMocks.postMessage,
    retrySession: apiMocks.retrySession,
    updateTimer: apiMocks.updateTimer,
    requestAutoTick: apiMocks.requestAutoTick
  }
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: {
      id: "session_1"
    }
  })
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(_url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, payload: Record<string, unknown>) {
    const listeners = this.listeners.get(type) ?? [];
    const event = {
      data: JSON.stringify(payload)
    } as MessageEvent;
    for (const listener of listeners) {
      listener(event);
    }
  }

  close() {}
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session_1",
    status: "active",
    title: "测试会话",
    initialPrompt: "brief",
    draft: {
      title: "测试会话",
      playerBrief: "brief",
      worldSummary: "world",
      openingSituation: "opening",
      playerState: "player",
      initialPlayerBodyItemState: ["你现在戴着一副眼罩"],
      suggestedPace: "slow",
      safetyFrame: "fiction",
      agents: [],
      sceneGoals: [],
      contentNotes: []
    },
    confirmedSetup: null,
    playerBodyItemState: ["你现在戴着一副眼罩"],
    storyState: {
      location: "study",
      phase: "teasing",
      tension: 6,
      summary: "场景摘要",
      activeObjectives: []
    },
    agentStates: {},
    memoryState: {
      version: 1,
      lastProcessedSeq: 0,
      policy: {
        rawTurnsToKeep: 2,
        turnsPerEpisode: 4,
        maxTurnSummariesBeforeMerge: 6,
        maxEpisodeSummaries: 6,
        archiveCharBudget: 1200,
        episodeCharBudget: 1800,
        turnCharBudget: 1800,
        rawEventCharBudget: 3500
      },
      archiveSummary: null,
      episodeSummaries: [],
      turnSummaries: [],
      debug: {
        lastRefreshStatus: "idle",
        lastRefreshError: null,
        lastCompactionAt: null,
        lastCompactionMode: null,
        recentRuns: []
      }
    },
    timerState: {
      enabled: true,
      intervalMs: 5000,
      inFlight: false,
      nextTickAt: "2026-03-17T12:00:05.000Z",
      queuedReasons: [],
      queuedPlayerMessages: [],
      pendingWaits: []
    },
    usageTotals: {
      session: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        calls: 0
      },
      byAgent: {},
      byCall: []
    },
    createdAt: "2026-03-17T12:00:00.000Z",
    updatedAt: "2026-03-17T12:00:00.000Z",
    lastSeq: 0,
    ...overrides
  };
}

function normalizedText(wrapper: ReturnType<typeof mount>): string {
  return wrapper.text().replace(/\s+/g, " ").trim();
}

describe("SessionConsolePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
    vi.resetAllMocks();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    apiMocks.getEvents.mockResolvedValue([]);
    apiMocks.requestAutoTick.mockResolvedValue(createSession({
      timerState: {
        enabled: true,
        intervalMs: 5000,
        inFlight: false,
        nextTickAt: "2026-03-17T12:00:05.000Z",
        queuedReasons: [],
        queuedPlayerMessages: [],
        pendingWaits: []
      }
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the auto-advance countdown in the automation panel", async () => {
    apiMocks.getSession.mockResolvedValue(createSession());

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("约 5.0 秒 后自动推进");
    expect(normalizedText(wrapper)).toContain("下一次计划触发时间");
    expect(normalizedText(wrapper)).toContain("玩家身体道具");
    expect(normalizedText(wrapper)).toContain("你现在戴着一副眼罩");
  });

  it("strips inline delay tags from the session summary header", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      storyState: {
        location: "study",
        phase: "teasing",
        tension: 6,
        summary: "先别急。<delay>800</delay>抬头看我。",
        activeObjectives: []
      }
    }));

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("先别急。抬头看我。");
    expect(normalizedText(wrapper)).not.toContain("<delay>");
  });

  it("explains that auto-advance will defer while the current tick is still running", async () => {
    apiMocks.getSession.mockResolvedValue(createSession());
    apiMocks.getEvents.mockResolvedValue([
      {
        sessionId: "session_1",
        seq: 1,
        type: "system.tick_started",
        source: "system",
        createdAt: "2026-03-17T12:00:00.000Z",
        payload: {
          reason: "player_message"
        }
      }
    ]);

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("Thinking");
    expect(normalizedText(wrapper)).toContain("约 5.0 秒 后自动推进");
    expect(normalizedText(wrapper)).toContain("如果计时到点，会顺延 5.0 秒，不会并发触发");
  });

  it("requests an auto tick from the frontend when the countdown is due", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      timerState: {
        enabled: true,
        intervalMs: 5000,
        inFlight: false,
        nextTickAt: "2026-03-17T11:59:59.000Z",
        queuedReasons: [],
        queuedPlayerMessages: [],
        pendingWaits: []
      }
    }));

    mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();
    await vi.advanceTimersByTimeAsync(300);

    expect(apiMocks.requestAutoTick).toHaveBeenCalledWith("session_1", undefined);
  });

  it("subscribes to the stream before initial data finishes loading so the first preview is not missed", async () => {
    let resolveSession!: (value: Session) => void;
    let resolveEvents!: (value: SessionEvent[]) => void;
    apiMocks.getSession.mockImplementation(() => new Promise((resolve) => {
      resolveSession = resolve;
    }));
    apiMocks.getEvents.mockImplementation(() => new Promise((resolve) => {
      resolveEvents = resolve;
    }));

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0]?.emit("llm.turn.started", {
      turnId: "tick_1",
      model: "gpt-5.4"
    });
    FakeEventSource.instances[0]?.emit("llm.action.meta", {
      turnId: "tick_1",
      index: 0,
      actorAgentId: "director_1",
      tool: "speak_to_player",
      targetScope: "player"
    });
    FakeEventSource.instances[0]?.emit("llm.action.text.delta", {
      turnId: "tick_1",
      index: 0,
      path: "args.message",
      delta: "先看着我。"
    });

    resolveSession(createSession({
      confirmedSetup: {
        ...createSession().draft,
        agents: [
          {
            id: "director_1",
            name: "珊瑚宫心海",
            role: "director",
            summary: "主导者",
            persona: "冷静",
            goals: ["推进"],
            style: [],
            boundaries: [],
            sortOrder: 0
          }
        ]
      }
    }));
    resolveEvents([]);

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("正在思考中");
    expect(normalizedText(wrapper)).toContain("先看着我。");
    expect(normalizedText(wrapper)).toContain("对你说");
  });

  it("restores an in-flight preview snapshot after reconnect", async () => {
    apiMocks.getSession.mockResolvedValue(createSession({
      confirmedSetup: {
        ...createSession().draft,
        agents: [
          {
            id: "director_1",
            name: "珊瑚宫心海",
            role: "director",
            summary: "主导者",
            persona: "冷静",
            goals: ["推进"],
            style: [],
            boundaries: [],
            sortOrder: 0
          }
        ]
      }
    }));

    const wrapper = mount(SessionConsolePage, {
      global: {
        stubs: {
          RouterLink: {
            template: "<a><slot /></a>"
          }
        }
      }
    });

    await flushPromises();

    FakeEventSource.instances[0]?.emit("llm.preview.snapshot", {
      previewTurn: {
        turnId: "tick_1",
        status: "streaming",
        model: "gpt-5.4",
        actions: [
          {
            index: 0,
            actorAgentId: "director_1",
            tool: "speak_to_player",
            targetScope: "player",
            textByPath: {
              "args.message": {
                visibleSegments: [
                  {
                    type: "text",
                    text: "刷新后也能接着看。"
                  }
                ],
                pendingBuffer: ""
              }
            },
            valueByPath: {},
            completedFields: [],
            completed: false
          }
        ]
      }
    });

    await flushPromises();

    expect(normalizedText(wrapper)).toContain("正在思考中");
    expect(normalizedText(wrapper)).toContain("刷新后也能接着看。");
    expect(normalizedText(wrapper)).toContain("对你说");
  });
});
